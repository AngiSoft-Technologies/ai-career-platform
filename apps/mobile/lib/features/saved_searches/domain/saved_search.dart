/// How often a saved search evaluates its query for new matches.
enum AlertCadence {
  realtime('realtime'),
  daily('daily'),
  weekly('weekly');

  const AlertCadence(this.wireValue);

  final String wireValue;

  static AlertCadence fromWire(String? value) {
    return AlertCadence.values.firstWhere(
      (cadence) => cadence.wireValue == value,
      orElse: () => AlertCadence.daily,
    );
  }
}

/// Where an alert is allowed to notify the candidate.
class AlertChannels {
  const AlertChannels({
    this.push = true,
    this.inApp = true,
    this.email = false,
  });

  final bool push;
  final bool inApp;
  final bool email;

  AlertChannels copyWith({bool? push, bool? inApp, bool? email}) {
    return AlertChannels(
      push: push ?? this.push,
      inApp: inApp ?? this.inApp,
      email: email ?? this.email,
    );
  }

  factory AlertChannels.fromJson(Map<String, dynamic>? json) {
    if (json == null) return const AlertChannels();
    return AlertChannels(
      push: json['push'] != false,
      inApp: json['inApp'] != false,
      email: json['email'] == true,
    );
  }

  Map<String, dynamic> toJson() => {
    'push': push,
    'inApp': inApp,
    'email': email,
  };
}

/// A local clock window in `HH:mm` form, e.g. 22:00–07:00.
class AlertQuietHours {
  const AlertQuietHours({this.start, this.end});

  final String? start;
  final String? end;

  bool get isConfigured =>
      start != null && start!.isNotEmpty && end != null && end!.isNotEmpty;

