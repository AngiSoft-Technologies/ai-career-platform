class NotificationPreferences {
  const NotificationPreferences({
    this.pushEnabled = true,
    this.matches = true,
    this.applications = true,
    this.reminders = true,
    this.marketing = false,
    this.quietHoursStart,
    this.quietHoursEnd,
  });

  final bool pushEnabled;
  final bool matches;
  final bool applications;
  final bool reminders;
  final bool marketing;
  final String? quietHoursStart;
  final String? quietHoursEnd;

  NotificationPreferences copyWith({
    bool? pushEnabled,
    bool? matches,
    bool? applications,
    bool? reminders,
    bool? marketing,
    String? quietHoursStart,
    String? quietHoursEnd,
  }) {
    return NotificationPreferences(
      pushEnabled: pushEnabled ?? this.pushEnabled,
      matches: matches ?? this.matches,
      applications: applications ?? this.applications,
      reminders: reminders ?? this.reminders,
      marketing: marketing ?? this.marketing,
      quietHoursStart: quietHoursStart ?? this.quietHoursStart,
      quietHoursEnd: quietHoursEnd ?? this.quietHoursEnd,
    );
  }

  Map<String, dynamic> toJson() => {
        'pushEnabled': pushEnabled,
        'matches': matches,
        'applications': applications,
        'reminders': reminders,
        'marketing': marketing,
        'quietHoursStart': quietHoursStart,
        'quietHoursEnd': quietHoursEnd,
      };

  factory NotificationPreferences.fromJson(Map<String, dynamic> json) {
    return NotificationPreferences(
      pushEnabled: json['pushEnabled'] != false,
      matches: json['matches'] != false,
      applications: json['applications'] != false,
      reminders: json['reminders'] != false,
      marketing: json['marketing'] == true,
      quietHoursStart: json['quietHoursStart']?.toString(),
      quietHoursEnd: json['quietHoursEnd']?.toString(),
    );
  }
}
