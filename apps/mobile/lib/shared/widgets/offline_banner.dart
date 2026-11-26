import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/synchronization/sync_controller.dart';
import '../formatting/app_formatters.dart';

class OfflineBanner extends StatelessWidget {
  const OfflineBanner({super.key});

  @override
  Widget build(BuildContext context) {
    final sync = context.watch<SyncController>();
    final scheme = Theme.of(context).colorScheme;
    final hasIssues = !sync.isOnline || sync.pendingCount > 0 || sync.failedCount > 0 || sync.conflictCount > 0;
    if (!hasIssues) return const SizedBox.shrink();

    final Color bg;
    final Color fg;
    final IconData icon;
    final String text;
    if (!sync.isOnline) {
      bg = scheme.errorContainer;
      fg = scheme.onErrorContainer;
      icon = Icons.cloud_off_rounded;
      text = 'Offline. Changes are saved locally and will sync when you reconnect.';
    } else if (sync.conflictCount > 0) {
      bg = scheme.secondaryContainer;
      fg = scheme.onSecondaryContainer;
      icon = Icons.warning_amber_rounded;
      text = '${sync.conflictCount} sync conflict${sync.conflictCount == 1 ? '' : 's'} need review.';
    } else if (sync.failedCount > 0) {
      bg = scheme.errorContainer;
      fg = scheme.onErrorContainer;
      icon = Icons.sync_problem_rounded;
      text = '${sync.failedCount} action${sync.failedCount == 1 ? '' : 's'} failed to sync.';
    } else {
      bg = scheme.tertiaryContainer;
      fg = scheme.onTertiaryContainer;
      icon = Icons.sync_rounded;
      final last = sync.lastSyncAt == null ? '' : ' Last synced ${AppFormatters.relativeDate(sync.lastSyncAt!)}.';
      text = '${sync.pendingCount} pending action${sync.pendingCount == 1 ? '' : 's'} waiting to sync.$last';
    }

    return Material(
      color: bg,
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          child: Row(
            children: [
              Icon(icon, size: 18, color: fg),
              const SizedBox(width: 10),
              Expanded(child: Text(text, style: TextStyle(color: fg, fontWeight: FontWeight.w600))),
              if (sync.isOnline && (sync.pendingCount > 0 || sync.failedCount > 0 || sync.conflictCount > 0))
                TextButton(
                  onPressed: sync.isSyncing ? null : sync.syncNow,
                  child: Text(sync.isSyncing ? 'Syncing...' : 'Retry'),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
