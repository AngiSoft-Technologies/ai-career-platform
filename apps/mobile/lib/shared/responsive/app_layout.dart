import 'package:flutter/material.dart';

/// Window-size breakpoints, following the Material window size classes.
///
/// `compact` is a phone held upright; `medium` covers large phones in
/// landscape, small tablets and foldables; `expanded` is a tablet or a
/// desktop window. The shell switches navigation and content measure at
/// these widths so a tablet gets a rail and a readable line length instead
/// of a phone layout stretched edge to edge.
abstract final class AppBreakpoints {
  /// Below this the bottom navigation bar is used.
  static const double medium = 600;

  /// Below this the content column is unconstrained; above it the content
  /// is centred on a readable measure.
  static const double expanded = 840;

  /// The widest the content column grows on expanded windows.
  static const double contentMaxWidth = 1200;
}

extension AppResponsiveX on BuildContext {
  /// True on tablets, large phones in landscape and desktop windows.
  bool get isMediumWidth =>
      MediaQuery.sizeOf(this).width >= AppBreakpoints.medium;

  /// True on tablets and wide desktop windows.
  bool get isExpandedWidth =>
      MediaQuery.sizeOf(this).width >= AppBreakpoints.expanded;
}
