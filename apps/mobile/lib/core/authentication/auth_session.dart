import 'package:flutter/foundation.dart';

import '../configuration/app_settings.dart';
import '../networking/api_client.dart';
import '../networking/api_exception.dart';
import 'neon_auth_service.dart';
import 'token_storage.dart';

enum SessionState { signedOut, demo, authenticated }

class AuthSession extends ChangeNotifier {
  AuthSession({
    required NeonAuthService authService,
    required TokenStorage tokenStorage,
    required ApiClient apiClient,
    required AppSettings settings,
  }) : _authService = authService,
       _tokenStorage = tokenStorage,
       _apiClient = apiClient,
       _settings = settings;

  final NeonAuthService _authService;
  final TokenStorage _tokenStorage;
  final ApiClient _apiClient;
  final AppSettings _settings;

  SessionState _state = SessionState.signedOut;
  String _name = '';
  String _email = '';

  SessionState get state => _state;
  String get name => _name;
  String get email => _email;
  bool get isSignedIn => _state != SessionState.signedOut;
  bool get isDemoMode => _state == SessionState.demo;
  bool get isAuthenticated => _state == SessionState.authenticated;

  Future<void> restore() async {
    final token = await _tokenStorage.readToken();
    if (token == null || token.isEmpty) {
      _state = SessionState.signedOut;
      notifyListeners();
      return;
    }
    _state = SessionState.authenticated;
    try {
      await _apiClient.get('/profile');
    } on ApiException catch (error) {
      if (error.isUnauthorized) {
        await _tokenStorage.deleteToken();
        _state = SessionState.signedOut;
      }
    }
    notifyListeners();
  }

  Future<void> signIn({required String email, required String password}) async {
    final result = await _authService.signIn(email: email, password: password);
    await _tokenStorage.writeToken(result.token);
    await _settings.setDemoMode(false);
    _name = result.name;
    _email = result.email;
    _state = SessionState.authenticated;
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
    await _tokenStorage.writeToken(result.token);
    await _settings.setDemoMode(false);
    _name = result.name;
    _email = result.email;
    _state = SessionState.authenticated;
    notifyListeners();
  }

  Future<void> continueInDemoMode() async {
    await _tokenStorage.deleteToken();
    await _settings.setDemoMode(true);
    _name = 'Demo Candidate';
    _email = '';
    _state = SessionState.demo;
    notifyListeners();
  }

  Future<void> setDemoMode(bool enabled) async {
    await _settings.setDemoMode(enabled);
    if (enabled) {
      await _tokenStorage.deleteToken();
      _state = SessionState.demo;
    } else {
      final token = await _tokenStorage.readToken();
      _state = token == null || token.isEmpty
          ? SessionState.signedOut
          : SessionState.authenticated;
    }
    notifyListeners();
  }

  Future<void> signOut() async {
    await _tokenStorage.deleteToken();
    await _settings.setDemoMode(true);
    _name = '';
    _email = '';
    _state = SessionState.signedOut;
    notifyListeners();
  }
}
