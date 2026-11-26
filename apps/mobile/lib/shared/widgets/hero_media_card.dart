import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import 'background_video.dart';

class HeroMediaCard extends StatelessWidget {
  const HeroMediaCard({
    super.key,
    required this.title,
    required this.subtitle,
    this.eyebrow,
    this.imageUrl,
    this.videoUrl,
    this.action,
    this.height = 180,
  });

  final String title;
  final String subtitle;
  final String? eyebrow;
  final String? imageUrl;
  final String? videoUrl;
  final Widget? action;
  final double height;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final app = context.appColors;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      height: height,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: scheme.outlineVariant.withValues(alpha: 0.45)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: isDark ? 0.24 : 0.08),
            blurRadius: 24,
            offset: const Offset(0, 12),
          ),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        fit: StackFit.expand,
        children: [
          if (videoUrl != null)
            BackgroundVideo(
              videoUrl: videoUrl!,
              fallback: _imageFallback(scheme),
            )
          else
            _imageFallback(scheme),
          DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  scheme.surface.withValues(alpha: isDark ? 0.18 : 0.08),
                  scheme.surface.withValues(alpha: isDark ? 0.72 : 0.62),
                ],
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (eyebrow != null)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                    decoration: BoxDecoration(
                      color: app.insight.withValues(alpha: 0.16),
                      borderRadius: BorderRadius.circular(999),
                      border: Border.all(color: app.insight.withValues(alpha: 0.25)),
                    ),
                    child: Text(
                      eyebrow!,
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(
                            color: app.insight,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 0.3,
                          ),
                    ),
                  ),
                const Spacer(),
                Text(
                  title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                        fontWeight: FontWeight.w800,
                        height: 1.1,
                      ),
                ),
                const SizedBox(height: 6),
                Text(
                  subtitle,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: scheme.onSurfaceVariant,
                      ),
                ),
                if (action != null) ...[const SizedBox(height: 12), action!],
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _imageFallback(ColorScheme scheme) {
    if (imageUrl == null) {
      return ColoredBox(color: scheme.surfaceContainer);
    }
    return CachedNetworkImage(
      imageUrl: imageUrl!,
      fit: BoxFit.cover,
      placeholder: (_, __) => ColoredBox(color: scheme.surfaceContainer),
      errorWidget: (_, __, ___) => ColoredBox(color: scheme.surfaceContainer),
    );
  }
}
