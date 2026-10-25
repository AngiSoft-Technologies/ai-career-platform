import '../../../core/networking/api_client.dart';
import '../../../core/networking/api_exception.dart';
import '../../../core/storage/local_database.dart';
import '../../../core/synchronization/offline_action.dart';
import '../domain/follow_up.dart';

class FollowUpRepository {
  FollowUpRepository({
    required ApiClient apiClient,
    required LocalDatabase database,
  }) : _apiClient = apiClient,
       _database = database;

  final ApiClient _apiClient;
  final LocalDatabase _database;

  Future<List<FollowUp>> listFollowUps({String? status}) async {
    try {
      final response = await _apiClient.get(
        '/followups',
        query: status == null ? null : {'status': status},
      );
      final followUps = _followUpList(response).map(FollowUp.fromJson).toList();
      await Future.wait(
        followUps.map((item) => _database.cacheFollowUp(item.toJson())),
      );
      return followUps;
    } on ApiException catch (error) {
      if (!error.isNotFound && !error.isNetworkError) rethrow;
      final cached = await _database.cachedFollowUps();
      return cached
          .map(FollowUp.fromJson)
          .where((item) => status == null || item.status == status)
          .toList();
    }
  }

  Future<FollowUp> schedule({
    required String applicationId,
    required DateTime dueAt,
    String note = '',
  }) async {
    final body = <String, dynamic>{
      'dueAt': dueAt.toUtc().toIso8601String(),
      if (note.isNotEmpty) 'note': note,
    };
    try {
      final response = await _apiClient.post(
        '/applications/$applicationId/followups',
        body: body,
      );
      final followUp = FollowUp.fromJson(_followUpMap(response));
      await _database.cacheFollowUp(followUp.toJson());
      return followUp;
    } on ApiException catch (error) {
      if (!error.isNotFound && !error.isNetworkError) rethrow;
      final now = DateTime.now();
      final followUp = FollowUp(
        id: 'local-${now.microsecondsSinceEpoch}',
        applicationId: applicationId,
        dueAt: dueAt,
        status: 'PENDING',
        note: note,
        createdAt: now,
        updatedAt: now,
      );
      await _database.cacheFollowUp(followUp.toJson());
      await _enqueue(
        'schedule_followup',
        {'applicationId': applicationId, 'body': body},
        status: error.isNotFound ? 'failed' : 'pending',
        error: error.isNotFound ? error.message : null,
      );
      return followUp;
    }
  }

  Future<FollowUp> updateStatus(
    FollowUp followUp, {
    required String status,
  }) async {
    final body = <String, dynamic>{'id': followUp.id, 'status': status};
    try {
      final response = await _apiClient.patch('/followups', body: body);
      final updated = FollowUp.fromJson(_followUpMap(response));
      await _database.cacheFollowUp(updated.toJson());
      return updated;
    } on ApiException catch (error) {
      if (!error.isNotFound && !error.isNetworkError) rethrow;
      final updated = FollowUp(
        id: followUp.id,
        applicationId: followUp.applicationId,
        dueAt: followUp.dueAt,
        status: status,
        note: followUp.note,
        createdAt: followUp.createdAt,
        updatedAt: DateTime.now(),
      );
      await _database.cacheFollowUp(updated.toJson());
      await _enqueue(
        'update_followup',
        body,
        status: error.isNotFound ? 'failed' : 'pending',
        error: error.isNotFound ? error.message : null,
      );
      return updated;
    }
  }

  Map<String, dynamic> _followUpMap(dynamic response) {
    if (response is Map && response['followup'] is Map) {
      return Map<String, dynamic>.from(response['followup'] as Map);
    }
    if (response is Map) return Map<String, dynamic>.from(response);
    return <String, dynamic>{};
  }

  List<Map<String, dynamic>> _followUpList(dynamic response) {
    if (response is Map && response['followups'] is List) {
      return (response['followups'] as List)
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList();
    }
    if (response is List) {
      return response
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList();
    }
    return const [];
  }

  Future<void> _enqueue(
    String type,
    Map<String, dynamic> payload, {
    required String status,
    String? error,
  }) async {
    final now = DateTime.now();
    await _database.enqueueAction(
      OfflineAction(
        idempotencyKey: '$type-${now.microsecondsSinceEpoch}',
        actionType: type,
        payload: payload,
        status: status,
        createdAt: now,
        updatedAt: now,
        lastError: error,
      ),
    );
  }
}
