import 'package:flutter/material.dart';

/// Recent query chips shared by the job feed and the saved-search screen.
class RecentQueryChips extends StatelessWidget {
  const RecentQueryChips({
    super.key,
    required this.queries,
    required this.onSelected,
    this.label = 'Recent searches',
  });

  final List<String> queries;
  final ValueChanged<String> onSelected;
  final String label;

  @override
  Widget build(BuildContext context) {
    if (queries.isEmpty) return const SizedBox.shrink();
    return Semantics(
      label: label,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: Theme.of(context).textTheme.labelLarge?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final query in queries)
                  ActionChip(
                    
                    avatar: const Icon(Icons.history_rounded, size: 16),
                    label: Text(query),
                    onPressed: () => onSelected(query),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
