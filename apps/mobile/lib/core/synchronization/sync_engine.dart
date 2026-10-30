import '../networking/api_client.dart';
import '../networking/api_exception.dart';
import '../storage/local_database.dart';
import 'offline_action.dart';

class SyncRunResult {
  const SyncRunResult({
    required this.completed,
    required this.failed,
    required this.pending,
  });

  final int completed;
  final int failed;
  final int pending;
}

class SyncEngine {
  SyncEngine({required ApiClient apiClient, required LocalDatabase database})
    : _apiClient = apiClient,
      _database = database;

  final ApiClient _apiClient;
  final LocalDatabase _database;

  Future<SyncRunResult> syncNow() async {
    final actions = await _database.pendingActions();
    final resolvedIds = <String, String>{};
    var completed = 0;
    var failed = 0;
    for (final action in actions) {
      try {
        final mapping = await _execute(_resolveAction(action, resolvedIds));
        if (mapping != null) {
          resolvedIds.addAll(mapping);
          for (final entry in mapping.entries) {
            await _database.replacePendingActionReference(
              entry.key,
              entry.value,
            );
          }
        }
        await _database.updateAction(
          action.idempotencyKey,
          status: 'completed',
        );
        completed++;
      } on ApiException catch (error) {
        if (error.isNetworkError) {
          await _database.updateAction(
            action.idempotencyKey,
            status: 'pending',
            error: error.message,
          );
        } else {
          await _database.updateAction(
            action.idempotencyKey,
            status: 'failed',
            error: error.message,
          );
          failed++;
        }
      } catch (error) {
        await _database.updateAction(
          action.idempotencyKey,
          status: 'failed',
          error: error.toString(),
        );
        failed++;
      }
    }
    final pending = await _database.actionCount(status: 'pending');
    return SyncRunResult(
      completed: completed,
      failed: failed,
      pending: pending,
    );
  }

  OfflineAction _resolveAction(
    OfflineAction action,
    Map<String, String> resolvedIds,
  ) {
    dynamic resolve(dynamic value) {
      if (value is String) return resolvedIds[value] ?? value;
      if (value is List) return value.map(resolve).toList();
      if (value is Map) {
        return value.map((key, item) => MapEntry(key, resolve(item)));
      }
      return value;
    }

    return OfflineAction(
      idempotencyKey: action.idempotencyKey,
      actionType: action.actionType,
      payload: Map<String, dynamic>.from(resolve(action.payload) as Map),
      status: action.status,
      createdAt: action.createdAt,
      updatedAt: action.updatedAt,
      lastError: action.lastError,
    );
  }

  Future<Map<String, String>?> _execute(OfflineAction action) async {
    switch (action.actionType) {
      case 'create_application':
        {
          final response = await _apiClient.post(
            '/applications',
            body: {'opportunityId': action.payload['opportunityId']},
          );
          final serverApplication = _nestedMap(response, 'application');
          final localId = action.payload['localId'] as String?;
          final serverId = serverApplication['id'] as String?;
          if (localId != null && serverId != null) {
            await _database.remapLocalApplicationId(localId, serverApplication);
            return {localId: serverId};
          }
          return null;
        }
      case 'update_application_status':
        await _apiClient.patch(
          '/applications/${action.payload['id']}/status',
          body: action.payload['body'],
        );
        return null;
      case 'update_profile':
        await _apiClient.put('/profile', body: action.payload);
        return null;
      case 'update_preferences':
        await _apiClient.put('/profile/preferences', body: action.payload);
        return null;
      case 'schedule_followup':
        final response = await _apiClient.post(
          '/applications/${action.payload['applicationId']}/followups',
          body: action.payload['body'],
        );
        final followUp = _nestedMap(response, 'followup');
        final localId = action.payload['localFollowUpId'] as String?;
        final serverId = followUp['id'] as String?;
        if (localId != null && serverId != null) {
          await _database.remapLocalFollowUpId(localId, serverId);
          return {localId: serverId};
        }
        return null;
      case 'update_followup':
        await _apiClient.patch(
          '/followups/${action.payload['id']}',
          body: {'status': action.payload['status']},
        );
        return null;
      case 'generate_document':
        await _apiClient.post('/documents/generate', body: action.payload);
        return null;
      case 'mark_notifications_read':
        await _apiClient.post('/me/notifications/read');
        return null;
      default:
        throw ApiException(
          statusCode: 400,
          message: 'Unknown offline action ${action.actionType}',
        );
    }
  }

  Map<String, dynamic> _nestedMap(dynamic value, String key) {
    if (value is Map && value[key] is Map) {
      return Map<String, dynamic>.from(value[key] as Map);
    }
    if (value is Map) return Map<String, dynamic>.from(value);
    return <String, dynamic>{};
  }
}
