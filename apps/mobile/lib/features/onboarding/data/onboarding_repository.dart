import '../../../core/authentication/neon_auth_service.dart';

class OnboardingRepository {
  OnboardingRepository({required NeonAuthService authService})
    : _authService = authService;

  final NeonAuthService _authService;

  Future<NeonAuthResult> signIn({
    required String email,
    required String password,
  }) {
    return _authService.signIn(email: email, password: password);
  }

  Future<NeonAuthResult> signUp({
    required String email,
    required String password,
    required String name,
  }) {
    return _authService.signUp(email: email, password: password, name: name);
  }
}
