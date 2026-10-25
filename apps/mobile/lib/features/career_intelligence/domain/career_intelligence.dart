class CareerIntelligence {
  const CareerIntelligence({
    required this.summary,
    required this.strengths,
    required this.gaps,
    required this.recommendations,
    this.score,
  });

  final String summary;
  final List<String> strengths;
  final List<String> gaps;
  final List<String> recommendations;
  final double? score;

  factory CareerIntelligence.fromJson(Map<String, dynamic>? json) {
    if (json == null) {
      return const CareerIntelligence(
        summary: 'Complete your profile to unlock career insights.',
        strengths: [],
        gaps: [],
        recommendations: [],
      );
    }
    final score = json['score'];
    return CareerIntelligence(
      summary:
          json['summary'] as String? ??
          json['explanation'] as String? ??
          'Your profile is being analyzed.',
      strengths: _strings(
        json['strengths'] ?? json['strengthsIdentified'] ?? json['highlights'],
      ),
      gaps: _strings(json['gaps'] ?? json['missingSkills'] ?? json['risks']),
      recommendations: _strings(
        json['recommendations'] ?? json['suggestions'] ?? json['nextSteps'],
      ),
      score: score is num ? score.toDouble() : null,
    );
  }

  static List<String> _strings(dynamic value) {
    if (value is! List) return const [];
    return value.whereType<String>().toList();
  }
}
