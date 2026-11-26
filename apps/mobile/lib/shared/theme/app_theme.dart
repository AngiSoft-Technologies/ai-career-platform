import 'package:flutter/material.dart';

import 'app_colors.dart';

class AppTheme {
  const AppTheme._();

  /// Brand seed — periwinkle used for primary actions.
  static const seed = Color(0xFF6D8BFF);

  static ThemeData light() => _build(_lightScheme, Brightness.light);
  static ThemeData dark() => _build(_darkScheme, Brightness.dark);

  // ---------------------------------------------------------------------------
  // Light mode color codes
  // ---------------------------------------------------------------------------
  // Surface/background ramp
  //   #FFFFFF  surface / cards
  //   #F7F9FC  scaffold background
  //   #EEF1F7  container low
  //   #E6EBF3  container / borders
  // Text
  //   #1A1F2B  primary text
  //   #4A5568  secondary text
  //   #6B7280  muted text
  // Brand / semantic
  //   #3D5AF1  primary
  //   #0A1B4D  on-primary-container text
  //   #DCE4FF  primary container
  //   #B26A00  signal / action amber
  //   #0F8A5F  verified / success green
  //   #4C63D6  insight / AI violet
  //   #BA1A1A  error
  // ---------------------------------------------------------------------------
  static const _lightScheme = ColorScheme(
    brightness: Brightness.light,
    primary: Color(0xFF3D5AF1),
    onPrimary: Color(0xFFFFFFFF),
    primaryContainer: Color(0xFFDCE4FF),
    onPrimaryContainer: Color(0xFF0A1B4D),
    secondary: Color(0xFF566074),
    onSecondary: Color(0xFFFFFFFF),
    secondaryContainer: Color(0xFFDCE2F5),
    onSecondaryContainer: Color(0xFF151B2C),
    tertiary: Color(0xFF4C63D6),
    onTertiary: Color(0xFFFFFFFF),
    tertiaryContainer: Color(0xFFE0E6FF),
    onTertiaryContainer: Color(0xFF101A3A),
    error: Color(0xFFBA1A1A),
    onError: Color(0xFFFFFFFF),
    errorContainer: Color(0xFFFFDAD6),
    onErrorContainer: Color(0xFF410002),
    surface: Color(0xFFF7F9FC),
    onSurface: Color(0xFF1A1F2B),
    onSurfaceVariant: Color(0xFF4A5568),
    outline: Color(0xFF7B8496),
    outlineVariant: Color(0xFFCBD3E1),
    shadow: Color(0xFF000000),
    scrim: Color(0xFF000000),
    inverseSurface: Color(0xFF2D3340),
    onInverseSurface: Color(0xFFF1F4F9),
    inversePrimary: Color(0xFF9DB4FF),
    surfaceTint: Color(0xFF3D5AF1),
  );

  // ---------------------------------------------------------------------------
  // Dark mode color codes
  // ---------------------------------------------------------------------------
  // Surface/background ramp
  //   #0B0F14  scaffold / lowest
  //   #131925  container low / cards
  //   #1A2230  container
  //   #242D3D  container high
  // Text
  //   #E6EBF3  primary text
  //   #B4BFCC  secondary text
  //   #8A96A8  muted text
  // Brand / semantic
  //   #9DB4FF  primary
  //   #0A1B4D  on-primary
  //   #2C3E8F  primary container
  //   #F2A33C  signal / action amber
  //   #3ECF8E  verified / success green
  //   #9DB4FF  insight / AI periwinkle
  //   #FFB4AB  error
  // ---------------------------------------------------------------------------
  static const _darkScheme = ColorScheme(
    brightness: Brightness.dark,
    primary: Color(0xFF9DB4FF),
    onPrimary: Color(0xFF0A1B4D),
    primaryContainer: Color(0xFF2C3E8F),
    onPrimaryContainer: Color(0xFFDCE4FF),
    secondary: Color(0xFFBEC6DC),
    onSecondary: Color(0xFF283044),
    secondaryContainer: Color(0xFF3E475C),
    onSecondaryContainer: Color(0xFFDCE2F7),
    tertiary: Color(0xFFC4CCFF),
    onTertiary: Color(0xFF202A52),
    tertiaryContainer: Color(0xFF37416B),
    onTertiaryContainer: Color(0xFFE0E5FF),
    error: Color(0xFFFFB4AB),
    onError: Color(0xFF690005),
    errorContainer: Color(0xFF93000A),
    onErrorContainer: Color(0xFFFFDAD6),
    surface: Color(0xFF0B0F14),
    onSurface: Color(0xFFE6EBF3),
    onSurfaceVariant: Color(0xFFB4BFCC),
    outline: Color(0xFF5F6B7E),
    outlineVariant: Color(0xFF323C4D),
    shadow: Color(0xFF000000),
    scrim: Color(0xFF000000),
    inverseSurface: Color(0xFFE6EBF3),
    onInverseSurface: Color(0xFF2C3340),
    inversePrimary: Color(0xFF3D5AF1),
    surfaceTint: Color(0xFF9DB4FF),
  );

  static const _lightContainers = (
    lowest: Color(0xFFFFFFFF),
    low: Color(0xFFFFFFFF),
    container: Color(0xFFEEF2F8),
    high: Color(0xFFE6EBF3),
    highest: Color(0xFFDDE4EE),
  );

  static const _darkContainers = (
    lowest: Color(0xFF070A0F),
    low: Color(0xFF131925),
    container: Color(0xFF1A2230),
    high: Color(0xFF242D3D),
    highest: Color(0xFF2E384A),
  );

