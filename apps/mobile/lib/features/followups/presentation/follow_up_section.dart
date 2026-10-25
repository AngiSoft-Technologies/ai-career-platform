import 'package:flutter/material.dart';

import '../../../shared/formatting/app_formatters.dart';
import '../../../shared/widgets/app_states.dart';
import '../../../shared/widgets/status_chip.dart';
import '../domain/follow_up.dart';

class FollowUpSection extends StatelessWidget {
  const FollowUpSection({
    super.key,
    required this.followUps,
    required this.onMarkDone,
    this.isLoading = false,
  });

  final List<FollowUp> followUps;
  final Future<void> Function(FollowUp followUp) onMarkDone;
  final bool isLoading;

  @override
  Widget build(BuildContext context) {
    if (isLoading) return const LoadingState(label: 'Loading follow-ups…');
    if (followUps.isEmpty) {
      return const SectionCard(
        child: Text(
          'No follow-ups scheduled. Add one from an application workspace.',
        ),
      );
    }
    return Column(
      children: followUps
          .map(
            (followUp) => Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: SectionCard(
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              StatusChip(status: followUp.status),
                              const SizedBox(width: 8),
                              Text(
                                AppFormatters.date(followUp.dueAt),
                                style: Theme.of(context).textTheme.labelLarge,
                              ),
                            ],
                          ),
                          if (followUp.note.isNotEmpty) ...[
                            const SizedBox(height: 8),
                            Text(followUp.note),
                          ],
                        ],
                      ),
                    ),
                    if (followUp.isPending)
                      IconButton.filledTonal(
                        tooltip: 'Mark follow-up done',
                        onPressed: () => onMarkDone(followUp),
                        icon: const Icon(Icons.check_rounded),
                      ),
                  ],
                ),
              ),
            ),
          )
          .toList(),
    );
  }
}
