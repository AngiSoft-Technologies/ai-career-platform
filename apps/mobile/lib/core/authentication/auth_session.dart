import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';

import '../configuration/app_settings.dart';
import '../networking/api_client.dart';
import '../networking/api_exception.dart';
import 'api_auth_service.dart';
import 'biometric_service.dart';
import 'token_storage.dart';

enum SessionState { signedOut, demo, authenticated }

class AuthSession extends ChangeNotifier {
  AuthSession({
    required ApiAuthService authService,
    required TokenStorage tokenStorage,
    required ApiClient apiClient,
    required AppSettings settings,
    BiometricService? biometricService,
  }) : _authService = authService,
       _tokenStorage = tokenStorage,
       _apiClient = apiClient,
       _settings = settings,
       _biometrics = biometricService ?? BiometricService() {
    _apiClient.onVerificationRequired = _markVerificationRequired;
    _apiClient.onUnauthorized = forceSignOut;
  }

  /// Called when any request discovers a revoked session. The app uses this
  /// to unregister push devices and purge local caches for shared-device
  /// safety; it may be async and is deliberately fire-and-forget here.
  Future<void> Function()? onSignedOut;

  /// Called only for a server-verified revocation, so the UI can show a
  /// "session ended" message rather than silently landing on sign-in.
  void Function()? onSessionRevoked;

  final ApiAuthService _authService;
  final TokenStorage _tokenStorage;
  final ApiClient _apiClient;
  final AppSettings _settings;
  final BiometricService _biometrics;

  SessionState _state = SessionState.signedOut;
  String _name = '';
  String _email = '';
  List<String> _roles = const [];
  List<String> _permissions = const [];

  /// True until the candidate finishes the resume-onboarding flow.
  bool _resumeOnboarded = false;

  /// True while the API is asking for a step-up verification. Long-lived
  /// sessions re-prove themselves on a schedule; the router sends the user
  /// to /verify until one of their methods completes.
  bool _verificationRequired = false;
  List<Map<String, dynamic>> _verificationMethods = const [];

  SessionState get state => _state;
  String get name => _name;
  String get email => _email;
  List<String> get roles => _roles;
  List<String> get permissions => _permissions;
  bool get resumeOnboarded => _resumeOnboarded;
  bool get verificationRequired => _verificationRequired;
  List<Map<String, dynamic>> get verificationMethods => _verificationMethods;
  bool get isSignedIn => _state != SessionState.signedOut;
  bool get isDemoMode => _state == SessionState.demo;
  bool get isAuthenticated => _state == SessionState.authenticated;
  bool get isStaff => _roles.any(
    (r) => const [
      'admin',
      'super_admin',
      'moderator',
      'source_curator',
      'support_agent',
      'analyst',
    ].contains(r),
  );
  bool get isAdmin =>
      _roles.any((r) => const ['admin', 'super_admin'].contains(r));

  Future<void> restore() async {
    final token = await _tokenStorage.readToken();
    if (token == null || token.isEmpty) {
      _state = SessionState.signedOut;
      notifyListeners();
      return;
    }
    _state = SessionState.authenticated;
    try {
      await _loadIdentity();
      await _loadResumeOnboarding();
    } on ApiException catch (error) {
      if (error.isUnauthorized) {
        await _tokenStorage.clearAll();
        _state = SessionState.signedOut;
        return;
      }
      // A transport failure is not a verdict on the session. Keeping the
      // authenticated state lets an offline cold start still read the local
      // cache and replay the outbox; the next successful request revalidates
      // the identity. Escaping here would take the app down before its first
      // frame, because this runs before runApp.
      debugPrint('Session restore deferred: $error');
      _state = SessionState.authenticated;
    } catch (error) {
      debugPrint('Session restore failed: $error');
      // Same reasoning as above: the token is still present, so remain in
      // the cached in state rather than discarding an otherwise valid session.
      _state = token.isEmpty
          ? SessionState.signedOut
          : SessionState.authenticated;
    } finally {
      notifyListeners();
    }
  }

  /// Reads whether the resume-onboarding flow is already done.
  Future<void> _loadResumeOnboarding() async {
    final data = await _apiClient.get<Map<String, dynamic>>(
      '/profile/onboarding',
    );
    _resumeOnboarded = data['completed'] as bool? ?? false;
  }

  /// Called once the candidate finishes the onboarding flow.
  void markResumeOnboarded() {
    if (_resumeOnboarded) return;
    _resumeOnboarded = true;
    notifyListeners();
  }

  Future<void> _loadIdentity() async {
    try {
      final data = await _apiClient.get<Map<String, dynamic>>('/me');
      _name = (data['user']?['name'] as String?) ?? '';
      _email = (data['user']?['email'] as String?) ?? '';
      _roles =
          (data['roles'] as List?)?.map((e) => e.toString()).toList() ??
          const [];
      _permissions =
          (data['permissions'] as List?)?.map((e) => e.toString()).toList() ??
          const [];
    } on ApiException catch (error) {
      if (error.isUnauthorized) {
        await forceSignOut(revoked: true);
      } else if (error.code == 'VERIFICATION_REQUIRED') {
        // The session is still valid; it just needs a step-up proof. Keep
        // the user signed in and let the router show /verify.
        _verificationRequired = true;
        return;
      }
      rethrow;
    }
  }

