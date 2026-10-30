import 'package:flutter/foundation.dart';

import '../data/notification_repository.dart';
import '../domain/app_notification.dart';

enum NotificationLoadState { idle, loading, ready, error }

class NotificationController extends ChangeNotifier {
  NotificationController({required NotificationRepository repository})
    : _repository = repository;

  final NotificationRepository _repository;

  NotificationLoadState _state = NotificationLoadState.idle;
  List<AppNotification> _items = const [];
  int _unreadCount = 0;
  String? _errorMessage;

  NotificationLoadState get state => _state;
  List<AppNotification> get items => _items;
  int get unreadCount => _unreadCount;
  String? get errorMessage => _errorMessage;

  Future<void> load() async {
    _state = NotificationLoadState.loading;
    _errorMessage = null;
    notifyListeners();
    try {
      // Server first; a network failure falls back to the cache inside the
      // repository, so this does not throw when offline.
      await _repository.refresh();
      _items = await _repository.listNotifications();
      _unreadCount = await _repository.unreadCount();
      _state = NotificationLoadState.ready;
    } catch (error) {
      _errorMessage = error.toString();
      _state = NotificationLoadState.error;
    }
    notifyListeners();
  }

  Future<void> markAllRead() async {
    await _repository.markAllRead();
    await load();
  }

  Future<void> refreshBadge() async {
    _unreadCount = await _repository.unreadCount();
    notifyListeners();
  }
}
