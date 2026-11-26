import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../shared/widgets/app_states.dart';
import '../../../shared/widgets/match_score_badge.dart';
import '../domain/job_match.dart';
import '../domain/match_explanation.dart';

/// The "why" behind a score: labelled contribution bars, evidence-backed
/// explanations and a route into the fields the candidate can improve.
class MatchExplanationCard extends StatelessWidget {
  const MatchExplanationCard({
    super.key,
    required this.explanation,
    this.onImproveProfile,
    this.showImproveProfile = true,
  });

  final MatchExplanation explanation;
  final VoidCallback? onImproveProfile;
  final bool showImproveProfile;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final match = explanation.match;
    return SectionCard(
      child: Semantics(
        container: true,
        label: 'Match explanation, ${match.score.round()} percent',
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
            const SizedBox(height: 8),
            Semantics(
              container: true,
              label: 'Confidence: ${explanation.confidence}',
              child: Chip(
                avatar: const Icon(Icons.verified_outlined, size: 16),
                label: Text(explanation.confidence),
                visualDensity: VisualDensity.compact,
              ),
            ),
            if (match.explanation.isNotEmpty) ...[
              const SizedBox(height: 10),
              Text(
                match.explanation,
                style: Theme.of(context).textTheme.bodyMedium,
              ),
            ],
            const SizedBox(height: 16),
            Text(
              'Score contributions',
              style: Theme.of(context).textTheme.labelLarge,
            ),
            const SizedBox(height: 10),
            for (final factor in explanation.factors)
              _FactorBar(factor: factor),
            const SizedBox(height: 16),
            Text(
              'What the posting says',
              style: Theme.of(context).textTheme.labelLarge,
            ),
            const SizedBox(height: 8),
            for (final row in explanation.explanations)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Semantics(
                  container: true,
                  label: '${row.$1}: ${row.$2}',
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      SizedBox(
                        width: 92,
                        child: Text(
                          row.$1,
                          style: Theme.of(context).textTheme.labelMedium
                              ?.copyWith(
                                color: scheme.onSurfaceVariant,
                                fontWeight: FontWeight.w700,
                              ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          row.$2,
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            if (explanation.missingSkills.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(
                'Missing skills',
                style: Theme.of(context).textTheme.labelLarge,
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final gap in explanation.missingSkills)
                    Semantics(
                      container: true,
                      label: 'Missing skill $gap',
                      child: Chip(
                        avatar: const Icon(Icons.add_rounded, size: 16),
                        label: Text(gap),
                      ),
                    ),
                ],
              ),
            ],
            if (showImproveProfile) ...[
              const SizedBox(height: 16),
              Align(
                alignment: Alignment.centerLeft,
                child: Semantics(
                  button: true,
                  label: 'Improve profile',
                  child: FilledButton.tonalIcon(
                    onPressed:
                        onImproveProfile ?? () => context.go('/preferences'),
                    icon: const Icon(Icons.auto_awesome_outlined),
                    label: const Text('Improve profile'),
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _FactorBar extends StatelessWidget {
  const _FactorBar({required this.factor});

  final FactorContribution factor;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final percent = (factor.value * 100).round().clamp(0, 100);
    return Semantics(
      container: true,
      label: '${factor.label} contribution $percent percent. ${factor.reason}',
      child: Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    factor.label,
                    style: Theme.of(context).textTheme.bodyMedium
                        ?.copyWith(fontWeight: FontWeight.w700),
                  ),
                ),
                Text(
                  '$percent%',
                  style: Theme.of(context).textTheme.labelMedium?.copyWith(
                    color: scheme.onSurfaceVariant,
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            AppProgressBar(value: factor.value.clamp(0.0, 1.0)),
            const SizedBox(height: 4),
            Text(
              factor.reason,
              style: Theme.of(context).textTheme.bodySmall
                  ?.copyWith(color: scheme.onSurfaceVariant),
            ),
          ],
        ),
      ),
    );
  }
}
