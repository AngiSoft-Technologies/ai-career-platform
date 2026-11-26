import 'package:flutter/foundation.dart';

import '../data/application_tracker_repository.dart';
import '../domain/application_tracker.dart';

enum ApplicationTimelineState { idle, loading, ready, error }

class ApplicationTimelineController extends ChangeNotifier {
  ApplicationTimelineController({required this.repository});

  final ApplicationTrackerRepository repository;

  ApplicationTimelineState _state = ApplicationTimelineState.idle;
  ApplicationTimeline _timeline = const ApplicationTimeline();
  String? _errorMessage;

  ApplicationTimelineState get state => _state;
  ApplicationTimeline get timeline => _timeline;
  String? get errorMessage => _errorMessage;
  bool get servedFromCache => repository.servedFromCache;

  Future<void> load(String applicationId) async {
    _state = ApplicationTimelineState.loading;
    _errorMessage = null;
    notifyListeners();
    try {
      _timeline = await repository.load(applicationId);
      _state = ApplicationTimelineState.ready;
    } catch (error) {
      _errorMessage = error.toString();
      _state = ApplicationTimelineState.error;
    }
    notifyListeners();
  }

  Future<bool> scheduleInterview(
    String applicationId, {
    required String stage,
    required DateTime startsAt,
    String location = '',
    String contact = '',
    String notes = '',
    bool isRemote = false,
  }) => _mutate(() async {
    await repository.scheduleInterview(
      applicationId,
      stage: stage,
      startsAt: startsAt,
      location: location,
      contact: contact,
      notes: notes,
      isRemote: isRemote,
    );
    await load(applicationId);
  });

  Future<bool> rescheduleInterview(
    String applicationId,
    ApplicationInterview interview, {
    DateTime? startsAt,
    String? location,
    String? contact,
  }) => _mutate(() async {
    await repository.rescheduleInterview(
      applicationId,
      interview,
      startsAt: startsAt,
      location: location,
      contact: contact,
    );
    await load(applicationId);
  });

  Future<bool> addNote(String applicationId, String body) => _mutate(() async {
    if (body.trim().isEmpty) return;
    await repository.addNote(applicationId, body: body.trim());
    await load(applicationId);
  });

  Future<bool> addAttachment(
    String applicationId, {
    required String name,
    required String url,
    String mimeType = '',
  }) => _mutate(() async {
    if (name.trim().isEmpty || url.trim().isEmpty) return;
    await repository.addAttachment(
      applicationId,
      name: name.trim(),
      url: url.trim(),
      mimeType: mimeType,
    );
    await load(applicationId);
  });

  Future<String?> calendarInvite(String applicationId) =>
      repository.calendarInvite(applicationId);

  Future<bool> _mutate(Future<void> Function() action) async {
    try {
      await action();
      _errorMessage = null;
      return true;
    } catch (error) {
      _errorMessage = error.toString();
      notifyListeners();
      return false;
    }
  }
}
