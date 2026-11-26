import 'dart:convert';

import '../../../core/networking/api_client.dart';
import '../../../core/networking/api_exception.dart';
import '../../../core/storage/local_database.dart';
import '../../../core/synchronization/offline_action.dart';
import '../domain/application_tracker.dart';

/// Reads an application's full timeline from the per-resource endpoints and
/// keeps the last good copy in LocalDatabase's generic sync_metadata table.
class ApplicationTrackerRepository {
  ApplicationTrackerRepository({
    required ApiClient apiClient,
    required LocalDatabase database,
  }) : _api = apiClient,
       _database = database;

  final ApiClient _api;
  final LocalDatabase _database;

  bool servedFromCache = false;

  Future<ApplicationTimeline> load(String applicationId) async {
    try {
      final responses = await Future.wait([
        _api.get('/v1/applications/$applicationId/timeline'),
        _api.get('/v1/applications/$applicationId/interviews'),
        _api.get('/v1/applications/$applicationId/notes'),
        _api.get('/v1/applications/$applicationId/attachments'),
      ]);
      final timeline = ApplicationTimeline(
        events: _list(
          responses[0],
          'timeline',
          'events',
        ).map(TimelineEvent.fromJson).toList(),
        interviews: _list(
          responses[1],
          'interviews',
          'items',
        ).map(ApplicationInterview.fromJson).toList(),
        notes: _list(
          responses[2],
          'notes',
          'items',
        ).map(ApplicationNote.fromJson).toList(),
        attachments: _list(
          responses[3],
          'attachments',
          'items',
        ).map(ApplicationAttachment.fromJson).toList(),
      );
      await _cache(applicationId, timeline);
      servedFromCache = false;
      return timeline;
    } on ApiException catch (error) {
      if (!error.isNetworkError && !error.isNotFound) rethrow;
      return _cached(applicationId);
    }
  }

  /// `.ics` comes back as plain text; ApiClient decodes non-JSON bodies to
  /// strings, so it can be handed straight to Share.shareXFiles.
  Future<String?> calendarInvite(String applicationId) async {
    try {
      final response = await _api.get(
        '/v1/applications/$applicationId/calendar.ics',
      );
      final ics = response?.toString() ?? '';
      if (ics.isNotEmpty) {
        await _database.setSyncMetadata('calendar_ics:$applicationId', ics);
      }
      return ics.isEmpty ? null : ics;
    } on ApiException catch (error) {
      if (!error.isNetworkError && !error.isNotFound) rethrow;
      return await _database.getSyncMetadata('calendar_ics:$applicationId');
    }
  }

  Future<ApplicationInterview> scheduleInterview(
    String applicationId, {
    required String stage,
    required DateTime startsAt,
    String location = '',
    String contact = '',
    String notes = '',
    bool isRemote = false,
  }) async {
    final body = <String, dynamic>{
      'stage': stage,
      'startsAt': startsAt.toUtc().toIso8601String(),
      'location': location,
      'contact': contact,
      'notes': notes,
      'isRemote': isRemote,
    };
    try {
      final response = await _api.post(
        '/v1/applications/$applicationId/interviews',
        body: body,
      );
      final interview = ApplicationInterview.fromJson(
        _map(response, 'interview'),
      );
      await _append(applicationId, interviews: [interview]);
      return interview;
    } on ApiException catch (error) {
      if (!error.isNetworkError && !error.isNotFound) rethrow;
      final interview = ApplicationInterview(
        id: 'local-${DateTime.now().microsecondsSinceEpoch}',
        applicationId: applicationId,
        stage: stage,
        startsAt: startsAt,
        location: location,
        contact: contact,
        notes: notes,
        isRemote: isRemote,
      );
      await _append(applicationId, interviews: [interview]);
      await _enqueue('schedule_interview', {
        'applicationId': applicationId,
        'body': body,
      }, applicationId);
      return interview;
    }
  }

  Future<ApplicationInterview> rescheduleInterview(
    String applicationId,
    ApplicationInterview interview, {
    DateTime? startsAt,
    String? location,
    String? contact,
  }) async {
    final updated = ApplicationInterview(
      id: interview.id,
      applicationId: applicationId,
      stage: interview.stage,
      startsAt: startsAt ?? interview.startsAt,
      location: location ?? interview.location,
      contact: contact ?? interview.contact,
      notes: interview.notes,
      isRemote: interview.isRemote,
    );
    final body = updated.toJson();
    if (interview.id.startsWith('local-')) {
      await _replaceInterview(applicationId, updated);
      await _enqueue('schedule_interview', {
        'applicationId': applicationId,
        'interviewId': interview.id,
        'body': body,
      }, applicationId);
      return updated;
    }
    try {
      final response = await _api.patch(
        '/v1/applications/$applicationId/interviews/${interview.id}',
        body: body,
      );
      final result = ApplicationInterview.fromJson(_map(response, 'interview'));
      await _replaceInterview(applicationId, result);
      return result;
    } on ApiException catch (error) {
      if (!error.isNetworkError && !error.isNotFound) rethrow;
      await _replaceInterview(applicationId, updated);
      await _enqueue('schedule_interview', {
        'applicationId': applicationId,
        'interviewId': interview.id,
        'body': body,
      }, applicationId);
      return updated;
    }
  }

