import 'package:add_2_calendar/add_2_calendar.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_timezone/flutter_timezone.dart';
import 'package:timezone/data/latest.dart' as tz;
import 'package:timezone/timezone.dart' as tz;

class ReminderService {
  ReminderService();
  final FlutterLocalNotificationsPlugin _local =
      FlutterLocalNotificationsPlugin();
  bool _initialized = false;

  Future<void> initialize() async {
    if (_initialized) return;
    tz.initializeTimeZones();
    try {
      final name = await FlutterTimezone.getLocalTimezone();
      tz.setLocalLocation(tz.getLocation(name));
    } catch (_) {}
    const android = AndroidInitializationSettings('@mipmap/ic_launcher');
    await _local.initialize(const InitializationSettings(android: android));
    _initialized = true;
  }

  Future<void> schedule({
    required int id,
    required String title,
    required String body,
    required DateTime when,
    String? payload,
  }) async {
    await initialize();
    await _local.zonedSchedule(
      id,
      title,
      body,
      tz.TZDateTime.from(when, tz.local),
      const NotificationDetails(
        android: AndroidNotificationDetails(
          'mboqara_reminders',
          'Reminders',
          importance: Importance.high,
          priority: Priority.high,
        ),
      ),
      androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
      payload: payload,
    );
  }

  Future<bool> addToCalendar({
    required String title,
    required String description,
    required DateTime start,
    DateTime? end,
    String? location,
  }) {
    final event = Event(
      title: title,
      description: description,
      location: location,
      startDate: start,
      endDate: end ?? start.add(const Duration(hours: 1)),
    );
    return Add2Calendar.addEvent2Cal(event);
  }
}
