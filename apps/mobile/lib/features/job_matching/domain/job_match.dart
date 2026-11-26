class FactorContribution {
  const FactorContribution(this.label, this.value, this.reason);

  final String label;
  final double value;
  final String reason;
}

class MatchFactors {
  const MatchFactors({
    this.skills = 0,
    this.seniority = 0,
    this.location = 0,
    this.role = 0,
    this.freshness = 0,
    this.reasons = const {},
  });

  final double skills;
  final double seniority;
  final double location;
  final double role;
  final double freshness;

  /// Per-factor explanations returned by the ranking engine, when present.
  final Map<String, String> reasons;

  List<FactorContribution> get contributions => [
    FactorContribution(
      'Skills',
      skills,
      reasons['skills'] ?? 'Overlap between your skills and the role.',
    ),
    FactorContribution(
      'Seniority',
      seniority,
      reasons['seniority'] ?? 'How the level compares with your experience.',
    ),
    FactorContribution(
      'Location',
      location,
      reasons['location'] ??
          'How the role location compares with your preferences.',
    ),
    FactorContribution(
      'Role fit',
      role,
      reasons['role'] ?? 'How the target role compares with your history.',
    ),
    FactorContribution(
      'Freshness',
      freshness,
      reasons['freshness'] ?? 'How recently the posting was published.',
    ),
  ];

  factory MatchFactors.fromJson(Map<String, dynamic>? json) {
    if (json == null) return const MatchFactors();
    return MatchFactors(
      skills: _number(json['skills']),
      seniority: _number(json['seniority']),
      location: _number(json['location']),
      role: _number(json['role']),
      freshness: _number(json['freshness']),
      reasons: _reasons(json['reasons']),
    );
  }

  Map<String, dynamic> toJson() => {
    'skills': skills,
    'seniority': seniority,
    'location': location,
    'role': role,
    'freshness': freshness,
    'reasons': reasons,
  };

  static Map<String, String> _reasons(dynamic value) {
    if (value is! Map) return const {};
    return value.map(
      (key, item) => MapEntry(key.toString(), item?.toString() ?? ''),
    );
  }

  static double _number(dynamic value) {
    if (value is num) return value.toDouble();
    return 0;
  }
}

class JobMatch {
  const JobMatch({
    required this.score,
    required this.explanation,
    required this.gaps,
    required this.factors,
    this.opportunityId,
    this.confidence,
    this.seniorityReason,
    this.locationReason,
    this.remoteReason,
    this.salaryReason,
    this.eligibilityReason,
  });

  final String? opportunityId;
  final double score;
  final String explanation;
  final List<String> gaps;
  final MatchFactors factors;

  /// Optional per-dimension explanations from the ranking engine. The UI
  /// falls back to local, evidence-backed rules when they are absent.
  final String? confidence;
  final String? seniorityReason;
  final String? locationReason;
  final String? remoteReason;
  final String? salaryReason;
  final String? eligibilityReason;

  factory JobMatch.fromJson(Map<String, dynamic>? json) {
    if (json == null) {
      return const JobMatch(
        score: 0,
        explanation: 'No match analysis is available yet.',
        gaps: [],
        factors: MatchFactors(),
      );
    }
    return JobMatch(
      opportunityId: json['opportunityId'] as String?,
      score: _number(json['score']),
      explanation: json['explanation'] as String? ?? '',
      gaps: _strings(json['gaps']),
      factors: MatchFactors.fromJson(
        json['factors'] is Map
            ? Map<String, dynamic>.from(json['factors'] as Map)
            : null,
      ),
      confidence: json['confidence'] as String?,
      seniorityReason: json['seniorityReason'] as String?,
      locationReason: json['locationReason'] as String?,
      remoteReason: json['remoteReason'] as String?,
      salaryReason: json['salaryReason'] as String?,
      eligibilityReason: json['eligibilityReason'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
    if (opportunityId != null) 'opportunityId': opportunityId,
    'score': score,
    'explanation': explanation,
    'gaps': gaps,
    'factors': factors.toJson(),
    if (confidence != null) 'confidence': confidence,
    if (seniorityReason != null) 'seniorityReason': seniorityReason,
    if (locationReason != null) 'locationReason': locationReason,
    if (remoteReason != null) 'remoteReason': remoteReason,
    if (salaryReason != null) 'salaryReason': salaryReason,
    if (eligibilityReason != null) 'eligibilityReason': eligibilityReason,
  };

  static double _number(dynamic value) {
    if (value is num) return value.toDouble();
    return 0;
  }

  static List<String> _strings(dynamic value) {
    if (value is! List) return const [];
    return value.whereType<String>().toList();
  }
}
