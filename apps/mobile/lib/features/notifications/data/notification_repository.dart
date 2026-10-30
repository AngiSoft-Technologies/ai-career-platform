import '../../../core/networking/api_client.dart';
import '../../../core/networking/api_exception.dart';
import '../../../core/storage/local_database.dart';
import '../../../core/synchronization/offline_action.dart';
import '../domain/app_notification.dart';

/// Notifications are server-owned.
///
/// The API is the only writer of the `notifications` table; this repository
/// pulls the list, caches it for offline reading, and forwards "mark all read"
/// to the server. Offline reads come from the cache, and a read made offline is
/// queued so it is not lost.
class NotificationRepository {
  NotificationRepository({
    required ApiClient apiClient,
    required LocalDatabase database,
  }) : _apiClient = apiClient,
       _database = database;

  final ApiClient _apiClient;
  final LocalDatabase _database;

  /// Fetches the server list and replaces the cache. A network failure leaves
  /// the existing cache intact, which is what offline mode reads.
  Future<void> refresh() async {
    try {
      final response = await _apiClient.get<Map<String, dynamic>>(
        '/me/notifications',
      );
      final items = (response['items'] as List? ?? const [])
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList(growable: false);
      await _database.replaceNotifications(items);
    } on ApiException catch (error) {
      if (error.isNetworkError) return;
      rethrow;
    }
  }

  Future<List<AppNotification>> listNotifications() async {
    final rows = await _database.cachedNotifications();
    return rows.map(AppNotification.fromJson).toList();
  }

  Future<int> unreadCount() => _database.unreadNotificationCount();

  Future<void> addNotification(AppNotification notification) {
    return _database.cacheNotification(notification.toJson());
  }

  Future<void> markAllRead() async {
    await _database.markAllNotificationsRead();
    try {
      await _apiClient.post('/me/notifications/read');
    } on ApiException catch (error) {
      if (!error.isNetworkError) rethrow;
      await _enqueueMarkRead();
    }
  }

  Future<void> _enqueueMarkRead() async {
    final now = DateTime.now();
    await _database.enqueueAction(
      OfflineAction(
        idempotencyKey: 'mark_notifications_read-${now.microsecondsSinceEpoch}',
        actionType: 'mark_notifications_read',
        payload: const {},
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      ),
    );
  }
}