  void _markVerificationRequired() {
    if (_verificationRequired) return;
    _verificationRequired = true;
    notifyListeners();
  }

  /// Loads the methods the account can verify with (TOTP, email link, …).
  Future<void> loadVerificationMethods() async {
    final token = await _tokenStorage.readToken();
    if (token == null || token.isEmpty) return;
    try {
      _verificationMethods = await _authService.verificationMethods(token);
    } catch (_) {
      _verificationMethods = const [];
    }
    notifyListeners();
  }

  /// Emails a single-use verification link. The API redirects it back to
  /// [kAuthCallbackUri], which the verification screen listens for.
  Future<bool> sendEmailVerification() async {
    final token = await _tokenStorage.readToken();
    if (token == null || token.isEmpty) return false;
    final result = await _authService.requestVerification(
      token: token,
      method: 'email_link',
    );
    return result['sent'] == true;
  }

  /// Verifies a TOTP code, then reloads identity with the cleared flag.
  Future<void> verifyWithTotp(String code) async {
    final token = await _tokenStorage.readToken();
    if (token == null || token.isEmpty) {
      throw const ApiException(statusCode: 401, message: 'You are signed out');
    }
    await _authService.verifyTotp(token: token, code: code);
    await _completeVerification();
  }

  // -------------------------------------------------------------------------
  // Device biometrics (fingerprint / Face ID / etc.)
  // -------------------------------------------------------------------------

  /// True when the device can run a biometric prompt at all.
  Future<bool> get biometricsAvailable => _biometrics.isAvailable();

  /// Names of the modalities the device offers, e.g. "fingerprint".
  Future<List<String>> get biometricLabels => _biometrics.availableLabels();

  /// Whether this install already enrolled its device secret.
  Future<bool> hasBiometricEnrollment() async {
    final deviceId = await _biometrics.deviceId();
    final enrolled = _verificationMethods.any(
      (m) => m['method'] == 'biometric' && m['destination'] == deviceId,
    );
    if (enrolled) return true;
    // The methods list may predate enrolment; the keystore is the truth.
    final secret = await _biometrics.readSecret(deviceId);
    return secret != null && secret.isNotEmpty;
  }

  /// Enrols this device: biometric prompt → API secret → platform keystore.
  ///
  /// The API returns the secret once; losing it means re-enrolling, which
  /// rotates the stored copy server-side.
  Future<bool> enrollBiometric() async {
    final ok = await _biometrics.authenticate(
      reason: 'Set up fingerprint unlock for mboqara',
    );
    if (!ok) return false;
    final token = await _tokenStorage.readToken();
    if (token == null || token.isEmpty) {
      throw const ApiException(statusCode: 401, message: 'You are signed out');
    }
    final deviceId = await _biometrics.deviceId();
    final data = await _authService.enrollBiometric(
      token: token,
      deviceId: deviceId,
    );
    final secret = data['secret'];
    if (secret is! String || secret.isEmpty) {
      throw const ApiException(
        statusCode: 500,
        message: 'The device could not be enrolled',
      );
    }
    await _biometrics.writeSecret(deviceId, secret);
    await loadVerificationMethods();
    return true;
  }

  /// Verifies via biometrics: prompt → server challenge → HMAC → verify.
  ///
  /// A stolen bearer token cannot pass this — the secret only exists inside
  /// this device's keystore, behind the biometric prompt.
  Future<void> verifyWithBiometric() async {
    final token = await _tokenStorage.readToken();
    if (token == null || token.isEmpty) {
      throw const ApiException(statusCode: 401, message: 'You are signed out');
    }
    final deviceId = await _biometrics.deviceId();
    final secret = await _biometrics.readSecret(deviceId);
    if (secret == null || secret.isEmpty) {
      throw const ApiException(
        statusCode: 400,
        message: 'Set up fingerprint unlock on this device first',
      );
    }
    final ok = await _biometrics.authenticate(reason: 'Verify it is you');
    if (!ok) {
      throw const ApiException(
        statusCode: 401,
        message: 'Biometric verification was cancelled',
      );
    }
    final challenge = await _authService.requestVerification(
      token: token,
      method: 'biometric',
      deviceId: deviceId,
    );
    final challengeId = challenge['challengeId'];
    if (challengeId is! String || challengeId.isEmpty) {
      throw const ApiException(
        statusCode: 500,
        message: 'Could not start device verification',
      );
    }
    final proof = Hmac(
      sha256,
      utf8.encode(secret),
    ).convert(utf8.encode(challengeId)).toString();
    await _authService.verifyBiometric(
      token: token,
      deviceId: deviceId,
      challengeId: challengeId,
      proof: proof,
    );
    await _completeVerification();
  }

