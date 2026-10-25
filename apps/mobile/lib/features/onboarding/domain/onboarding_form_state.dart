enum OnboardingMode { signIn, signUp }

class OnboardingFormState {
  const OnboardingFormState({
    this.mode = OnboardingMode.signIn,
    this.isSubmitting = false,
    this.errorMessage,
  });

  final OnboardingMode mode;
  final bool isSubmitting;
  final String? errorMessage;

  OnboardingFormState copyWith({
    OnboardingMode? mode,
    bool? isSubmitting,
    String? errorMessage,
    bool clearError = false,
  }) {
    return OnboardingFormState(
      mode: mode ?? this.mode,
      isSubmitting: isSubmitting ?? this.isSubmitting,
      errorMessage: clearError ? null : errorMessage ?? this.errorMessage,
    );
  }
}
