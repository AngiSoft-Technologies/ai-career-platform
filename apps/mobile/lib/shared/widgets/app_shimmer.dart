import 'package:flutter/material.dart';
import 'package:shimmer/shimmer.dart';

import '../theme/app_colors.dart';

class AppShimmer extends StatelessWidget {
  const AppShimmer({
    super.key,
    required this.child,
    this.enabled = true,
  });

  final Widget child;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;
    return Shimmer.fromColors(
      enabled: enabled,
      baseColor: colors.shimmerBase,
      highlightColor: colors.shimmerHighlight,
      child: child,
    );
  }
}

class ShimmerBox extends StatelessWidget {
  const ShimmerBox({
    super.key,
    this.width,
    this.height = 16,
    this.radius = 10,
  });

  final double? width;
  final double height;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(radius),
      ),
    );
  }
}

class ShimmerList extends StatelessWidget {
  const ShimmerList({super.key, this.count = 5, this.itemHeight = 110});

  final int count;
  final double itemHeight;

  @override
  Widget build(BuildContext context) {
    return AppShimmer(
      child: ListView.separated(
        physics: const NeverScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        itemCount: count,
        separatorBuilder: (_, __) => const SizedBox(height: 12),
        itemBuilder: (_, __) => ShimmerBox(height: itemHeight, radius: 20),
      ),
    );
  }
}
