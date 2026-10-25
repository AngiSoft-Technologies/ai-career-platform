import 'package:flutter/material.dart';

import '../../../shared/widgets/match_score_badge.dart';
import '../../../shared/widgets/app_states.dart';
import '../domain/job_match.dart';

class MatchPanel extends StatelessWidget {
  const MatchPanel({super.key, required this.match});

  final JobMatch match;

  @override
  Widget build(BuildContext context) {
    return SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'Why this role fits',
                  style: Theme.of(context).textTheme.titleMedium
                      ?.copyWith(fontWeight: FontWeight.w700),
                ),
              ),
              MatchScoreBadge(score: match.score),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            match.explanation,
            style: Theme.of(context).textTheme.bodyMedium,
          ),
          if (match.gaps.isNotEmpty) ...[
            const SizedBox(height: 16),
            Text(
              'Skills to strengthen',
              style: Theme.of(context).textTheme.labelLarge,
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: match.gaps
                  .map(
                    (gap) => Chip(
                      avatar: const Icon(Icons.add_rounded, size: 16),
                      label: Text(gap),
                    ),
                  )
                  .toList(),
            ),
          ],
        ],
      ),
    );
  }
}
