/// Timeline, interview, note and attachment models for an application.
///
/// The server returns each collection from its own endpoint; these types are
/// the cached, offline-safe shape the UI reads.
class TimelineEvent {
  const TimelineEvent({
    required this.id,
    required this.applicationId,
    required this.status,
    required this.occurredAt,
    this.note = '',
    this.actor = '',
  });

  final String id;
  final String applicationId;
  final String status;
  final DateTime occurredAt;
  final String note;
  final String actor;

  String get statusLabel => status
      .toLowerCase()
      .split('_')
      .map(
        (part) => part.isEmpty
            ? part
            : '${part[0].toUpperCase()}${part.substring(1)}',
      )
      .join(' ');

  factory TimelineEvent.fromJson(Map<String, dynamic> json) => TimelineEvent(
    id: json['id']?.toString() ?? '',
    applicationId: json['applicationId']?.toString() ?? '',
    status: json['status']?.toString() ?? 'UNKNOWN',
    occurredAt:
        DateTime.tryParse(json['occurredAt'] as String? ?? '') ??
        DateTime.tryParse(json['createdAt'] as String? ?? '') ??
        DateTime.now(),
    note: json['note']?.toString() ?? '',
    actor: json['actor']?.toString() ?? '',
  );

  Map<String, dynamic> toJson() => {
    'id': id,
    'applicationId': applicationId,
    'status': status,
    'occurredAt': occurredAt.toUtc().toIso8601String(),
    'note': note,
    'actor': actor,
  };
}

class ApplicationInterview {
  const ApplicationInterview({
    required this.id,
    required this.applicationId,
    required this.stage,
    required this.startsAt,
    this.location = '',
    this.contact = '',
    this.notes = '',
    this.isRemote = false,
  });

  final String id;
  final String applicationId;
  final String stage;
  final DateTime startsAt;
  final String location;
  final String contact;
  final String notes;
  final bool isRemote;

  bool get isUpcoming => startsAt.isAfter(DateTime.now());

  factory ApplicationInterview.fromJson(Map<String, dynamic> json) =>
      ApplicationInterview(
        id: json['id']?.toString() ?? '',
        applicationId: json['applicationId']?.toString() ?? '',
        stage: json['stage']?.toString() ?? 'Interview',
        startsAt:
            DateTime.tryParse(
              (json['startsAt'] ?? json['scheduledAt']) as String? ?? '',
            ) ??
            DateTime.now(),
        location: (json['location'] ?? json['meetingUrl'])?.toString() ?? '',
        contact: (json['contact'] ?? json['contactName'])?.toString() ?? '',
        notes: json['notes']?.toString() ?? '',
        isRemote:
            json['isRemote'] == true ||
            (json['location']?.toString().contains('http') ?? false),
      );

  Map<String, dynamic> toJson() => {
    'id': id,
    'applicationId': applicationId,
    'stage': stage,
    'startsAt': startsAt.toUtc().toIso8601String(),
    'location': location,
    'contact': contact,
    'notes': notes,
    'isRemote': isRemote,
  };
}

class ApplicationNote {
  const ApplicationNote({
    required this.id,
    required this.applicationId,
    required this.body,
    required this.createdAt,
    this.author = '',
  });

  final String id;
  final String applicationId;
  final String body;
  final DateTime createdAt;
  final String author;

  factory ApplicationNote.fromJson(Map<String, dynamic> json) =>
      ApplicationNote(
        id: json['id']?.toString() ?? '',
        applicationId: json['applicationId']?.toString() ?? '',
        body: json['body']?.toString() ?? json['note']?.toString() ?? '',
        createdAt:
            DateTime.tryParse(json['createdAt'] as String? ?? '') ??
            DateTime.now(),
        author: json['author']?.toString() ?? '',
      );

  Map<String, dynamic> toJson() => {
    'id': id,
    'applicationId': applicationId,
    'body': body,
    'createdAt': createdAt.toUtc().toIso8601String(),
    'author': author,
  };
}

class ApplicationAttachment {
  const ApplicationAttachment({
    required this.id,
    required this.applicationId,
    required this.name,
    this.url = '',
    this.mimeType = '',
    this.sizeBytes = 0,
    this.createdAt,
  });

  final String id;
  final String applicationId;
  final String name;
  final String url;
  final String mimeType;
  final int sizeBytes;
  final DateTime? createdAt;

  factory ApplicationAttachment.fromJson(Map<String, dynamic> json) =>
      ApplicationAttachment(
        id: json['id']?.toString() ?? '',
        applicationId: json['applicationId']?.toString() ?? '',
        name: (json['name'] ?? json['filename'])?.toString() ?? 'Attachment',
        url: (json['url'] ?? json['storageUrl'])?.toString() ?? '',
        mimeType: json['mimeType']?.toString() ?? '',
        sizeBytes: (json['sizeBytes'] as num?)?.toInt() ?? 0,
        createdAt: DateTime.tryParse(json['createdAt'] as String? ?? ''),
      );

  Map<String, dynamic> toJson() => {
    'id': id,
    'applicationId': applicationId,
    'name': name,
    'url': url,
    'mimeType': mimeType,
    'sizeBytes': sizeBytes,
    if (createdAt != null) 'createdAt': createdAt!.toUtc().toIso8601String(),
  };
}

class ApplicationTimeline {
  const ApplicationTimeline({
    this.events = const [],
    this.interviews = const [],
    this.notes = const [],
    this.attachments = const [],
    this.nextAction,
  });

  final List<TimelineEvent> events;
  final List<ApplicationInterview> interviews;
  final List<ApplicationNote> notes;
  final List<ApplicationAttachment> attachments;

  /// The next thing the candidate should do, supplied by the API when it can
  /// infer one from status and upcoming interviews.
  final String? nextAction;

  ApplicationInterview? get nextInterview {
    final upcoming = interviews.where((item) => item.isUpcoming).toList()
      ..sort((a, b) => a.startsAt.compareTo(b.startsAt));
    if (upcoming.isNotEmpty) return upcoming.first;
    return null;
  }

  factory ApplicationTimeline.fromJson(Map<String, dynamic> json) =>
      ApplicationTimeline(
        events: _list(json['timeline'] ?? json['events'])
            .map(TimelineEvent.fromJson)
            .toList(),
        interviews: _list(json['interviews'])
            .map(ApplicationInterview.fromJson)
            .toList(),
        notes: _list(json['notes']).map(ApplicationNote.fromJson).toList(),
        attachments: _list(json['attachments'])
            .map(ApplicationAttachment.fromJson)
            .toList(),
        nextAction: json['nextAction'] as String?,
      );

  Map<String, dynamic> toJson() => {
    'timeline': events.map((item) => item.toJson()).toList(),
    'interviews': interviews.map((item) => item.toJson()).toList(),
    'notes': notes.map((item) => item.toJson()).toList(),
    'attachments': attachments.map((item) => item.toJson()).toList(),
    if (nextAction != null) 'nextAction': nextAction,
  };

  static List<Map<String, dynamic>> _list(dynamic value) {
    if (value is! List) return const [];
    return value
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
  }
}
