class GeneratedDocument {
  const GeneratedDocument({
    required this.id,
    required this.opportunityId,
    required this.type,
    required this.title,
    required this.content,
    this.applicationId,
  });

  final String id;
  final String? applicationId;
  final String opportunityId;
  final String type;
  final String title;
  final String content;

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
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    if (applicationId != null) 'applicationId': applicationId,
    'opportunityId': opportunityId,
    'type': type,
    'title': title,
    'content': content,
  };
}
