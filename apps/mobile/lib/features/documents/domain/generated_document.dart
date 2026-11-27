class GeneratedDocument {
  const GeneratedDocument({
    required this.id,
    required this.opportunityId,
    required this.type,
    required this.title,
    required this.content,
    this.applicationId,
    this.template,
    this.resumeData,
    this.version,
    this.updatedAt,
    this.usedInApplications = const [],
    this.atsScore,
  });

  final String id;
  final String? applicationId;
  final String opportunityId;
  final String type;
  final String title;
  final String content;

  /// Catalogue key of the template this document is styled with.
  final String? template;

  /// Structured resume/cover-letter document, when the saved row has one.
  final Map<String, dynamic>? resumeData;

  final int? version;
  final DateTime? updatedAt;

  /// Applications this document was attached to or generated for.
  final List<String> usedInApplications;
  final int? atsScore;

  String get typeLabel {
    return switch (type) {
      'cv' => 'CV',
      'cover_letter' => 'Cover letter',
      'application_email' => 'Application email',
      'answer' => 'Application answers',
      _ => type,
    };
  }

  factory GeneratedDocument.fromJson(Map<String, dynamic> json) {
    return GeneratedDocument(
      id: json['id'] as String? ?? '',
      applicationId: json['applicationId'] as String?,
      opportunityId: json['opportunityId'] as String? ?? '',
      type: json['type'] as String? ?? 'cv',
      title: json['title'] as String? ?? 'Generated document',
      content: json['content'] as String? ?? '',
      template: (json['template'] ?? json['templateKey']) as String?,
      resumeData: (json['resumeData'] is Map)
          ? Map<String, dynamic>.from(json['resumeData'] as Map)
          : null,
      version: (json['version'] as num?)?.toInt(),
      updatedAt: DateTime.tryParse(json['updatedAt'] as String? ?? ''),
      usedInApplications: _strings(json['usedInApplications']),
      atsScore: (json['atsScore'] as num?)?.toInt(),
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    if (applicationId != null) 'applicationId': applicationId,
    'opportunityId': opportunityId,
    'type': type,
    'title': title,
    'content': content,
    if (template != null) 'template': template,
    if (resumeData != null) 'resumeData': resumeData,
    if (version != null) 'version': version,
    if (updatedAt != null) 'updatedAt': updatedAt!.toIso8601String(),
    if (usedInApplications.isNotEmpty) 'usedInApplications': usedInApplications,
    if (atsScore != null) 'atsScore': atsScore,
  };

  static List<String> _strings(dynamic value) {
    if (value is! List) return const [];
    return value.whereType<String>().toList();
  }
}
