import 'dart:convert';

class OfflineAction {
  const OfflineAction({
    required this.idempotencyKey,
    required this.actionType,
    required this.payload,
    required this.status,
    required this.createdAt,
    required this.updatedAt,
    this.lastError,
    this.retryCount = 0,
    this.entityType,
    this.entityId,
    this.nextRetryAt,
    this.serverVersion,
    this.serverUpdatedAt,
    this.conflictResolution,
    this.serverPayload,
  });

  final String idempotencyKey;
  final String actionType;
  final Map<String, dynamic> payload;

  /// pending | syncing | completed | failed | conflict
  final String status;
  final DateTime createdAt;
  final DateTime updatedAt;
  final String? lastError;
  final int retryCount;
  final String? entityType;
  final String? entityId;
  final DateTime? nextRetryAt;

  /// Server state captured from a 409 so the user can compare and merge.
  final int? serverVersion;
  final DateTime? serverUpdatedAt;
  final Map<String, dynamic>? serverPayload;

  /// use_server | keep_local | merge — set when the user resolves a conflict.
  final String? conflictResolution;

  bool get isPending => status == 'pending';
  bool get isFailed => status == 'failed';
  bool get isConflict => status == 'conflict';
  bool get isSyncing => status == 'syncing';

  /// Human-readable summary for the conflict-resolution sheet.
  String get conflictSummary =>
      '${actionType.replaceAll('_', ' ')}${entityId == null ? '' : ' · $entityId'}';

  OfflineAction copyWith({
    String? status,
    DateTime? updatedAt,
    String? lastError,
    int? retryCount,
    DateTime? nextRetryAt,
    int? serverVersion,
    DateTime? serverUpdatedAt,
    String? conflictResolution,
    Map<String, dynamic>? serverPayload,
  }) {
    return OfflineAction(
      idempotencyKey: idempotencyKey,
      actionType: actionType,
      payload: payload,
      status: status ?? this.status,
      createdAt: createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      lastError: lastError ?? this.lastError,
      retryCount: retryCount ?? this.retryCount,
      entityType: entityType,
      entityId: entityId,
      nextRetryAt: nextRetryAt ?? this.nextRetryAt,
      serverVersion: serverVersion ?? this.serverVersion,
      serverUpdatedAt: serverUpdatedAt ?? this.serverUpdatedAt,
      conflictResolution: conflictResolution ?? this.conflictResolution,
      serverPayload: serverPayload ?? this.serverPayload,
    );
  }

  factory OfflineAction.fromRow(Map<String, Object?> row) {
    DateTime? nextRetry;
    final nextRetryRaw = row['next_retry_at'];
    if (nextRetryRaw is int) {
      nextRetry = DateTime.fromMillisecondsSinceEpoch(nextRetryRaw);
    }
    DateTime? serverUpdated;
    final serverUpdatedRaw = row['server_updated_at'];
    if (serverUpdatedRaw is int) {
      serverUpdated = DateTime.fromMillisecondsSinceEpoch(serverUpdatedRaw);
    }
    Map<String, dynamic>? serverData;
    final serverPayloadRaw = row['server_payload'];
    if (serverPayloadRaw is String && serverPayloadRaw.isNotEmpty) {
      serverData = Map<String, dynamic>.from(
        jsonDecode(serverPayloadRaw) as Map,
      );
    }
    final payloadRaw = row['payload'];
    final payload = payloadRaw is String
        ? Map<String, dynamic>.from(jsonDecode(payloadRaw) as Map)
        : Map<String, dynamic>.from(payloadRaw! as Map);
    return OfflineAction(
      idempotencyKey: row['idempotency_key']! as String,
      actionType: row['action_type']! as String,
      payload: payload,
      status: row['status']! as String,
      createdAt: DateTime.fromMillisecondsSinceEpoch(row['created_at']! as int),
      updatedAt: DateTime.fromMillisecondsSinceEpoch(row['updated_at']! as int),
      lastError: row['last_error'] as String?,
      retryCount: (row['retry_count'] as int?) ?? 0,
      entityType: row['entity_type'] as String?,
      entityId: row['entity_id'] as String?,
      nextRetryAt: nextRetry,
      serverVersion: row['server_version'] as int?,
      serverUpdatedAt: serverUpdated,
      serverPayload: serverData,
      conflictResolution: row['conflict_resolution'] as String?,
    );
  }
}
