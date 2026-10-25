class JobPreferences {
  const JobPreferences({
    this.preferredCountries = const [],
    this.preferredLocations = const [],
    this.preferredRoles = const [],
    this.desiredSeniority = 'junior',
    this.minSalary,
    this.currency = 'KES',
    this.remoteOnly = false,
    this.willingToRelocate = false,
    this.notificationsEnabled = true,
  });

  final List<String> preferredCountries;
  final List<String> preferredLocations;
  final List<String> preferredRoles;
  final String desiredSeniority;
  final int? minSalary;
  final String currency;
  final bool remoteOnly;
  final bool willingToRelocate;
  final bool notificationsEnabled;

  factory JobPreferences.fromJson(Map<String, dynamic> json) {
    final salary = json['minSalary'];
    return JobPreferences(
      preferredCountries: _strings(json['preferredCountries']),
      preferredLocations: _strings(json['preferredLocations']),
      preferredRoles: _strings(json['preferredRoles']),
      desiredSeniority: json['desiredSeniority'] as String? ?? 'junior',
      minSalary: salary is num
          ? salary.toInt()
          : int.tryParse(salary as String? ?? ''),
      currency: json['currency'] as String? ?? 'KES',
      remoteOnly: json['remoteOnly'] == true,
      willingToRelocate: json['willingToRelocate'] == true,
      notificationsEnabled: json['notificationsEnabled'] != false,
    );
  }

  Map<String, dynamic> toJson() => {
    'preferredCountries': preferredCountries,
    'preferredLocations': preferredLocations,
    'preferredRoles': preferredRoles,
    'desiredSeniority': desiredSeniority,
    if (minSalary != null) 'minSalary': minSalary,
    'currency': currency,
    'remoteOnly': remoteOnly,
    'willingToRelocate': willingToRelocate,
    'notificationsEnabled': notificationsEnabled,
  };

  static List<String> _strings(dynamic value) {
    if (value is! List) return const [];
    return value.whereType<String>().toList();
  }
}
