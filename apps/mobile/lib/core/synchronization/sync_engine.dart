import 'dart:math';

import '../networking/api_client.dart';
import '../networking/api_exception.dart';
import '../storage/local_database.dart';
import 'offline_action.dart';

class SyncRunResult {
  const SyncRunResult({
    required this.completed,
    required this.failed,
    required this.pending,
    required this.conflicts,
    this.syncedAt,
  });

  final int completed;
  final int failed;
  final int pending;
  final int conflicts;

  /// Null when anything failed or conflicted: "last synced" must never claim
  /// a clean snapshot when the queue still holds unresolved work.
  final DateTime? syncedAt;
}

class SyncOutcome {
  const SyncOutcome({
    this.idMapping = const <String, String>{},
    this.serverVersion,
    this.serverUpdatedAt,
    this.serverData,
  });

  final Map<String, String> idMapping;
  final int? serverVersion;
  final DateTime? serverUpdatedAt;
  final Map<String, dynamic>? serverData;
}

/// Replays the local outbox against the API.
///
/// The outbox is the write authority while offline: every mutation is stored
/// before it is attempted, carries an idempotency key, and is only removed
/// once the server has acknowledged it. Conflicts are preserved with the
/// server snapshot so the UI can offer a real merge instead of silently
/// overwriting either side.
class SyncEngine {
  SyncEngine({required ApiClient apiClient, required LocalDatabase database})
    : _apiClient = apiClient,
      _database = database;

  final ApiClient _apiClient;
  final LocalDatabase _database;
  final Random _random = Random();

  Future<SyncRunResult> syncNow() async {
    final actions = await _database.pendingActions();
    final resolvedIds = <String, String>{};
    var completed = 0;
    var failed = 0;
    var conflicts = 0;
    final now = DateTime.now();

    for (final action in actions) {
      if (action.nextRetryAt != null && action.nextRetryAt!.isAfter(now)) {
        continue;
      }
      // Mark in-flight before sending. A crash mid-request then leaves a
      // 'syncing' row that startup can requeue instead of a 'pending' row
      // that looks untouched.
      await _database.updateAction(
        action.idempotencyKey,
        status: 'syncing',
        clearNextRetryAt: false,
      );
      try {
        final outcome = await _execute(_resolveAction(action, resolvedIds));
        resolvedIds.addAll(outcome.idMapping);
        for (final entry in outcome.idMapping.entries) {
          await _database.replacePendingActionReference(entry.key, entry.value);
        }
        await _database.updateAction(
          action.idempotencyKey,
          status: 'completed',
          error: null,
          retryCount: 0,
          action: action,
          serverVersion: outcome.serverVersion,
          serverUpdatedAt: outcome.serverUpdatedAt,
          serverPayload: outcome.serverData,
        );
        final id = action.entityId == null
            ? null
            : resolvedIds[action.entityId!] ?? action.entityId!;
        if (action.entityType != null && id != null) {
          await _database.setEntitySyncState(
            action.entityType!,
            id,
            'synced',
            serverVersion: outcome.serverVersion,
            serverUpdatedAt: outcome.serverUpdatedAt,
          );
        }
        completed++;
      } on ApiException catch (error) {
        if (error.isConflict) {
          final serverVersion = _serverVersion(error.serverData);
          final serverUpdatedAt = _serverUpdatedAt(error.serverData);
          await _database.updateAction(
            action.idempotencyKey,
            status: 'conflict',
            error: error.message,
            retryCount: action.retryCount,
            serverVersion: serverVersion,
            serverUpdatedAt: serverUpdatedAt,
            serverPayload: error.serverData,
          );
          if (action.entityType != null && action.entityId != null) {
            await _database.setEntitySyncState(
              action.entityType!,
              action.entityId!,
              'conflict',
              serverVersion: serverVersion,
              serverUpdatedAt: serverUpdatedAt,
              lastError: error.message,
            );
          }
          conflicts++;
        } else if (error.isNetworkError || error.isServerError) {
          final retryCount = action.retryCount + 1;
          // Exponential backoff with jitter: without jitter every device that
          // lost the network at the same moment retries in lockstep.
          final exponent = retryCount.clamp(0, 6);
          final base = (2 << exponent).clamp(2, 300);
          final jitter = _random.nextInt((base * 0.25).round() + 1);
          final backoffSeconds = (base + jitter).clamp(2, 300);
          await _database.updateAction(
            action.idempotencyKey,
            status: 'pending',
            error: error.message,
            retryCount: retryCount,
            nextRetryAt: DateTime.now().add(Duration(seconds: backoffSeconds)),
          );
          if (action.entityType != null && action.entityId != null) {
            await _database.setEntitySyncState(
              action.entityType!,
              action.entityId!,
              'pending',
              lastError: error.message,
            );
          }
        } else {
          await _database.updateAction(
            action.idempotencyKey,
            status: 'failed',
            error: error.message,
            retryCount: action.retryCount,
          );
          if (action.entityType != null && action.entityId != null) {
            await _database.setEntitySyncState(
              action.entityType!,
              action.entityId!,
              'failed',
              lastError: error.message,
            );
          }
          failed++;
        }
      } catch (error) {
        await _database.updateAction(
          action.idempotencyKey,
          status: 'failed',
          error: error.toString(),
          retryCount: action.retryCount,
        );
        if (action.entityType != null && action.entityId != null) {
          await _database.setEntitySyncState(
            action.entityType!,
            action.entityId!,
            'failed',
            lastError: error.toString(),
          );
        }
        failed++;
      }
    }

    final pending = await _database.actionCount(status: 'pending');
    final otherFailures =
        await _database.actionCount(status: 'failed') +
        await _database.actionCount(status: 'conflict');
    final clean = failed == 0 && conflicts == 0 && otherFailures == 0;
    if (clean) {
      await _database.setSyncMetadata(
        'last_sync_at',
        DateTime.now().toIso8601String(),
      );
    }
    await _database.setSyncMetadata(
      'last_sync_attempt_at',
      DateTime.now().toIso8601String(),
    );
    return SyncRunResult(
      completed: completed,
      failed: failed,
      pending: pending,
      conflicts: conflicts,
      syncedAt: clean ? DateTime.now() : null,
    );
  }

