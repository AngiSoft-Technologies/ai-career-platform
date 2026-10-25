import '../../../core/storage/local_database.dart';
import '../domain/app_notification.dart';

class NotificationRepository {
  NotificationRepository({required LocalDatabase database})
    : _database = database;

  final LocalDatabase _database;

  Future<List<AppNotification>> listNotifications() async {
    final rows = await _database.cachedNotifications();
    return rows.map(AppNotification.fromJson).toList();
  }

  Future<int> unreadCount() => _database.unreadNotificationCount();

  Future<void> addNotification(AppNotification notification) {
    return _database.cacheNotification(notification.toJson());
  }

  Future<void> markAllRead() => _database.markAllNotificationsRead();
}
