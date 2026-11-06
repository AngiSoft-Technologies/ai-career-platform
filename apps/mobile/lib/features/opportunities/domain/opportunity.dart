import '../../job_matching/domain/job_match.dart';

class Opportunity {
  const Opportunity({
    required this.id,
    required this.title,
    required this.companyName,
    required this.companySlug,
    required this.country,
    required this.city,
    required this.workMode,
    required this.seniority,
    required this.employmentType,
    required this.applyUrl,
    required this.applicationMethod,
    required this.platform,
    required this.skills,
    required this.postedAt,
    this.companyId,
    this.companyWebsite,
    this.salaryMin,
    this.salaryMax,
    this.currency,
    this.description = '',
    this.match,
    this.sourceKind,
    this.eligibility,
    this.eligibilityReasons = const [],
  });

  final String id;
  final String title;
  final String companyName;
  final String companySlug;
  final String? companyId;
  final String? companyWebsite;
  final String country;
  final String city;
  final String workMode;
  final String seniority;
  final String employmentType;
  final int? salaryMin;
  final int? salaryMax;
  final String? currency;
  final String applyUrl;
  final String applicationMethod;
  final String platform;

  /// Where the employer published this role, in words — "Workday board",
  /// "Oracle HCM careers site", "Greenhouse board". The catalogue reads a
  /// hundred and thirty boards, and this is the answer to the question
  /// "where does this company post vacancies".
  final String? sourceKind;

  /// Whether a candidate in Kenya can hold this role, read off what the
  /// posting itself says about location and work authorisation.
  final String? eligibility;

  /// Why the eligibility decision was what it was.
  final List<String> eligibilityReasons;
  final DateTime? postedAt;
  final List<String> skills;
  final String description;
  final JobMatch? match;

  /// The eligibility decision, in the words a candidate would use.
  String get eligibilityLabel {
    switch (eligibility) {
      case 'eligible':
        return 'You can hold this';
      case 'unlikely':
        return 'Relocation likely';
      case 'ineligible':
        return 'Not open to you';
      default:
        return 'Not stated';
    }
  }

  bool get isEligible => eligibility == 'eligible';

  String get locationLabel {
    final parts = <String>[
      city.trim(),
      country.trim(),
    ].where((part) => part.isNotEmpty).toSet().toList();
    return parts.isEmpty ? 'Location not specified' : parts.join(', ');
  }

  factory Opportunity.fromJson(Map<String, dynamic> json) {
    final matchJson = json['match'];
    return Opportunity(
      id: json['id'] as String? ?? '',
      title: json['title'] as String? ?? 'Untitled role',
      companyName: json['companyName'] as String? ?? 'Unknown company',
      companySlug: json['companySlug'] as String? ?? '',
      companyId: json['companyId'] as String?,
      companyWebsite: json['companyWebsite'] as String?,
      country: json['country'] as String? ?? '',
      city: json['city'] as String? ?? '',
      workMode: json['workMode'] as String? ?? 'unknown',
      seniority: json['seniority'] as String? ?? 'unknown',
      employmentType: json['employmentType'] as String? ?? 'unknown',
      salaryMin: _integer(json['salaryMin']),
      salaryMax: _integer(json['salaryMax']),
      currency: json['currency'] as String?,
      applyUrl: json['applyUrl'] as String? ?? '',
      applicationMethod: json['applicationMethod'] as String? ?? 'unknown',
      platform: json['platform'] as String? ?? 'unknown',
      sourceKind: json['sourceKind'] as String?,
      eligibility: json['eligibility'] as String?,
      eligibilityReasons: _strings(json['eligibilityReasons']),
      postedAt: DateTime.tryParse(json['postedAt'] as String? ?? ''),
      skills: _strings(json['skills']),
      description: json['description'] as String? ?? '',
      match: matchJson is Map
          ? JobMatch.fromJson(Map<String, dynamic>.from(matchJson))
          : null,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'title': title,
    'companyName': companyName,
    'companySlug': companySlug,
    if (companyId != null) 'companyId': companyId,
    if (companyWebsite != null) 'companyWebsite': companyWebsite,
    'country': country,
    'city': city,
    'workMode': workMode,
    'seniority': seniority,
    'employmentType': employmentType,
    if (salaryMin != null) 'salaryMin': salaryMin,
    if (salaryMax != null) 'salaryMax': salaryMax,
    if (currency != null) 'currency': currency,
    'applyUrl': applyUrl,
    'applicationMethod': applicationMethod,
    'platform': platform,
    if (sourceKind != null) 'sourceKind': sourceKind,
    if (eligibility != null) 'eligibility': eligibility,
    if (eligibilityReasons.isNotEmpty) 'eligibilityReasons': eligibilityReasons,
    if (postedAt != null) 'postedAt': postedAt!.toIso8601String(),
    'skills': skills,
    'description': description,
    if (match != null) 'match': match!.toJson(),
  };

  static int? _integer(dynamic value) {
    if (value is num) return value.toInt();
    if (value is String) return int.tryParse(value);
    return null;
  }

  static List<String> _strings(dynamic value) {
    if (value is! List) return const [];
    return value.whereType<String>().toList();
  }
}

class OpportunitySearch {
  const OpportunitySearch({
    this.query,
    this.country,
    this.workMode,
    this.seniority,
    this.eligibility,
    this.semantic = false,
  });

  final String? query;
  final String? country;
  final String? workMode;
  final String? seniority;

  /// "eligible" keeps the roles a candidate can actually hold, which is
  /// what most of the catalogue is not — the bulk of it is posted in
  /// Germany and the United States with a residency rule on it.
  final String? eligibility;
  final bool semantic;

  Map<String, String> toQueryParameters() {
    return {
      if (query != null && query!.trim().isNotEmpty) 'q': query!.trim(),
      if (country != null && country!.trim().isNotEmpty)
        'country': country!.trim(),
      if (workMode != null && workMode!.trim().isNotEmpty)
        'workMode': workMode!,
      if (seniority != null && seniority!.trim().isNotEmpty)
        'seniority': seniority!,
      if (eligibility != null && eligibility!.trim().isNotEmpty)
        'eligibility': eligibility!,
      'semantic': semantic.toString(),
      'ranked': 'true',
      'limit': '50',
    };
  }
}
