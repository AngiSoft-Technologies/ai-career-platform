import 'package:flutter/material.dart';

import '../../../shared/formatting/app_formatters.dart';
import '../../../shared/widgets/app_states.dart';
import 'opportunity_controller.dart';

/// One-tap filters for the roles candidates look for most often.
class QuickFilterChips extends StatelessWidget {
  const QuickFilterChips({super.key, required this.controller});

  final OpportunityController controller;

  @override
  Widget build(BuildContext context) {
    final filters = <(String, String, VoidCallback)>[
      (
        'Remote',
        'remote roles',
        () => controller.applyQuickFilter(workMode: 'remote'),
      ),
      (
        'I can hold',
        'roles you can hold',
        () => controller.applyQuickFilter(eligibility: 'eligible'),
      ),
      (
        'Senior',
        'senior roles',
        () => controller.applyQuickFilter(seniority: 'senior'),
      ),
      (
        'Kenya',
        'roles in Kenya',
        () => controller.applyQuickFilter(country: 'Kenya'),
      ),
    ];
    return Semantics(
      label: 'Quick filters',
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final filter in filters)
              ActionChip(
                label: Text(filter.$1),
                avatar: const Icon(Icons.flash_on_outlined, size: 15),
                onPressed: filter.$3,
              ),
          ],
        ),
      ),
    );
  }
}

/// Honest label for results served from SQLite while offline.
class StaleCacheBanner extends StatelessWidget {
  const StaleCacheBanner({super.key, required this.cachedAt});

  final DateTime cachedAt;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Showing cached results from ${AppFormatters.dateTime(cachedAt)}',
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
        child: SectionCard(
          color: Theme.of(context).colorScheme.tertiaryContainer,
          child: Row(
            children: [
              const Icon(Icons.history_toggle_off_rounded),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  'Showing cached results from '
                  '${AppFormatters.dateTime(cachedAt)}.',
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Sort menu for the feed. Icon-only buttons get both a tooltip and an
/// explicit semantics label.
class FeedSortMenu extends StatelessWidget {
  const FeedSortMenu({super.key, required this.controller});

  final OpportunityController controller;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: 'Sort opportunities. Current: ${controller.sort.label}',
      child: PopupMenuButton<OpportunitySort>(
        tooltip: 'Sort opportunities',
        onSelected: controller.setSort,
        itemBuilder: (context) => [
          for (final sort in OpportunitySort.values)
            PopupMenuItem<OpportunitySort>(
              value: sort,
              child: Text(sort.label),
            ),
        ],
        child: const Padding(
          padding: EdgeInsets.symmetric(horizontal: 12, vertical: 12),
          child: Icon(Icons.swap_vert_rounded),
        ),
      ),
    );
  }
}

/// Seen / saved / applied state for one card, in one small row.
class OpportunityStateChips extends StatelessWidget {
  const OpportunityStateChips({
    super.key,
    required this.isSaved,
    required this.isSeen,
    required this.isApplied,
  });

  final bool isSaved;
  final bool isSeen;
  final bool isApplied;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 6,
      runSpacing: 6,
      children: [
        if (isApplied)
          const Chip(
            avatar: Icon(Icons.check_circle_outline_rounded, size: 15),
            label: Text('Applied'),
            visualDensity: VisualDensity.compact,
          ),
        if (isSaved)
          const Chip(
            avatar: Icon(Icons.bookmark_rounded, size: 15),
            label: Text('Saved'),
            visualDensity: VisualDensity.compact,
          ),
        if (!isSeen)
          const Chip(
            avatar: Icon(Icons.fiber_new_outlined, size: 15),
            label: Text('New'),
            visualDensity: VisualDensity.compact,
          ),
      ],
    );
  }
}