  /// Applies a user's decision and immediately replays that action.
  Future<SyncRunResult> resolveConflict(
    String idempotencyKey,
    String resolution, {
    Map<String, dynamic>? mergedPayload,
  }) async {
    await _database.resolveConflict(
      idempotencyKey,
      resolution,
      mergedPayload: mergedPayload,
    );
    return syncNow();
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
      retryCount: action.retryCount,
      entityType: action.entityType,
      entityId: action.entityId,
      nextRetryAt: action.nextRetryAt,
      serverVersion: action.serverVersion,
      serverUpdatedAt: action.serverUpdatedAt,
      serverPayload: action.serverPayload,
      conflictResolution: action.conflictResolution,
    );
  }

  Future<SyncOutcome> _execute(OfflineAction action) async {
    final payload = action.payload;
    dynamic response;
    Map<String, String> mapping = const {};
    switch (action.actionType) {
      case 'create_application':
        response = await _apiClient.post(
          '/applications',
          body: {'opportunityId': payload['opportunityId']},
          idempotencyKey: action.idempotencyKey,
        );
        {
          final localId = payload['localId'] as String?;
          final server = _nestedMap(response, 'application');
          final serverId = server['id'] as String?;
          if (localId != null && serverId != null) {
            await _database.remapLocalApplicationId(localId, server);
            mapping = {localId: serverId};
          }
        }
        break;
      case 'schedule_followup':
        response = await _apiClient.post(
          '/applications/${payload['applicationId']}/followups',
          body: payload['body'],
          idempotencyKey: action.idempotencyKey,
        );
        {
          final localId = payload['localFollowUpId'] as String?;
          final serverId = _nestedMap(response, 'followup')['id'] as String?;
          if (localId != null && serverId != null) {
            await _database.remapLocalFollowUpId(localId, serverId);
            mapping = {localId: serverId};
          }
        }
        break;
      case 'update_application_status':
        response = await _apiClient.patch(
          '/applications/${payload['id']}/status',
          body: _versionedBody(payload['body'], action),
          idempotencyKey: action.idempotencyKey,
        );
        break;
      case 'update_profile':
        response = await _apiClient.put(
          '/profile',
          body: payload,
          idempotencyKey: action.idempotencyKey,
        );
        break;
      case 'update_preferences':
        response = await _apiClient.put(
          '/profile/preferences',
          body: payload,
          idempotencyKey: action.idempotencyKey,
        );
        break;
      case 'update_followup':
        response = await _apiClient.patch(
          '/followups/${payload['id']}',
          body: _versionedBody({'status': payload['status']}, action),
          idempotencyKey: action.idempotencyKey,
        );
        break;
      case 'generate_document':
        response = await _apiClient.post(
          '/documents/generate',
          body: payload,
          idempotencyKey: action.idempotencyKey,
        );
        break;
      case 'update_document':
        response = await _apiClient.patch(
          '/documents/${payload['id']}',
          body: _versionedBody(payload['body'] ?? payload, action),
          idempotencyKey: action.idempotencyKey,
        );
        break;
      case 'mark_notifications_read':
        response = await _apiClient.post(
          '/me/notifications/read',
          idempotencyKey: action.idempotencyKey,
        );
        break;
      case 'create_saved_search':
        response = await _apiClient.post(
          '/me/saved-searches',
          body: payload,
          idempotencyKey: action.idempotencyKey,
        );
        {
          final localId = payload['localId'] as String?;
          final serverId = _responseId(response, 'search');
          if (localId != null && serverId != null) {
            mapping = {localId: serverId};
          }
        }
        break;
      case 'update_saved_search':
        response = await _apiClient.patch(
          '/me/saved-searches/${payload['id']}',
          body: payload['body'] ?? payload,
          idempotencyKey: action.idempotencyKey,
        );
        break;
      case 'delete_saved_search':
        response = await _apiClient.delete(
          '/me/saved-searches/${payload['id']}',
        );
        break;
      case 'mark_search_seen':
        response = await _apiClient.post(
          '/me/saved-searches/${payload['id']}/mark-seen',
          idempotencyKey: action.idempotencyKey,
        );
        break;
      case 'schedule_interview':
        response = await _apiClient.post(
          '/applications/${payload['applicationId']}/interviews',
          body: payload['body'],
          idempotencyKey: action.idempotencyKey,
        );
        break;
      case 'add_application_note':
        response = await _apiClient.post(
          '/applications/${payload['applicationId']}/notes',
          body: payload['body'],
          idempotencyKey: action.idempotencyKey,
        );
        break;
      case 'add_application_attachment':
        response = await _apiClient.post(
          '/applications/${payload['applicationId']}/attachments',
          body: payload['body'],
          idempotencyKey: action.idempotencyKey,
        );
        break;
      case 'set_feed_state':
        response = await _apiClient.post(
          '/feed/state',
          body: payload,
          idempotencyKey: action.idempotencyKey,
        );
        break;
      case 'update_privacy':
        response = await _apiClient.put(
          '/me/privacy',
          body: payload,
          idempotencyKey: action.idempotencyKey,
        );
        break;
      case 'register_device':
        response = await _apiClient.post(
          '/me/devices',
          body: payload,
          idempotencyKey: action.idempotencyKey,
        );
        break;
      case 'unregister_device':
        response = await _apiClient.delete('/me/devices/${payload['id']}');
        break;
      case 'track_analytics':
        response = await _apiClient.post(
          '/analytics/events',
          body: payload,
          idempotencyKey: action.idempotencyKey,
        );
        break;
      default:
        throw ApiException(
          statusCode: 400,
          message: 'Unknown offline action ${action.actionType}',
        );
    }
    return SyncOutcome(
      idMapping: mapping,
      serverVersion: _serverVersion(
        response is Map ? _dataMap(response) : null,
      ),
      serverUpdatedAt: _serverUpdatedAt(
        response is Map ? _dataMap(response) : null,
      ),
      serverData: response is Map ? _dataMap(response) : null,
    );
  }

  /// A "keep local" decision replays the edit carrying the version the
  /// server reported in the conflict, so the API can reject a stale override.
  Map<String, dynamic> _versionedBody(dynamic value, OfflineAction action) {
    final body = value is Map
        ? Map<String, dynamic>.from(value)
        : <String, dynamic>{};
    if (action.conflictResolution == 'keep_local' &&
        !body.containsKey('version') &&
        action.serverVersion != null) {
      body['version'] = action.serverVersion;
    }
    return body;
  }

  Map<String, dynamic> _dataMap(Map value) {
    for (final key in ['application', 'document', 'search', 'data']) {
      if (value[key] is Map) {
        return Map<String, dynamic>.from(value[key] as Map);
      }
    }
    return Map<String, dynamic>.from(value);
  }

  String? _responseId(dynamic response, String key) {
    final map = _nestedMap(response, key);
    return map['id'] as String?;
  }

  int? _serverVersion(Map<String, dynamic>? data) {
    if (data == null) return null;
    final raw =
        data['version'] ?? data['currentVersion'] ?? data['serverVersion'];
    if (raw is int) return raw;
    if (raw is num) return raw.toInt();
    if (raw is String) return int.tryParse(raw);
    final current = data['current'];
    if (current is Map) {
      final nested = current['version'];
      if (nested is int) return nested;
      if (nested is num) return nested.toInt();
      if (nested is String) return int.tryParse(nested);
    }
    return null;
  }

  DateTime? _serverUpdatedAt(Map<String, dynamic>? data) {
    if (data == null) return null;
    final raw = data['updatedAt'] ?? data['serverUpdatedAt'];
    if (raw is String) return DateTime.tryParse(raw);
    final current = data['current'];
    if (current is Map) {
      final nested = current['updatedAt'];
      if (nested is String) return DateTime.tryParse(nested);
    }
    return null;
  }

  Map<String, dynamic> _nestedMap(dynamic value, String key) {
    if (value is Map && value[key] is Map) {
      return Map<String, dynamic>.from(value[key] as Map);
    }
    if (value is Map) return Map<String, dynamic>.from(value);
    return <String, dynamic>{};
  }
}
