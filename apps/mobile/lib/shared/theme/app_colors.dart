import 'package:flutter/material.dart';

/// The platform's signal colours, and what each one means.
///
/// The web settled on three colours that each carry a meaning — amber
/// for "act on this", green for "the trust engine verified this", violet
/// for "intelligence" — because a colour that means something is data,
/// and a colour that is decoration is noise. The app speaks the same
/// language: eligibility reads green, a risk score reads amber, a match
/// reads violet.
@immutable
class AppColors extends ThemeExtension<AppColors> {
  const AppColors({
    required this.signal,
    required this.verified,
    required this.insight,
  });

  /// Opportunity and energy — the thing a candidate should act on.
  final Color signal;

  /// Verified — what the trust engine checked and stands behind.
  final Color verified;

  /// Intelligence — matching and AI-assisted features.
  final Color insight;

  static const AppColors light = AppColors(
    signal: Color(0xFFB26A00),
    verified: Color(0xFF0F8A5F),
    insight: Color(0xFF4C63D6),
  );

  static const AppColors dark = AppColors(
    signal: Color(0xFFF2A33C),
    verified: Color(0xFF3ECF8E),
    insight: Color(0xFF9DB2FF),
  );

  @override
  AppColors copyWith({Color? signal, Color? verified, Color? insight}) {
    return AppColors(
      signal: signal ?? this.signal,
      verified: verified ?? this.verified,
      insight: insight ?? this.insight,
    );
  }

  @override
  ThemeExtension<AppColors> lerp(ThemeExtension<AppColors>? other, double t) {
    if (other is! AppColors) return this;
    return AppColors(
      signal: Color.lerp(signal, other.signal, t)!,
      verified: Color.lerp(verified, other.verified, t)!,
      insight: Color.lerp(insight, other.insight, t)!,
    );
  }
}

/// Reach for the signal colours from any widget: `context.appColors`.
extension AppColorsX on BuildContext {
  AppColors get appColors =>
      Theme.of(this).extension<AppColors>() ?? AppColors.dark;
}