  Future<ApplicationNote> addNote(
    String applicationId, {
    required String body,
  }) async {
    final payload = {'body': body};
    try {
      final response = await _api.post(
        '/v1/applications/$applicationId/notes',
        body: payload,
      );
      final note = ApplicationNote.fromJson(_map(response, 'note'));
      await _append(applicationId, notes: [note]);
      return note;
    } on ApiException catch (error) {
      if (!error.isNetworkError && !error.isNotFound) rethrow;
      final note = ApplicationNote(
        id: 'local-${DateTime.now().microsecondsSinceEpoch}',
        applicationId: applicationId,
        body: body,
        createdAt: DateTime.now(),
      );
      await _append(applicationId, notes: [note]);
      await _enqueue('add_application_note', {
        'applicationId': applicationId,
        'body': payload,
      }, applicationId);
      return note;
    }
  }

  Future<ApplicationAttachment> addAttachment(
    String applicationId, {
    required String name,
    required String url,
    String mimeType = '',
    int sizeBytes = 0,
  }) async {
    final payload = <String, dynamic>{
      'name': name,
      'url': url,
      'mimeType': mimeType,
      'sizeBytes': sizeBytes,
    };
    try {
      final response = await _api.post(
        '/v1/applications/$applicationId/attachments',
        body: payload,
      );
      final attachment = ApplicationAttachment.fromJson(
        _map(response, 'attachment'),
      );
      await _append(applicationId, attachments: [attachment]);
      return attachment;
    } on ApiException catch (error) {
      if (!error.isNetworkError && !error.isNotFound) rethrow;
      final attachment = ApplicationAttachment(
        id: 'local-${DateTime.now().microsecondsSinceEpoch}',
        applicationId: applicationId,
        name: name,
        url: url,
        mimeType: mimeType,
        sizeBytes: sizeBytes,
        createdAt: DateTime.now(),
      );
      await _append(applicationId, attachments: [attachment]);
      await _enqueue('add_application_attachment', {
        'applicationId': applicationId,
        'body': payload,
      }, applicationId);
      return attachment;
    }
  }

  Future<ApplicationTimeline> _cached(String applicationId) async {
    final raw = await _database.getSyncMetadata('timeline:$applicationId');
    servedFromCache = raw != null;
    if (raw == null) return const ApplicationTimeline();
    try {
      return ApplicationTimeline.fromJson(
        Map<String, dynamic>.from(jsonDecode(raw) as Map),
      );
    } on FormatException {
      return const ApplicationTimeline();
    }
  }

  Future<void> _cache(String applicationId, ApplicationTimeline timeline) =>
      _database.setSyncMetadata(
        'timeline:$applicationId',
        jsonEncode(timeline.toJson()),
      );

  Future<void> _append(
    String applicationId, {
    List<ApplicationInterview> interviews = const [],
    List<ApplicationNote> notes = const [],
    List<ApplicationAttachment> attachments = const [],
  }) async {
    final current = await _cached(applicationId);
    await _cache(
      applicationId,
      ApplicationTimeline(
        events: current.events,
        interviews: [...current.interviews, ...interviews],
        notes: [...current.notes, ...notes],
        attachments: [...current.attachments, ...attachments],
        nextAction: current.nextAction,
      ),
    );
  }

  Future<void> _replaceInterview(
    String applicationId,
    ApplicationInterview interview,
  ) async {
    final current = await _cached(applicationId);
    await _cache(
      applicationId,
      ApplicationTimeline(
        events: current.events,
        interviews: [
          for (final item in current.interviews)
            if (item.id != interview.id) item,
          interview,
        ],
        notes: current.notes,
        attachments: current.attachments,
        nextAction: current.nextAction,
      ),
    );
  }

  Future<void> _enqueue(
    String actionType,
    Map<String, dynamic> payload,
    String applicationId,
  ) async {
    final now = DateTime.now();
    await _database.enqueueAction(
      OfflineAction(
        idempotencyKey: '$actionType-${now.microsecondsSinceEpoch}',
        actionType: actionType,
        payload: payload,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
        entityType: 'application',
        entityId: applicationId,
      ),
    );
  }

  List<Map<String, dynamic>> _list(
    dynamic response,
    String key,
    String altKey,
  ) {
    if (response is List) {
      return response
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList();
    }
    if (response is Map) {
      final value = response[key] ?? response[altKey];
      if (value is List) {
        return value
            .whereType<Map>()
            .map((item) => Map<String, dynamic>.from(item))
            .toList();
      }
    }
    return const [];
  }

  Map<String, dynamic> _map(dynamic response, String key) {
    if (response is Map && response[key] is Map) {
      return Map<String, dynamic>.from(response[key] as Map);
    }
    if (response is Map) return Map<String, dynamic>.from(response);
    return <String, dynamic>{};
  }
}
