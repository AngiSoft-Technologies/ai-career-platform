import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';

class AppPermissions {
  const AppPermissions._();

  static Future<bool> ensureNotifications(BuildContext context) async {
    final status = await Permission.notification.status;
    if (status.isGranted) return true;
    if (!context.mounted) return false;
    final ok = await _explain(
      context,
      title: 'Enable notifications',
      message: 'Get alerts for new matches, application updates, and follow-up reminders.',
    );
    if (!ok) return false;
    final result = await Permission.notification.request();
    return result.isGranted;
  }

  static Future<bool> ensureCalendar(BuildContext context) async {
    final status = await Permission.calendarFullAccess.status;
    if (status.isGranted) return true;
    if (!context.mounted) return false;
    final ok = await _explain(
      context,
      title: 'Calendar access',
      message: 'Add interview and follow-up reminders to your calendar.',
    );
    if (!ok) return false;
    final result = await Permission.calendarFullAccess.request();
    return result.isGranted;
  }

  static Future<bool> _explain(
    BuildContext context, {
    required String title,
    required String message,
  }) async {
    return await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
            title: Text(title),
            content: Text(message),
            actions: [
              TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Not now')),
              FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Continue')),
            ],
          ),
        ) ??
        false;
  }
}
