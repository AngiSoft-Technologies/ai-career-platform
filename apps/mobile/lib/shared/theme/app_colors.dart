import 'package:flutter/material.dart';

/// MboQara mobile color system.
///
/// Two modes, both following the device system setting by default:
/// - Light: clean paper surfaces, high contrast, warm signal accents.
/// - Dark: deep ink surfaces, luminous accents, reduced glare.
///
/// Signal semantics are consistent across modes:
/// - signal (amber): opportunity/action
/// - verified (green): trust/eligibility confirmed
/// - insight (violet/periwinkle): AI/match intelligence
@immutable
class AppColors extends ThemeExtension<AppColors> {
  const AppColors({
    required this.signal,
    required this.verified,
    required this.insight,
    required this.bgGradientStart,
    required this.bgGradientMid,
    required this.bgGradientEnd,
    required this.bgGlowA,
    required this.bgGlowB,
    required this.cardOverlay,
    required this.shimmerBase,
    required this.shimmerHighlight,
  });

  /// Opportunity and energy — the thing a candidate should act on.
  final Color signal;

  /// Verified — what the trust engine checked and stands behind.
  final Color verified;

  /// Intelligence — matching and AI-assisted features.
  final Color insight;

  // Background atmosphere. Used by AppBackground for gradient/image overlays.
  final Color bgGradientStart;
  final Color bgGradientMid;
  final Color bgGradientEnd;
  final Color bgGlowA;
  final Color bgGlowB;
  final Color cardOverlay;
  final Color shimmerBase;
  final Color shimmerHighlight;

  /// Light mode palette.
  static const AppColors light = AppColors(
    signal: Color(0xFFB26A00), // amber - action/opportunity
    verified: Color(0xFF0F8A5F), // green - verified/trust
    insight: Color(0xFF4C63D6), // indigo - intelligence/match
    bgGradientStart: Color(0xFFF7F9FC),
    bgGradientMid: Color(0xFFEEF3FF),
    bgGradientEnd: Color(0xFFF8F4EC),
    bgGlowA: Color(0x1A4C63D6), // insight glow 10%
    bgGlowB: Color(0x14F2A33C), // signal glow 8%
    cardOverlay: Color(0xCCFFFFFF),
    shimmerBase: Color(0xFFE6EBF2),
    shimmerHighlight: Color(0xFFF7F9FC),
  );

  /// Dark mode palette.
  static const AppColors dark = AppColors(
    signal: Color(0xFFF2A33C), // amber - action/opportunity
    verified: Color(0xFF3ECF8E), // green - verified/trust
    insight: Color(0xFF9DB4FF), // periwinkle - intelligence/match
    bgGradientStart: Color(0xFF0B0F14),
    bgGradientMid: Color(0xFF101726),
    bgGradientEnd: Color(0xFF15120C),
    bgGlowA: Color(0x299DB4FF), // insight glow 16%
    bgGlowB: Color(0x1FF2A33C), // signal glow 12%
    cardOverlay: Color(0xB3181C24),
    shimmerBase: Color(0xFF1A202B),
    shimmerHighlight: Color(0xFF262D3A),
  );

  @override
  AppColors copyWith({
    Color? signal,
    Color? verified,
    Color? insight,
    Color? bgGradientStart,
    Color? bgGradientMid,
    Color? bgGradientEnd,
    Color? bgGlowA,
    Color? bgGlowB,
    Color? cardOverlay,
    Color? shimmerBase,
    Color? shimmerHighlight,
  }) {
    return AppColors(
      signal: signal ?? this.signal,
      verified: verified ?? this.verified,
      insight: insight ?? this.insight,
      bgGradientStart: bgGradientStart ?? this.bgGradientStart,
      bgGradientMid: bgGradientMid ?? this.bgGradientMid,
      bgGradientEnd: bgGradientEnd ?? this.bgGradientEnd,
      bgGlowA: bgGlowA ?? this.bgGlowA,
      bgGlowB: bgGlowB ?? this.bgGlowB,
      cardOverlay: cardOverlay ?? this.cardOverlay,
      shimmerBase: shimmerBase ?? this.shimmerBase,
      shimmerHighlight: shimmerHighlight ?? this.shimmerHighlight,
    );
  }

  @override
  ThemeExtension<AppColors> lerp(ThemeExtension<AppColors>? other, double t) {
    if (other is! AppColors) return this;
    return AppColors(
      signal: Color.lerp(signal, other.signal, t)!,
      verified: Color.lerp(verified, other.verified, t)!,
      insight: Color.lerp(insight, other.insight, t)!,
      bgGradientStart: Color.lerp(bgGradientStart, other.bgGradientStart, t)!,
      bgGradientMid: Color.lerp(bgGradientMid, other.bgGradientMid, t)!,
      bgGradientEnd: Color.lerp(bgGradientEnd, other.bgGradientEnd, t)!,
      bgGlowA: Color.lerp(bgGlowA, other.bgGlowA, t)!,
      bgGlowB: Color.lerp(bgGlowB, other.bgGlowB, t)!,
      cardOverlay: Color.lerp(cardOverlay, other.cardOverlay, t)!,
      shimmerBase: Color.lerp(shimmerBase, other.shimmerBase, t)!,
      shimmerHighlight: Color.lerp(shimmerHighlight, other.shimmerHighlight, t)!,
    );
  }
}

/// Reach for the signal colours from any widget: `context.appColors`.
extension AppColorsX on BuildContext {
  AppColors get appColors =>
      Theme.of(this).extension<AppColors>() ?? AppColors.dark;
}

/// Returns [accent] adjusted so it stays visible on the current surface.
Color surfaceSafeAccent(Color accent, Brightness brightness) {
  if (brightness == Brightness.light) return accent;
  final hsl = HSLColor.fromColor(accent);
  if (hsl.lightness >= 0.5) return accent;
  return hsl
      .withLightness(0.62)
      .withSaturation((hsl.saturation * 0.85).clamp(0.35, 0.9))
      .toColor();
}