  factory AlertQuietHours.fromJson(Map<String, dynamic>? json) {
    if (json == null) return const AlertQuietHours();
    return AlertQuietHours(
      start: json['start'] as String?,
      end: json['end'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {'start': start, 'end': end};
}

class JobAlert {
  const JobAlert({
    required this.id,
    required this.searchId,
    this.cadence = AlertCadence.daily,
    this.channels = const AlertChannels(),
    this.quietHours = const AlertQuietHours(),
    this.enabled = true,
    this.lastEvaluatedAt,
    this.newCount = 0,
  });

  final String id;
  final String searchId;
  final AlertCadence cadence;
  final AlertChannels channels;
  final AlertQuietHours quietHours;
  final bool enabled;
  final DateTime? lastEvaluatedAt;
  final int newCount;

  JobAlert copyWith({
    AlertCadence? cadence,
    AlertChannels? channels,
    AlertQuietHours? quietHours,
    bool? enabled,
    DateTime? lastEvaluatedAt,
    int? newCount,
  }) {
    return JobAlert(
      id: id,
      searchId: searchId,
      cadence: cadence ?? this.cadence,
      channels: channels ?? this.channels,
      quietHours: quietHours ?? this.quietHours,
      enabled: enabled ?? this.enabled,
      lastEvaluatedAt: lastEvaluatedAt ?? this.lastEvaluatedAt,
      newCount: newCount ?? this.newCount,
    );
  }

  factory JobAlert.fromJson(Map<String, dynamic> json) => JobAlert(
    id: json['id']?.toString() ?? '',
    searchId: (json['searchId'] ?? json['savedSearchId'])?.toString() ?? '',
    cadence: AlertCadence.fromWire(json['cadence'] as String?),
    channels: AlertChannels.fromJson(
      json['channels'] is Map
          ? Map<String, dynamic>.from(json['channels'] as Map)
          : null,
    ),
    quietHours: AlertQuietHours.fromJson(
      json['quietHours'] is Map
          ? Map<String, dynamic>.from(json['quietHours'] as Map)
          : null,
    ),
    enabled: json['enabled'] != false,
    lastEvaluatedAt: DateTime.tryParse(
      json['lastEvaluatedAt'] as String? ?? '',
    ),
    newCount: _integer(json['newCount']),
  );

  Map<String, dynamic> toJson() => {
    'id': id,
    'searchId': searchId,
    'cadence': cadence.wireValue,
    'channels': channels.toJson(),
    'quietHours': quietHours.toJson(),
    'enabled': enabled,
    if (lastEvaluatedAt != null)
      'lastEvaluatedAt': lastEvaluatedAt!.toIso8601String(),
    'newCount': newCount,
  };

  static int _integer(dynamic value) {
    if (value is num) return value.toInt();
    return int.tryParse(value as String? ?? '') ?? 0;
  }
}

class SavedSearch {
  const SavedSearch({
    required this.id,
    required this.name,
    required this.query,
    this.country,
    this.workMode,
    this.seniority,
    this.employmentType,
    this.eligibility,
    this.alertsEnabled = true,
    this.cadence = AlertCadence.daily,
    this.channels = const AlertChannels(),
    this.quietHours = const AlertQuietHours(),
    this.lastEvaluatedAt,
    this.newCount = 0,
    this.updatedAt,
  });

  final String id;
  final String name;
  final String query;
  final String? country;
  final String? workMode;
  final String? seniority;
  final String? employmentType;
  final String? eligibility;
  final bool alertsEnabled;
  final AlertCadence cadence;
  final AlertChannels channels;
  final AlertQuietHours quietHours;
  final DateTime? lastEvaluatedAt;
  final int newCount;
  final DateTime? updatedAt;

  bool get isLocal => id.startsWith('local-');

  SavedSearch copyWith({
    String? name,
    String? query,
    String? country,
    String? workMode,
    String? seniority,
    String? employmentType,
    String? eligibility,
    bool? alertsEnabled,
    AlertCadence? cadence,
    AlertChannels? channels,
    AlertQuietHours? quietHours,
    DateTime? lastEvaluatedAt,
    int? newCount,
  }) {
    return SavedSearch(
      id: id,
      name: name ?? this.name,
      query: query ?? this.query,
      country: country ?? this.country,
      workMode: workMode ?? this.workMode,
      seniority: seniority ?? this.seniority,
      employmentType: employmentType ?? this.employmentType,
      eligibility: eligibility ?? this.eligibility,
      alertsEnabled: alertsEnabled ?? this.alertsEnabled,
      cadence: cadence ?? this.cadence,
      channels: channels ?? this.channels,
      quietHours: quietHours ?? this.quietHours,
      lastEvaluatedAt: lastEvaluatedAt ?? this.lastEvaluatedAt,
      newCount: newCount ?? this.newCount,
      updatedAt: updatedAt,
    );
  }

  /// The alert settings attached to this search. Alerts are stored in their
  /// own table so cadence and delivery state survive a search edit.
  JobAlert toAlert() => JobAlert(
    id: isLocal ? 'local-alert-$id' : 'alert-$id',
    searchId: id,
    cadence: cadence,
    channels: channels,
    quietHours: quietHours,
    enabled: alertsEnabled,
    lastEvaluatedAt: lastEvaluatedAt,
    newCount: newCount,
  );

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'query': query,
    'country': country,
    'workMode': workMode,
    'seniority': seniority,
    'employmentType': employmentType,
    'eligibility': eligibility,
    'alertsEnabled': alertsEnabled,
    'cadence': cadence.wireValue,
    'channels': channels.toJson(),
    'quietHours': quietHours.toJson(),
    if (lastEvaluatedAt != null)
      'lastEvaluatedAt': lastEvaluatedAt!.toIso8601String(),
    'newCount': newCount,
    if (updatedAt != null) 'updatedAt': updatedAt!.toIso8601String(),
  };

  factory SavedSearch.fromJson(Map<String, dynamic> json) => SavedSearch(
    id: json['id']?.toString() ?? '',
    name: json['name']?.toString() ?? 'Saved search',
    query: json['query']?.toString() ?? '',
    country: json['country']?.toString(),
    workMode: json['workMode']?.toString(),
    seniority: json['seniority']?.toString(),
    employmentType: json['employmentType']?.toString(),
    eligibility: json['eligibility']?.toString(),
    alertsEnabled: json['alertsEnabled'] != false,
    cadence: AlertCadence.fromWire(json['cadence'] as String?),
    channels: AlertChannels.fromJson(
      json['channels'] is Map
          ? Map<String, dynamic>.from(json['channels'] as Map)
          : null,
    ),
    quietHours: AlertQuietHours.fromJson(
      json['quietHours'] is Map
          ? Map<String, dynamic>.from(json['quietHours'] as Map)
          : null,
    ),
    lastEvaluatedAt: DateTime.tryParse(
      json['lastEvaluatedAt'] as String? ?? '',
    ),
    newCount: _integer(json['newCount']),
    updatedAt: DateTime.tryParse(json['updatedAt'] as String? ?? ''),
  );

  static int _integer(dynamic value) {
    if (value is num) return value.toInt();
    return int.tryParse(value as String? ?? '') ?? 0;
  }
}
