import 'package:flutter/material.dart';

class MatchScoreBadge extends StatelessWidget {
  const MatchScoreBadge({super.key, required this.score});

  final double score;

  @override
  Widget build(BuildContext context) {
    final percentage = score.round().clamp(0, 100);
    final scheme = Theme.of(context).colorScheme;
    final color = percentage >= 75
        ? scheme.primary
        : percentage >= 50
        ? scheme.tertiary
        : scheme.error;
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
