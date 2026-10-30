import '../../../core/authentication/api_auth_service.dart';

class OnboardingRepository {
  OnboardingRepository({required ApiAuthService authService})
    : _authService = authService;

  final ApiAuthService _authService;

  Future<AuthResult> signIn({required String email, required String password}) {
    return _authService.signIn(email: email, password: password);
  }

  Future<AuthResult> signUp({
    required String email,
    required String password,
    required String name,
  }) {
    return _authService.signUp(email: email, password: password, name: name);
  }

  Future<AuthResult> signInWithGoogle() {
    return _authService.signInWithGoogle();
  }
}
