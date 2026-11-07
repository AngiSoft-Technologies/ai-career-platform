import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

class MatchScoreBadge extends StatelessWidget {
  const MatchScoreBadge({super.key, required this.score});

  final double score;

  @override
  Widget build(BuildContext context) {
    final percentage = score.round().clamp(0, 100);
    final colors = context.appColors;
    final color = percentage >= 75
        ? colors.insight
        : percentage >= 50
        ? colors.signal
        : Theme.of(context).colorScheme.error;
    return Semantics(
      label: '$percentage percent match',
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(
          '$percentage% match',
          style: Theme.of(context).textTheme.labelLarge
              ?.copyWith(color: color, fontWeight: FontWeight.w700),
        ),
      ),
    );
  }
}