  static ThemeData _build(ColorScheme scheme, Brightness brightness) {
    final colors = brightness == Brightness.dark ? AppColors.dark : AppColors.light;
    final c = brightness == Brightness.dark ? _darkContainers : _lightContainers;
    final full = scheme.copyWith(
      surfaceContainerLowest: c.lowest,
      surfaceContainerLow: c.low,
      surfaceContainer: c.container,
      surfaceContainerHigh: c.high,
      surfaceContainerHighest: c.highest,
      surfaceDim: brightness == Brightness.dark ? const Color(0xFF070A0F) : const Color(0xFFDDE4EE),
      surfaceBright: brightness == Brightness.dark ? const Color(0xFF2E384A) : const Color(0xFFFFFFFF),
    );

    final textTheme = _textTheme(brightness).apply(
      bodyColor: full.onSurface,
      displayColor: full.onSurface,
    );

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: full,
      scaffoldBackgroundColor: full.surface,
      extensions: <ThemeExtension<dynamic>>[colors],
      textTheme: textTheme,
      appBarTheme: AppBarTheme(
        centerTitle: false,
        backgroundColor: Colors.transparent,
        foregroundColor: full.onSurface,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        titleTextStyle: textTheme.titleLarge?.copyWith(
          fontWeight: FontWeight.w800,
          letterSpacing: -0.2,
          color: full.onSurface,
        ),
      ),
      cardTheme: CardThemeData(
        color: full.surfaceContainerLow.withValues(alpha: brightness == Brightness.dark ? 0.88 : 0.94),
        elevation: 0,
        margin: EdgeInsets.zero,
        clipBehavior: Clip.antiAlias,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: BorderSide(color: full.outlineVariant.withValues(alpha: 0.55)),
        ),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: full.surfaceContainerHigh,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: full.surfaceContainerLow,
        surfaceTintColor: Colors.transparent,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: full.inverseSurface,
        contentTextStyle: TextStyle(color: full.onInverseSurface),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
      listTileTheme: ListTileThemeData(
        iconColor: full.onSurfaceVariant,
        textColor: full.onSurface,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: full.surfaceContainerHigh.withValues(alpha: brightness == Brightness.dark ? 0.72 : 0.85),
        labelStyle: TextStyle(color: full.onSurfaceVariant),
        hintStyle: TextStyle(color: full.onSurfaceVariant.withValues(alpha: 0.72)),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: full.outlineVariant.withValues(alpha: 0.5)),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: full.outlineVariant.withValues(alpha: 0.45)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: full.primary, width: 1.6),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: full.error),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: full.error, width: 1.6),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size(0, 52),
          textStyle: const TextStyle(fontWeight: FontWeight.w700),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size(0, 50),
          foregroundColor: full.onSurface,
          side: BorderSide(color: full.outlineVariant.withValues(alpha: 0.8)),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(foregroundColor: full.primary),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: full.surfaceContainerLow.withValues(alpha: 0.96),
        surfaceTintColor: Colors.transparent,
        indicatorColor: full.primaryContainer,
        elevation: 0,
        height: 74,
        labelTextStyle: WidgetStatePropertyAll(
          TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: full.onSurfaceVariant),
        ),
      ),
      navigationRailTheme: NavigationRailThemeData(
        backgroundColor: Colors.transparent,
        indicatorColor: full.primaryContainer,
      ),
      chipTheme: ChipThemeData(
        backgroundColor: full.surfaceContainerHigh.withValues(alpha: 0.8),
        selectedColor: full.primaryContainer,
        side: BorderSide(color: full.outlineVariant.withValues(alpha: 0.35)),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        labelStyle: TextStyle(color: full.onSurface, fontWeight: FontWeight.w500),
      ),
      progressIndicatorTheme: ProgressIndicatorThemeData(
        color: full.primary,
        linearTrackColor: full.surfaceContainerHighest,
        circularTrackColor: full.surfaceContainerHighest,
      ),
      dividerTheme: DividerThemeData(
        color: full.outlineVariant.withValues(alpha: 0.5),
        thickness: 1,
        space: 1,
      ),
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.selected) ? full.onPrimary : full.onSurfaceVariant,
        ),
        trackColor: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.selected)
              ? full.primary
              : full.surfaceContainerHighest,
        ),
      ),
      textSelectionTheme: TextSelectionThemeData(
        cursorColor: full.primary,
        selectionColor: full.primary.withValues(alpha: 0.3),
        selectionHandleColor: full.primary,
      ),
    );
  }

  static TextTheme _textTheme(Brightness brightness) {
    final base = brightness == Brightness.dark ? Typography.blackMountainView : Typography.whiteMountainView;
    return base.copyWith(
      displaySmall: base.displaySmall?.copyWith(fontWeight: FontWeight.w800, letterSpacing: -0.6),
      headlineMedium: base.headlineMedium?.copyWith(fontWeight: FontWeight.w800, letterSpacing: -0.4),
      headlineSmall: base.headlineSmall?.copyWith(fontWeight: FontWeight.w800, letterSpacing: -0.3),
      titleLarge: base.titleLarge?.copyWith(fontWeight: FontWeight.w800, letterSpacing: -0.2),
      titleMedium: base.titleMedium?.copyWith(fontWeight: FontWeight.w700, letterSpacing: -0.1),
      titleSmall: base.titleSmall?.copyWith(fontWeight: FontWeight.w700),
      bodyLarge: base.bodyLarge?.copyWith(height: 1.45),
      bodyMedium: base.bodyMedium?.copyWith(height: 1.45),
      labelLarge: base.labelLarge?.copyWith(fontWeight: FontWeight.w700),
    );
  }
}
