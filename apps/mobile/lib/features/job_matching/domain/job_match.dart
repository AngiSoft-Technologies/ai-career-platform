class MatchFactors {
  const MatchFactors({
    this.skills = 0,
    this.seniority = 0,
    this.location = 0,
    this.role = 0,
    this.freshness = 0,
  });

  final double skills;
  final double seniority;
  final double location;
  final double role;
  final double freshness;

  factory MatchFactors.fromJson(Map<String, dynamic>? json) {
    if (json == null) return const MatchFactors();
    return MatchFactors(
      skills: _number(json['skills']),
      seniority: _number(json['seniority']),
      location: _number(json['location']),
      role: _number(json['role']),
      freshness: _number(json['freshness']),
    );
  }

  Map<String, dynamic> toJson() => {
    'skills': skills,
    'seniority': seniority,
    'location': location,
    'role': role,
    'freshness': freshness,
  };

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
  });

  final String? opportunityId;
  final double score;
  final String explanation;
  final List<String> gaps;
  final MatchFactors factors;

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
    );
  }

  Map<String, dynamic> toJson() => {
    if (opportunityId != null) 'opportunityId': opportunityId,
    'score': score,
    'explanation': explanation,
    'gaps': gaps,
    'factors': factors.toJson(),
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
