import 'dart:convert';

import 'package:app_links/app_links.dart';
import 'package:http/http.dart' as http;
import 'package:url_launcher/url_launcher.dart';

import '../configuration/app_settings.dart';

/// Deep-link scheme the API redirects back to after a social sign-in.
const String kAuthCallbackScheme = 'jobradar';

/// Full callback URL registered with the API.
const String kAuthCallbackUri = '$kAuthCallbackScheme://auth/callback';

class AuthException implements Exception {
  const AuthException(this.message, {this.code, this.statusCode});

  final String message;
  final String? code;
  final int? statusCode;

  @override
  String toString() => message;
}

/// A session returned by the API.
class AuthResult {
  const AuthResult({
    required this.token,
    required this.refreshToken,
    this.email = '',
    this.name = '',
    this.expiresAt,
    this.refreshExpiresAt,
  });

  final String token;
  final String refreshToken;
  final String email;
  final String name;
  final DateTime? expiresAt;
  final DateTime? refreshExpiresAt;
}

/// Talks to the Job Radar API and nothing else.
///
/// The API owns identity. This service never contacts Neon Auth, Google or
/// any other provider directly: social sign-in is completed in the system
/// browser and the API hands the session back through a deep link.
class ApiAuthService {
  ApiAuthService({required AppSettings settings, http.Client? client})
    : _settings = settings,
      _client = client ?? http.Client();

  final AppSettings _settings;
  final http.Client _client;

  static const Duration _timeout = Duration(seconds: 20);

  Future<AuthResult> signIn({required String email, required String password}) {
    return _post('/auth/sign-in', {
      'email': email.trim(),
      'password': password,
    });
  }

  Future<AuthResult> signUp({
    required String email,
    required String password,
    required String name,
  }) {
    return _post('/auth/sign-up', {
      'email': email.trim(),
      'password': password,
      'name': name.trim(),
    });
  }

  /// Exchanges a refresh token for a new session.
  ///
  /// The API rotates the refresh token on every call, so the caller must
  /// persist the returned value.
  Future<AuthResult> refresh(String refreshToken) {
    return _post('/auth/refresh', {'refreshToken': refreshToken});
  }

  Future<void> signOut(String refreshToken) async {
    await _post('/auth/sign-out', {'refreshToken': refreshToken});
  }

  /// Runs the Google sign-in flow.
  ///
  /// The browser is sent to the API, which completes the provider consent and
  /// redirects back to [kAuthCallbackUri] with the session in the fragment.
  Future<AuthResult> signInWithGoogle() async {
    final startUrl = Uri.parse(
      '${_settings.baseUrl}/auth/google/start?redirect_uri='
      '${Uri.encodeComponent(kAuthCallbackUri)}',
    );

    final launched = await launchUrl(
      startUrl,
      mode: LaunchMode.externalApplication,
    );
    if (!launched) {
      throw const AuthException(
        'Could not open the browser for Google sign-in',
      );
    }

    final uri = await _awaitCallback();
    return _resultFromCallback(uri);
  }

  /// Waits for the deep link that carries the completed session.
  Future<Uri> _awaitCallback() {
    final appLinks = AppLinks();

    // A link that already arrived (the app was backgrounded) wins over
    // waiting for a new one.
    return _firstCallback(appLinks);
  }

  Future<Uri> _firstCallback(AppLinks appLinks) async {
    final initial = await appLinks.getInitialLink();
    if (initial != null && _isAuthCallback(initial)) return initial;

    final latest = await appLinks.getLatestLink();
    if (latest != null && _isAuthCallback(latest)) return latest;

    final stream = appLinks.uriLinkStream.where(_isAuthCallback);
    return stream.first.timeout(
      const Duration(minutes: 5),
      onTimeout: () => throw const AuthException(
        'Google sign-in timed out. Please try again.',
      ),
    );
  }

  bool _isAuthCallback(Uri uri) =>
      uri.scheme == kAuthCallbackScheme && uri.host == 'auth';

  AuthResult _resultFromCallback(Uri uri) {
    final fragment = Uri.splitQueryString(uri.fragment);
    final token = fragment['access_token'] ?? '';
    final refreshToken = fragment['refresh_token'] ?? '';
    if (token.isEmpty || refreshToken.isEmpty) {
      throw const AuthException('The sign-in did not return a session');
    }
    return AuthResult(
      token: token,
      refreshToken: refreshToken,
      expiresAt: _parseDate(fragment['expires_at']),
      refreshExpiresAt: _parseDate(fragment['refresh_expires_at']),
    );
  }

  DateTime? _parseDate(String? value) {
    if (value == null || value.isEmpty) return null;
    return DateTime.tryParse(value);
  }

  Future<AuthResult> _post(String path, Map<String, dynamic> body) async {
    final response = await _client
        .post(
          Uri.parse('${_settings.baseUrl}$path'),
          headers: const {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: jsonEncode(body),
        )
        .timeout(_timeout);

    final decoded = _decode(response.body);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw AuthException(
        _errorMessage(decoded, fallback: 'Authentication failed'),
        code: decoded['code'] as String?,
        statusCode: response.statusCode,
      );
    }

    return AuthResult(
      token: (decoded['token'] as String?) ?? '',
      refreshToken: (decoded['refreshToken'] as String?) ?? '',
      email: ((decoded['user'] as Map?)?['email'] as String?) ?? '',
      name: ((decoded['user'] as Map?)?['name'] as String?) ?? '',
      expiresAt: _parseDate(decoded['expiresAt'] as String?),
      refreshExpiresAt: _parseDate(decoded['refreshExpiresAt'] as String?),
    );
  }

  Map<String, dynamic> _decode(String value) {
    if (value.isEmpty) return const <String, dynamic>{};
    try {
      final decoded = jsonDecode(value);
      if (decoded is Map<String, dynamic>) return decoded;
    } catch (_) {
      // Fall through to the empty map below.
    }
    return const <String, dynamic>{};
  }

  String _errorMessage(Map<String, dynamic> body, {required String fallback}) {
    final message = body['error'] ?? body['message'];
    if (message is String && message.trim().isNotEmpty) return message.trim();
    return fallback;
  }
}
