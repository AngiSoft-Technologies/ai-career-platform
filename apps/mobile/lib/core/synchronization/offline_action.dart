class OfflineAction {
  const OfflineAction({
    required this.idempotencyKey,
    required this.actionType,
    required this.payload,
    required this.status,
    required this.createdAt,
    required this.updatedAt,
    this.lastError,
  });

  final String idempotencyKey;
  final String actionType;
  final Map<String, dynamic> payload;
  final String status;
  final DateTime createdAt;
  final DateTime updatedAt;
  final String? lastError;

  bool get isPending => status == 'pending';
  bool get isFailed => status == 'failed';

  factory OfflineAction.fromRow(Map<String, Object?> row) {
    return OfflineAction(
      idempotencyKey: row['idempotency_key']! as String,
      actionType: row['action_type']! as String,
      payload: Map<String, dynamic>.from(
        Map<String, dynamic>.from(row['payload']! as Map),
      ),
      status: row['status']! as String,
      createdAt: DateTime.fromMillisecondsSinceEpoch(row['created_at']! as int),
      updatedAt: DateTime.fromMillisecondsSinceEpoch(row['updated_at']! as int),
      lastError: row['last_error'] as String?,
    );
  }
}
