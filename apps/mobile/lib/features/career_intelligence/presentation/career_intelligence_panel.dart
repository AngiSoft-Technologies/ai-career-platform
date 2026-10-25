import 'package:flutter/material.dart';

import '../../../shared/widgets/app_states.dart';
import '../domain/career_intelligence.dart';

class CareerIntelligencePanel extends StatelessWidget {
  const CareerIntelligencePanel({super.key, required this.insights});

  final CareerIntelligence insights;

  @override
  Widget build(BuildContext context) {
    return SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                Icons.auto_awesome_rounded,
                color: Theme.of(context).colorScheme.primary,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  'Career intelligence',
                  style: Theme.of(context).textTheme.titleMedium
                      ?.copyWith(fontWeight: FontWeight.w700),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(insights.summary, style: Theme.of(context).textTheme.bodyMedium),
          if (insights.strengths.isNotEmpty) ...[
            const SizedBox(height: 16),
            _BulletSection(
              title: 'Strengths',
              icon: Icons.trending_up_rounded,
              values: insights.strengths,
              color: Theme.of(context).colorScheme.primary,
            ),
          ],
          if (insights.gaps.isNotEmpty) ...[
            const SizedBox(height: 14),
            _BulletSection(
              title: 'Gaps',
              icon: Icons.trending_down_rounded,
              values: insights.gaps,
              color: Theme.of(context).colorScheme.error,
            ),
          ],
          if (insights.recommendations.isNotEmpty) ...[
            const SizedBox(height: 14),
            _BulletSection(
              title: 'Next steps',
              icon: Icons.arrow_forward_rounded,
              values: insights.recommendations,
              color: Theme.of(context).colorScheme.tertiary,
            ),
          ],
        ],
      ),
    );
  }
}

class _BulletSection extends StatelessWidget {
  const _BulletSection({
    required this.title,
    required this.icon,
    required this.values,
    required this.color,
  });

  final String title;
  final IconData icon;
  final List<String> values;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: Theme.of(context).textTheme.labelLarge),
        const SizedBox(height: 6),
        for (final value in values)
          Padding(
            padding: const EdgeInsets.only(bottom: 5),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(icon, size: 17, color: color),
                const SizedBox(width: 8),
                Expanded(child: Text(value)),
              ],
            ),
          ),
      ],
    );
  }
}
