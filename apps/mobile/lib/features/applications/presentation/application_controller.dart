import 'package:flutter/foundation.dart';

import '../../../features/notifications/data/notification_repository.dart';
import '../../../features/notifications/domain/app_notification.dart';
import '../data/application_repository.dart';
import '../domain/job_application.dart';

enum ApplicationLoadState { idle, loading, ready, error }

class ApplicationController extends ChangeNotifier {
  ApplicationController({
    required ApplicationRepository repository,
    required NotificationRepository notificationRepository,
    VoidCallback? onNotificationChanged,
  }) : _repository = repository,
       _notificationRepository = notificationRepository,
       _onNotificationChanged = onNotificationChanged;

  final ApplicationRepository _repository;
  final NotificationRepository _notificationRepository;
  final VoidCallback? _onNotificationChanged;

  ApplicationLoadState _state = ApplicationLoadState.idle;
  List<JobApplication> _items = const [];
  String? _errorMessage;

  ApplicationLoadState get state => _state;
  List<JobApplication> get items => _items;
  String? get errorMessage => _errorMessage;

  Future<void> load() async {
    _state = ApplicationLoadState.loading;
    _errorMessage = null;
    notifyListeners();
    try {
      _items = await _repository.listApplications();
      _state = ApplicationLoadState.ready;
    } catch (error) {
      _errorMessage = error.toString();
      _state = ApplicationLoadState.error;
    }
    notifyListeners();
  }

  Future<JobApplication?> create(String opportunityId) async {
    try {
      final application = await _repository.createApplication(opportunityId);
      _items = [
        application,
        ..._items.where((item) => item.id != application.id),
      ];
      notifyListeners();
      return application;
    } catch (error) {
      _errorMessage = error.toString();
      notifyListeners();
      return null;
    }
  }

  Future<bool> updateStatus(
    JobApplication application, {
    required String status,
    String? note,
  }) async {
    try {
      final updated = await _repository.updateStatus(
        application,
        status: status,
        note: note,
      );
      _items = [
        for (final item in _items)
          if (item.id == updated.id) updated else item,
      ];
      await _notificationRepository.addNotification(
        AppNotification(
          id: 'status-${updated.id}-${updated.version}',
          title: 'Application updated',
          body: 'Your application moved to ${updated.statusLabel}.',
          type: 'application_status',
          isRead: false,
          createdAt: DateTime.now(),
        ),
      );
      _onNotificationChanged?.call();
      notifyListeners();
      return true;
    } catch (error) {
      _errorMessage = error.toString();
      notifyListeners();
      return false;
    }
  }

  Future<JobApplication> getApplication(String id) async {
    final application = await _repository.getApplication(id);
    if (!_items.any((item) => item.id == id)) {
      _items = [application, ..._items];
      notifyListeners();
    }
    return application;
  }
}
