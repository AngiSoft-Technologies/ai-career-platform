import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../shared/formatting/app_formatters.dart';
import '../../../shared/widgets/app_states.dart';
import '../domain/app_notification.dart';
import 'notification_controller.dart';

class NotificationScreen extends StatefulWidget {
  const NotificationScreen({super.key});

  @override
  State<NotificationScreen> createState() => _NotificationScreenState();
}

class _NotificationScreenState extends State<NotificationScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<NotificationController>().load();
    });
  }

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<NotificationController>();
    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: [
          if (controller.unreadCount > 0)
            TextButton(
              onPressed: controller.markAllRead,
              child: const Text('Mark all read'),
            ),
        ],
      ),
      body: switch (controller.state) {
        NotificationLoadState.idle || NotificationLoadState.loading =>
          const LoadingState(label: 'Loading notifications…'),
        NotificationLoadState.error => ErrorState(
          message: controller.errorMessage ?? 'Unable to load notifications',
          onRetry: controller.load,
        ),
        NotificationLoadState.ready =>
          controller.items.isEmpty
              ? const EmptyState(
                  title: 'You are all caught up',
                  message: 'Application updates and follow-up reminders appear here.',
                  icon: Icons.notifications_none_rounded,
                )
              : RefreshIndicator(
                  onRefresh: controller.load,
                  child: ListView.separated(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                    itemCount: controller.items.length,
                    separatorBuilder: (_, index) => const SizedBox(height: 10),
                    itemBuilder: (context, index) => _NotificationTile(
                      notification: controller.items[index],
                    ),
                  ),
                ),
      },
    );
  }
}

class _NotificationTile extends StatelessWidget {
  const _NotificationTile({required this.notification});

  final AppNotification notification;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Semantics(
      label: '${notification.title}. ${notification.body}',
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: notification.isRead
              ? scheme.surfaceContainerLow
              : scheme.primaryContainer.withValues(alpha: 0.55),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: scheme.outlineVariant.withValues(alpha: 0.6),
          ),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            CircleAvatar(
              backgroundColor: notification.isRead
                  ? scheme.surfaceContainerHighest
                  : scheme.primary,
              foregroundColor: notification.isRead
                  ? scheme.onSurfaceVariant
                  : scheme.onPrimary,
              child: Icon(_icon(notification.type), size: 20),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          notification.title,
                          style: Theme.of(context).textTheme.titleSmall
                              ?.copyWith(fontWeight: FontWeight.w700),
                        ),
                      ),
                      Text(
                        AppFormatters.relativeDate(notification.createdAt),
                        style: Theme.of(context).textTheme.labelSmall,
                      ),
                    ],
                  ),
                  if (notification.body.isNotEmpty) ...[
                    const SizedBox(height: 5),
                    Text(notification.body),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  IconData _icon(String type) {
    return switch (type) {
      'application_status' => Icons.assignment_turned_in_outlined,
      'followup' => Icons.notifications_active_outlined,
      _ => Icons.auto_awesome_rounded,
    };
  }
}
