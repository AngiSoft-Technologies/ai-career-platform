import 'dart:convert';

/// A resume template from the server catalogue.
///
/// The catalogue is served by `GET /documents/templates` so web, mobile and
/// the exporter all agree on the available layouts. An operator can add or
/// retire a template without shipping a client release.
class ResumeTemplate {
  const ResumeTemplate({
    required this.key,
    required this.label,
    required this.category,
    required this.description,
    required this.atsSafe,
    required this.accent,
    required this.sortOrder,
  });

  final String key;
  final String label;
  final String category;
  final String description;
  final bool atsSafe;
  final String accent;
  final int sortOrder;

  factory ResumeTemplate.fromJson(Map<String, dynamic> json) {
    return ResumeTemplate(
      key: json['key'] as String? ?? '',
      label: json['label'] as String? ?? '',
      category: json['category'] as String? ?? '',
      description: json['description'] as String? ?? '',
      atsSafe: json['atsSafe'] as bool? ?? false,
      accent: json['accent'] as String? ?? '#1f2937',
      sortOrder: (json['sortOrder'] as num?)?.toInt() ?? 0,
    );
  }

  Map<String, dynamic> toJson() => {
    'key': key,
    'label': label,
    'category': category,
    'description': description,
    'atsSafe': atsSafe,
    'accent': accent,
    'sortOrder': sortOrder,
  };

  /// The accent colour as a Material Color.
  int get accentColor {
    try {
      return int.parse(accent.replaceFirst('#', '0xFF'));
    } catch (_) {
      return 0xFF1F2937;
    }
  }
}

/// A cover letter template from the server catalogue.
class CoverLetterTemplate {
  const CoverLetterTemplate({
    required this.key,
    required this.label,
    required this.tone,
    required this.description,
    required this.sortOrder,
  });

  final String key;
  final String label;
  final String tone;
  final String description;
  final int sortOrder;

  factory CoverLetterTemplate.fromJson(Map<String, dynamic> json) {
    return CoverLetterTemplate(
      key: json['key'] as String? ?? '',
      label: json['label'] as String? ?? '',
      tone: json['tone'] as String? ?? '',
      description: json['description'] as String? ?? '',
      sortOrder: (json['sortOrder'] as num?)?.toInt() ?? 0,
    );
  }

  Map<String, dynamic> toJson() => {
    'key': key,
    'label': label,
    'tone': tone,
    'description': description,
    'sortOrder': sortOrder,
  };
}

/// The payload returned by `GET /documents/templates`.
class TemplateCatalogue {
  const TemplateCatalogue({required this.resume, required this.coverLetter});

  final List<ResumeTemplate> resume;
  final List<CoverLetterTemplate> coverLetter;

  factory TemplateCatalogue.fromJson(Map<String, dynamic> json) {
    return TemplateCatalogue(
      resume: (json['resume'] as List? ?? const [])
          .whereType<Map>()
          .map(
            (item) => ResumeTemplate.fromJson(Map<String, dynamic>.from(item)),
          )
          .toList(),
      coverLetter: (json['coverLetter'] as List? ?? const [])
          .whereType<Map>()
          .map(
            (item) =>
                CoverLetterTemplate.fromJson(Map<String, dynamic>.from(item)),
          )
          .toList(),
    );
  }
}
