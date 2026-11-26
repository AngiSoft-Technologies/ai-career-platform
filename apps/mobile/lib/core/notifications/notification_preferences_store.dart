import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../../features/notifications/domain/notification_preferences.dart';

class NotificationPreferencesStore {
  static const _key = 'notification_prefs_v1';
  Future<NotificationPreferences> load() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_key);
    if (raw == null) return const NotificationPreferences();
    return NotificationPreferences.fromJson(Map<String, dynamic>.from(jsonDecode(raw) as Map));
  }

  Future<void> save(NotificationPreferences value) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, jsonEncode(value.toJson()));
  }
}
