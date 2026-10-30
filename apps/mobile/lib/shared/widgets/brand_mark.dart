import 'package:flutter/material.dart';

/// Canonical Job Radar mark. Every screen that shows branding uses this widget
/// so the asset, padding and semantics stay consistent across the app.
class BrandMark extends StatelessWidget {
  const BrandMark({
    super.key,
    this.size = 30,
    this.showWordmark = false,
    this.onDark = true,
  });

  final double size;
  final bool showWordmark;
  final bool onDark;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        ConstrainedBox(
          constraints: BoxConstraints(maxWidth: size * 6.4),
          child: Image.asset(
            onDark
                ? 'assets/branding/logo_wordmark_light.png'
                : 'assets/branding/logo_wordmark.png',
            height: size * 0.92,
            fit: BoxFit.contain,
            filterQuality: FilterQuality.high,
            excludeFromSemantics: true,
          ),
        ),
      ],
    );
  }
}