  /// Completes a verification that arrived as a deep link (the emailed
  /// magic link hands back an ordinary sign-in handoff code).
  Future<void> completeEmailVerification(Uri uri) async {
    final result = await _authService.completeAuthCallback(uri);
    await _tokenStorage.writeSession(
      token: result.token,
      refreshToken: result.refreshToken,
    );
    await _completeVerification();
  }

  Future<void> _completeVerification() async {
    _verificationRequired = false;
    _verificationMethods = const [];
    await _loadIdentity();
    notifyListeners();
  }

  Future<void> signIn({required String email, required String password}) async {
    final result = await _authService.signIn(email: email, password: password);
    await _tokenStorage.writeSession(
      token: result.token,
      refreshToken: result.refreshToken,
    );
    await _settings.setDemoMode(false);
    _name = result.name;
    _email = result.email;
    _state = SessionState.authenticated;
    await _loadIdentity();
    notifyListeners();
  }

  /// Completes the Google sign-in flow.
  ///
  /// The browser is used for the provider consent and the API returns the
  /// session through a deep link.
  Future<void> signInWithGoogle() async {
    final result = await _authService.signInWithGoogle();
    await _tokenStorage.writeSession(
      token: result.token,
      refreshToken: result.refreshToken,
    );
    await _settings.setDemoMode(false);
    _name = result.name;
    _email = result.email;
    _state = SessionState.authenticated;
    await _loadIdentity();
    notifyListeners();
  }

  Future<void> signUp({
    required String email,
    required String password,
    required String name,
  }) async {
    final result = await _authService.signUp(
      email: email,
      password: password,
      name: name,
    );
    await _tokenStorage.writeSession(
      token: result.token,
      refreshToken: result.refreshToken,
    );
    await _settings.setDemoMode(false);
    _name = result.name;
    _email = result.email;
    _state = SessionState.authenticated;
    await _loadIdentity();
    notifyListeners();
  }

  Future<void> continueInDemoMode() async {
    await _tokenStorage.clearAll();
    await _settings.setDemoMode(true);
    _name = 'Demo Candidate';
    _email = '';
    _state = SessionState.demo;
    _roles = const [];
    _permissions = const [];
    // Demo explores the seeded catalogue — it never runs resume onboarding,
    // so the router must not gate it behind the resume flow.
    _resumeOnboarded = true;
    notifyListeners();
  }

  Future<void> setDemoMode(bool enabled) async {
    await _settings.setDemoMode(enabled);
    if (enabled) {
      await _tokenStorage.clearAll();
      _state = SessionState.demo;
      _name = 'Demo Candidate';
      _email = '';
      _roles = const [];
      _permissions = const [];
      _resumeOnboarded = true;
    } else {
      final token = await _tokenStorage.readToken();
      _state = token == null || token.isEmpty
          ? SessionState.signedOut
          : SessionState.authenticated;
      if (_state == SessionState.authenticated) {
        await _loadIdentity();
      }
    }
    notifyListeners();
  }

  /// Local biometric confirmation for sensitive actions (export, share,
  /// deletion, privacy changes). The server-side step-up is separate and is
  /// driven by [verificationRequired]; this gate protects the device itself.
  Future<bool> confirmSensitiveAction({
    String reason = 'Confirm it is you to continue',
  }) async {
    if (!await _biometrics.isAvailable()) return true;
    return _biometrics.authenticate(reason: reason);
  }

  /// Downloads the account's own data from the API. No other user's data is
  /// included; the endpoint is scoped server-side to the bearer token.
  Future<Map<String, dynamic>> exportAccountData() async {
    final data = await _apiClient.get<dynamic>('/me/export');
    if (data is Map) return Map<String, dynamic>.from(data);
    return <String, dynamic>{'bundle': data};
  }

  /// Anonymises the account and revokes all sessions. The API keeps the
  /// audit trail, so this is not a "delete everything" button.
  Future<void> deleteAccount() async {
    await _apiClient.delete('/me');
    await _finishSignedOut(revoked: false);
  }

  /// Forced logout after the API rejected a refresh token (reuse detection,
  /// administrator revocation, or an expired session).
  Future<void> forceSignOut({bool revoked = true}) async {
    await _finishSignedOut(revoked: revoked);
  }

  Future<void> signOut() async {
    final refreshToken = await _tokenStorage.readRefreshToken();
    if (refreshToken != null && refreshToken.isNotEmpty) {
      try {
        await _authService.signOut(refreshToken);
      } catch (_) {
        // The local session is cleared either way.
      }
    }
    await _finishSignedOut(revoked: false);
  }

  Future<void> _finishSignedOut({required bool revoked}) async {
    await _tokenStorage.clearAll();
    await _settings.setDemoMode(true);
    _name = '';
    _email = '';
    _roles = const [];
    _permissions = const [];
    _verificationRequired = false;
    _verificationMethods = const [];
    _state = SessionState.signedOut;
    notifyListeners();
    if (revoked) onSessionRevoked?.call();
    try {
      await onSignedOut?.call();
    } catch (error) {
      debugPrint('Sign-out cleanup failed: $error');
    }
  }
}
