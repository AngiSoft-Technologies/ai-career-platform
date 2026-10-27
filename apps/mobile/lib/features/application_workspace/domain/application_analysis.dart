class ApplicationAnalysis {
  const ApplicationAnalysis({
    required this.platform,
    required this.method,
    required this.analysisUrl,
    required this.fields,
    required this.questions,
    required this.requiredDocuments,
    required this.instructions,
    required this.requiresUserInput,
    this.rawTitle,
    this.emailRecipient,
    this.emailSubject,
    this.emailBody,
  });

  final String platform;
  final String method;
  final String analysisUrl;
  final List<Map<String, dynamic>> fields;
  final List<Map<String, dynamic>> questions;
  final List<String> requiredDocuments;
  final List<String> instructions;
  final List<String> requiresUserInput;
  final String? rawTitle;
  final String? emailRecipient;
  final String? emailSubject;
  final String? emailBody;

  factory ApplicationAnalysis.fromJson(Map<String, dynamic> json) {
    return ApplicationAnalysis(
      platform: json['platform'] as String? ?? 'custom',
      method: json['method'] as String? ?? 'website',
      analysisUrl: json['analysisUrl'] as String? ?? '',
      fields: _maps(json['fields']),
      questions: _maps(json['questions']),
      requiredDocuments: _strings(json['requiredDocuments']),
      instructions: _strings(json['instructions']),
      requiresUserInput: _strings(json['requiresUserInput']),
      rawTitle: json['rawTitle'] as String?,
      emailRecipient: json['emailRecipient'] as String?,
      emailSubject: json['emailSubject'] as String?,
      emailBody: json['emailBody'] as String?,
    );
  }

  static List<Map<String, dynamic>> _maps(dynamic value) {
    if (value is! List) return const [];
    return value.whereType<Map>().map(Map<String, dynamic>.from).toList();
  }

  static List<String> _strings(dynamic value) {
    if (value is! List) return const [];
    return value.whereType<String>().toList();
  }
}
