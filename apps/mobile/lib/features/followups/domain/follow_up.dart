class FollowUp {
  const FollowUp({
    required this.id,
    required this.applicationId,
    required this.dueAt,
    required this.status,
    required this.note,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String applicationId;
  final DateTime dueAt;
  final String status;
  final String note;
  final DateTime createdAt;
  final DateTime updatedAt;

  bool get isPending => status.toUpperCase() == 'PENDING';

  factory FollowUp.fromJson(Map<String, dynamic> json) {
    final now = DateTime.now();
    return FollowUp(
      id: json['id'] as String? ?? '',
      applicationId: json['applicationId'] as String? ?? '',
      dueAt: DateTime.tryParse(json['dueAt'] as String? ?? '') ?? now,
      status: json['status'] as String? ?? 'PENDING',
      note: json['note'] as String? ?? '',
      createdAt: DateTime.tryParse(json['createdAt'] as String? ?? '') ?? now,
      updatedAt: DateTime.tryParse(json['updatedAt'] as String? ?? '') ?? now,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'applicationId': applicationId,
    'dueAt': dueAt.toIso8601String(),
    'status': status,
    'note': note,
    'createdAt': createdAt.toIso8601String(),
    'updatedAt': updatedAt.toIso8601String(),
  };
}
