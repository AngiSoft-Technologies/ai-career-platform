class JobApplication {
  const JobApplication({
    required this.id,
    required this.userId,
    required this.opportunityId,
    required this.status,
    required this.createdAt,
    required this.updatedAt,
    required this.version,
    this.appliedAt,
  });

  final String id;
  final String userId;
  final String opportunityId;
  final String status;
  final DateTime? appliedAt;
  final DateTime createdAt;
  final DateTime updatedAt;
  final int version;

  String get statusLabel {
    return status
        .toLowerCase()
        .split('_')
        .map(
          (part) => part.isEmpty
              ? part
              : '${part[0].toUpperCase()}${part.substring(1)}',
        )
        .join(' ');
  }

  List<String> get availableTransitions {
    return switch (status.toUpperCase()) {
      'SHORTLISTED' => const ['ANALYZED', 'WITHDRAWN'],
      'ANALYZED' => const ['APPLICATION_PREPARATION', 'WITHDRAWN'],
      'APPLICATION_PREPARATION' => const ['READY_TO_APPLY', 'WITHDRAWN'],
      'READY_TO_APPLY' => const ['APPLIED', 'WITHDRAWN'],
      'APPLIED' => const [
        'ACKNOWLEDGED',
        'NO_RESPONSE',
        'REJECTED',
        'WITHDRAWN',
      ],
      'ACKNOWLEDGED' => const [
        'SCREENING',
        'REJECTED',
        'NO_RESPONSE',
        'WITHDRAWN',
      ],
      'NO_RESPONSE' => const ['ACKNOWLEDGED', 'REJECTED', 'WITHDRAWN'],
      'SCREENING' => const ['ASSESSMENT', 'INTERVIEW', 'REJECTED', 'WITHDRAWN'],
      'ASSESSMENT' => const ['INTERVIEW', 'REJECTED', 'WITHDRAWN'],
      'INTERVIEW' => const ['OFFER', 'REJECTED', 'WITHDRAWN'],
      'OFFER' => const ['REJECTED', 'WITHDRAWN'],
      _ => const [],
    };
  }

  factory JobApplication.fromJson(Map<String, dynamic> json) {
    return JobApplication(
      id: json['id'] as String? ?? '',
      userId: json['userId'] as String? ?? '',
      opportunityId: json['opportunityId'] as String? ?? '',
      status: json['status'] as String? ?? 'SHORTLISTED',
      appliedAt: DateTime.tryParse(json['appliedAt'] as String? ?? ''),
      createdAt:
          DateTime.tryParse(json['createdAt'] as String? ?? '') ??
          DateTime.now(),
      updatedAt:
          DateTime.tryParse(json['updatedAt'] as String? ?? '') ??
          DateTime.now(),
      version: _integer(json['version']),
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'userId': userId,
    'opportunityId': opportunityId,
    'status': status,
    if (appliedAt != null) 'appliedAt': appliedAt!.toIso8601String(),
    'createdAt': createdAt.toIso8601String(),
    'updatedAt': updatedAt.toIso8601String(),
    'version': version,
  };

  static int _integer(dynamic value) {
    if (value is num) return value.toInt();
    return int.tryParse(value as String? ?? '') ?? 1;
  }
}
