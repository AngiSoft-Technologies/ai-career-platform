import 'package:flutter/material.dart';

class StatusChip extends StatelessWidget {
  const StatusChip({super.key, required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final (background, foreground) = switch (status.toUpperCase()) {
      'APPLIED' ||
      'ACKNOWLEDGED' ||
      'SCREENING' ||
      'INTERVIEW' ||
      'OFFER' => (scheme.primaryContainer, scheme.onPrimaryContainer),
      'REJECTED' ||
      'WITHDRAWN' ||
      'FAILED' ||
      'EXPIRED' => (scheme.errorContainer, scheme.onErrorContainer),
      'PENDING' => (scheme.tertiaryContainer, scheme.onTertiaryContainer),
      'SENT' => (scheme.secondaryContainer, scheme.onSecondaryContainer),
      _ => (scheme.surfaceContainerHighest, scheme.onSurfaceVariant),
    };
    return Semantics(
      label: 'Status $status',
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          color: background,
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(
          _label(status),
          style: Theme.of(context).textTheme.labelMedium
              ?.copyWith(color: foreground, fontWeight: FontWeight.w700),
        ),
      ),
    );
  }

  String _label(String value) {
    return value
        .toLowerCase()
        .split('_')
        .map(
          (part) => part.isEmpty
              ? part
              : '${part[0].toUpperCase()}${part.substring(1)}',
        )
        .join(' ');
  }
}
