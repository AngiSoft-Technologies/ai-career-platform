import '../../job_matching/domain/job_match.dart';
import '../../opportunities/domain/opportunity.dart';

class ApplicationWorkspace {
  const ApplicationWorkspace({
    required this.id,
    required this.opportunityId,
    required this.method,
    required this.platform,
    required this.applicationUrl,
    required this.requiredDocuments,
    required this.fields,
    required this.questions,
    required this.instructions,
    required this.generatedAt,
    this.applicationId,
    this.opportunity,
    this.match,
  });

  final String id;
  final String? applicationId;
  final String opportunityId;
  final String method;
  final String platform;
  final String applicationUrl;
  final List<String> requiredDocuments;
  final List<String> fields;
  final List<String> questions;
  final String instructions;
  final DateTime? generatedAt;
  final Opportunity? opportunity;
  final JobMatch? match;

  factory ApplicationWorkspace.fromJson(
    Map<String, dynamic> json, {
    String? applicationId,
    Opportunity? opportunity,
  }) {
    final matchJson = json['match'];
    return ApplicationWorkspace(
      id: json['id'] as String? ?? '',
      applicationId: applicationId ?? json['applicationId'] as String?,
      opportunityId: json['opportunityId'] as String? ?? '',
      method: json['method'] as String? ?? 'unknown',
      platform: json['platform'] as String? ?? 'unknown',
      applicationUrl: json['applicationUrl'] as String? ?? '',
      requiredDocuments: _strings(json['requiredDocuments']),
      fields: _strings(json['fields']),
      questions: _strings(json['questions']),
      instructions: json['instructions'] as String? ?? '',
      generatedAt: DateTime.tryParse(json['generatedAt'] as String? ?? ''),
      opportunity: opportunity,
      match:
          opportunity?.match ??
          (matchJson is Map
              ? JobMatch.fromJson(Map<String, dynamic>.from(matchJson))
              : null),
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    if (applicationId != null) 'applicationId': applicationId,
    'opportunityId': opportunityId,
    'method': method,
    'platform': platform,
    'applicationUrl': applicationUrl,
    'requiredDocuments': requiredDocuments,
    'fields': fields,
    'questions': questions,
    'instructions': instructions,
    if (generatedAt != null) 'generatedAt': generatedAt!.toIso8601String(),
  };

  static List<String> _strings(dynamic value) {
    if (value is! List) return const [];
    return value.whereType<String>().toList();
  }
}
