import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../theme/app_colors.dart';
import 'app_shimmer.dart';

class LoadingState extends StatelessWidget {
  const LoadingState({super.key, this.label = 'Loading…'});

  final String label;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final colors = context.appColors;
    return Semantics(
      label: label,
      liveRegion: true,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              SizedBox(
                width: 54,
                height: 54,
                child: CircularProgressIndicator(
                  strokeWidth: 3.2,
                  color: colors.insight,
                  backgroundColor: scheme.surfaceContainerHighest,
                ),
              )
                  .animate(onPlay: (c) => c.repeat())
                  .scaleXY(begin: 0.96, end: 1.04, duration: 900.ms, curve: Curves.easeInOut)
                  .then()
                  .scaleXY(begin: 1.04, end: 0.96, duration: 900.ms, curve: Curves.easeInOut),
              const SizedBox(height: 18),
              Text(
                label,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                      color: scheme.onSurfaceVariant,
                      fontWeight: FontWeight.w600,
                    ),
              ),
              const SizedBox(height: 18),
              const AppShimmer(
                child: Column(
                  children: [
                    ShimmerBox(width: 220, height: 10),
                    SizedBox(height: 10),
                    ShimmerBox(width: 160, height: 10),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class ErrorState extends StatelessWidget {
  const ErrorState({super.key, required this.message, this.onRetry});

  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.cloud_off_rounded, size: 52, color: scheme.error),
            const SizedBox(height: 16),
            Text(
              message,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyLarge,
            ),
            if (onRetry != null) ...[
              const SizedBox(height: 20),
              FilledButton.icon(
                onPressed: onRetry,
                icon: const Icon(Icons.refresh_rounded),
                label: const Text('Try again'),
              ),
            ],
          ],
        ).animate().fadeIn(duration: 250.ms).moveY(begin: 8, end: 0),
      ),
    );
  }
}

class EmptyState extends StatelessWidget {
  const EmptyState({
    super.key,
    required this.title,
    required this.message,
    this.icon = Icons.inbox_rounded,
    this.action,
  });

  final String title;
  final String message;
  final IconData icon;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final colors = context.appColors;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 76,
              height: 76,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: LinearGradient(
                  colors: [
                    colors.insight.withValues(alpha: 0.18),
                    colors.signal.withValues(alpha: 0.12),
                  ],
                ),
                border: Border.all(color: scheme.outlineVariant.withValues(alpha: 0.4)),
              ),
              child: Icon(icon, size: 36, color: colors.insight),
            ),
            const SizedBox(height: 18),
            Text(
              title,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 8),
            Text(
              message,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
            ),
            if (action != null) ...[const SizedBox(height: 20), action!],
          ],
        ).animate().fadeIn(duration: 260.ms).moveY(begin: 10, end: 0),
      ),
    );
  }
}

class SectionCard extends StatelessWidget {
  const SectionCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.onTap,
    this.color,
  });

  final Widget child;
  final EdgeInsets padding;
  final VoidCallback? onTap;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final card = Container(
      width: double.infinity,
      padding: padding,
      decoration: BoxDecoration(
        color: color ?? scheme.surfaceContainerLow.withValues(alpha: isDark ? 0.86 : 0.94),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: scheme.outlineVariant.withValues(alpha: 0.5)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: isDark ? 0.18 : 0.04),
            blurRadius: isDark ? 20 : 16,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: child,
    );
    if (onTap == null) return card;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: card,
      ),
    );
  }
}

class AppProgressBar extends StatelessWidget {
  const AppProgressBar({
    super.key,
    required this.value,
    this.height = 8,
    this.color,
    this.backgroundColor,
  });

  final double value;
  final double height;
  final Color? color;
  final Color? backgroundColor;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final colors = context.appColors;
    final v = value.clamp(0.0, 1.0);
    return LayoutBuilder(
      builder: (context, constraints) {
        final w = constraints.maxWidth;
        return Container(
          height: height,
          decoration: BoxDecoration(
            color: backgroundColor ?? scheme.surfaceContainerHighest,
            borderRadius: BorderRadius.circular(height),
          ),
          clipBehavior: Clip.antiAlias,
          child: Align(
            alignment: Alignment.centerLeft,
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 500),
              curve: Curves.easeOutCubic,
              width: w * v,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(height),
                gradient: LinearGradient(
                  colors: [
                    color ?? colors.insight,
                    (color ?? colors.insight).withValues(alpha: 0.7),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}
