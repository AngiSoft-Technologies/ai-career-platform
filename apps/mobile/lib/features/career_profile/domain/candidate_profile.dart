class CandidateProfile {
  const CandidateProfile({
    required this.id,
    required this.userId,
    required this.fullName,
    required this.headline,
    required this.summary,
    required this.location,
    required this.country,
    required this.yearsExperience,
    required this.seniority,
    required this.desiredRoles,
    required this.skills,
    required this.preferredCountries,
    required this.preferredLocations,
    required this.remotePreferred,
    required this.version,
    this.updatedAt,
  });

  final String id;
  final String userId;
  final String fullName;
  final String headline;
  final String summary;
  final String location;
  final String country;
  final int yearsExperience;
  final String seniority;
  final List<String> desiredRoles;
  final List<String> skills;
  final List<String> preferredCountries;
  final List<String> preferredLocations;
  final bool remotePreferred;
  final int version;
  final DateTime? updatedAt;

  factory CandidateProfile.fromJson(Map<String, dynamic> json) {
    return CandidateProfile(
      id: json['id'] as String? ?? '',
      userId: json['userId'] as String? ?? '',
      fullName: json['fullName'] as String? ?? '',
      headline: json['headline'] as String? ?? '',
      summary: json['summary'] as String? ?? '',
      location: json['location'] as String? ?? '',
      country: json['country'] as String? ?? '',
      yearsExperience: _integer(json['yearsExperience']),
      seniority: json['seniority'] as String? ?? 'junior',
      desiredRoles: _strings(json['desiredRoles']),
      skills: _strings(json['skills']),
      preferredCountries: _strings(json['preferredCountries']),
      preferredLocations: _strings(json['preferredLocations']),
      remotePreferred: json['remotePreferred'] == true,
      version: _integer(json['version']),
      updatedAt: DateTime.tryParse(json['updatedAt'] as String? ?? ''),
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'userId': userId,
    'fullName': fullName,
    'headline': headline,
    'summary': summary,
    'location': location,
    'country': country,
    'yearsExperience': yearsExperience,
    'seniority': seniority,
    'desiredRoles': desiredRoles,
    'skills': skills,
    'preferredCountries': preferredCountries,
    'preferredLocations': preferredLocations,
    'remotePreferred': remotePreferred,
    'version': version,
    if (updatedAt != null) 'updatedAt': updatedAt!.toIso8601String(),
  };

  static int _integer(dynamic value) {
    if (value is num) return value.toInt();
    return int.tryParse(value as String? ?? '') ?? 0;
  }

  static List<String> _strings(dynamic value) {
    if (value is! List) return const [];
    return value.whereType<String>().toList();
  }
}
