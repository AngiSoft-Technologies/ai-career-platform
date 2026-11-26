import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import 'background_video.dart';

/// Atmospheric background used across the app.
///
/// Provides:
/// - mode-aware gradient base (light/dark)
/// - subtle glow shapes for depth
/// - optional image overlay (asset or network) for hero/screens
/// - optional top/bottom scrim for readability
///
/// Images/videos are opt-in per screen; the default is a performant gradient.
class AppBackground extends StatelessWidget {
  const AppBackground({
    super.key,
    required this.child,
    this.imageAsset,
    this.imageUrl,
    this.videoUrl,
    this.imageOpacity,
    this.videoOpacity,
    this.imageFit = BoxFit.cover,
    this.imageAlignment = Alignment.center,
    this.showGlow = true,
    this.topScrim = 0.0,
    this.bottomScrim = 0.0,
  });

  final Widget child;
  final String? imageAsset;
  final String? imageUrl;
  final String? videoUrl;
  final double? imageOpacity;
  final double? videoOpacity;
  final BoxFit imageFit;
  final Alignment imageAlignment;
  final bool showGlow;
  final double topScrim;
  final double bottomScrim;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final colors = context.appColors;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final effectiveImageOpacity = imageOpacity ?? (isDark ? 0.22 : 0.14);

    return Stack(
      fit: StackFit.expand,
      children: [
        DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                colors.bgGradientStart,
                colors.bgGradientMid,
                colors.bgGradientEnd,
              ],
              stops: const [0.0, 0.55, 1.0],
            ),
          ),
        ),
        if (showGlow) ...[
          Positioned(
            top: -120,
            right: -60,
            child: _Glow(color: colors.bgGlowA, size: 280),
          ),
          Positioned(
            bottom: -140,
            left: -80,
            child: _Glow(color: colors.bgGlowB, size: 320),
          ),
        ],
        if (videoUrl != null)
          Positioned.fill(
            child: Opacity(
              opacity: videoOpacity ?? (isDark ? 0.34 : 0.22),
              child: BackgroundVideo(
                videoUrl: videoUrl!,
                fallback: (imageAsset != null || imageUrl != null)
                    ? _MediaImage(
                        imageAsset: imageAsset,
                        imageUrl: imageUrl,
                        imageFit: imageFit,
                        imageAlignment: imageAlignment,
                      )
                    : ColoredBox(color: scheme.surface),
              ),
            ),
          )
        else if (imageAsset != null || imageUrl != null)
          Positioned.fill(
            child: Opacity(
              opacity: effectiveImageOpacity,
              child: _MediaImage(
                imageAsset: imageAsset,
                imageUrl: imageUrl,
                imageFit: imageFit,
                imageAlignment: imageAlignment,
              ),
            ),
          ),
        if (topScrim > 0 || bottomScrim > 0)
          Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    scheme.surface.withValues(alpha: topScrim),
                    Colors.transparent,
                    Colors.transparent,
                    scheme.surface.withValues(alpha: bottomScrim),
                  ],
                  stops: const [0.0, 0.25, 0.75, 1.0],
                ),
              ),
            ),
          ),
        child,
      ],
    );
  }
}

class _MediaImage extends StatelessWidget {
  const _MediaImage({
    required this.imageAsset,
    required this.imageUrl,
    required this.imageFit,
    required this.imageAlignment,
  });

  final String? imageAsset;
  final String? imageUrl;
  final BoxFit imageFit;
  final Alignment imageAlignment;

  @override
  Widget build(BuildContext context) {
    if (imageAsset != null) {
      return Image.asset(
        imageAsset!,
        fit: imageFit,
        alignment: imageAlignment,
        errorBuilder: (_, __, ___) => const SizedBox.shrink(),
      );
    }
    return Image.network(
      imageUrl!,
      fit: imageFit,
      alignment: imageAlignment,
      errorBuilder: (_, __, ___) => const SizedBox.shrink(),
      loadingBuilder: (context, child, progress) {
        if (progress == null) return child;
        return const SizedBox.shrink();
      },
    );
  }
}

class _Glow extends StatelessWidget {
  const _Glow({required this.color, required this.size});

  final Color color;
  final double size;

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: RadialGradient(
            colors: [color, color.withValues(alpha: 0.0)],
          ),
        ),
      ),
    );
  }
}
