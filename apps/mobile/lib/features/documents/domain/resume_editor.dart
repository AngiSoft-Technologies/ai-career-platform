import 'dart:convert';

/// The 18 Resumonk typefaces.
const List<({String key, String label})> resumeFonts = [
  (key: 'amaranth', label: 'Amaranth'),
  (key: 'arvo', label: 'Arvo'),
  (key: 'aurulent', label: 'Aurulent Sans'),
  (key: 'bitstream', label: 'Bitstream Vera Sans Mono'),
  (key: 'blokletters', label: 'Blokletters Balpen'),
  (key: 'cantarell', label: 'Cantarell'),
  (key: 'dosis', label: 'Dosis'),
  (key: 'droidserif', label: 'Droid Serif'),
  (key: 'latin', label: 'Latin Modern Mono'),
  (key: 'lato', label: 'Lato'),
  (key: 'lora', label: 'Lora'),
  (key: 'monda', label: 'Monda'),
  (key: 'montserrat', label: 'Montserrat'),
  (key: 'opensans', label: 'Open Sans'),
  (key: 'oswald', label: 'Oswald'),
  (key: 'raleway', label: 'Raleway'),
  (key: 'roboto', label: 'Roboto Slab'),
  (key: 'ubuntu', label: 'Ubuntu'),
];

/// The six Resumonk accents.
const List<String> resumeAccentColours = <String>[
  '#0F766E',
  '#1E1A17',
  '#7A2E1E',
  '#1E3A5F',
  '#4A2A6B',
  '#14532D',
];

const List<String> resumeTextColours = <String>[
  '#1E1A17',
  '#26201A',
  '#46413A',
  '#6E6258',
  '#41684E',
  '#C95F00',
];

const List<({String key, String label})> resumeTextSizes = [
  (key: 'compact', label: 'Compact'),
  (key: 'comfortable', label: 'Comfortable'),
  (key: 'cozy', label: 'Cozy'),
];

const List<({String key, String label})> resumePageSizes = [
  (key: 'letter', label: 'Letter'),
  (key: 'a4', label: 'A4'),
];

/// The 21 Resumonk templates.
class MobileResumeTemplate {
  const MobileResumeTemplate({
    required this.key,
    required this.label,
    required this.description,
    required this.free,
    required this.photo,
    required this.docx,
    required this.locked,
  });

  final String key;
  final String label;
  final String description;
  final bool free;
  final bool photo;
  final bool docx;
  final bool locked;
}

const List<MobileResumeTemplate> resumeTemplateCatalogue =
    <MobileResumeTemplate>[
      MobileResumeTemplate(
        key: 'zen',
        label: 'Zen',
        description: 'Balanced one-page layout with a headline block.',
        free: true,
        photo: true,
        docx: false,
        locked: false,
      ),
      MobileResumeTemplate(
        key: 'elegant',
        label: 'Elegant',
        description: 'Restrained serif styling for professional roles.',
        free: true,
        photo: false,
        docx: true,
        locked: false,
      ),
      MobileResumeTemplate(
        key: 'clear',
        label: 'Clear',
        description: 'Plain, readable layout that keeps content first.',
        free: true,
        photo: true,
        docx: false,
        locked: false,
      ),
      MobileResumeTemplate(
        key: 'classica',
        label: 'Classica',
        description: 'Traditional CV structure for conservative employers.',
        free: true,
        photo: false,
        docx: true,
        locked: false,
      ),
      MobileResumeTemplate(
        key: 'sleek',
        label: 'Sleek',
        description: 'Compact spacing for dense experience sections.',
        free: true,
        photo: false,
        docx: true,
        locked: false,
      ),
      MobileResumeTemplate(
        key: 'simplimo',
        label: 'Simplimo',
        description: 'Minimal rules and generous whitespace.',
        free: true,
        photo: false,
        docx: true,
        locked: false,
      ),
      MobileResumeTemplate(
        key: 'elemental',
        label: 'Elemental',
        description: 'Strong section hierarchy and accent rules.',
        free: false,
        photo: true,
        docx: false,
        locked: true,
      ),
      MobileResumeTemplate(
        key: 'regal',
        label: 'Regal',
        description: 'Executive layout for senior roles.',
        free: false,
        photo: true,
        docx: false,
        locked: true,
      ),
      MobileResumeTemplate(
        key: 'bold',
        label: 'Bold',
        description: 'High-contrast headings and confident rhythm.',
        free: false,
        photo: false,
        docx: true,
        locked: true,
      ),
      MobileResumeTemplate(
        key: 'concrete',
        label: 'Concrete',
        description: 'Structured blocks with generous labelling.',
        free: false,
        photo: false,
        docx: true,
        locked: true,
      ),
      MobileResumeTemplate(
        key: 'concise',
        label: 'Concise',
        description: 'Short, direct presentation for fast recruiters.',
        free: false,
        photo: false,
        docx: true,
        locked: true,
      ),
      MobileResumeTemplate(
        key: 'slim',
        label: 'Slim',
        description: 'Narrow rhythm for long documents.',
        free: false,
        photo: false,
        docx: true,
        locked: true,
      ),
      MobileResumeTemplate(
        key: 'collegium',
        label: 'Collegium',
        description: 'Academic styling for research histories.',
        free: false,
        photo: false,
        docx: true,
        locked: true,
      ),
      MobileResumeTemplate(
        key: 'charisma',
        label: 'Charisma',
        description: 'Warm layout for people-facing roles.',
        free: false,
        photo: false,
        docx: true,
        locked: true,
      ),
      MobileResumeTemplate(
        key: 'slate',
        label: 'Slate',
        description: 'Technical layout for engineering resumes.',
        free: false,
        photo: false,
        docx: true,
        locked: true,
      ),
      MobileResumeTemplate(
        key: 'modernism',
        label: 'Modernism',
        description: 'Modern type pairing and section headings.',
        free: false,
        photo: false,
        docx: true,
        locked: true,
      ),
      MobileResumeTemplate(
        key: 'stylismo',
        label: 'Stylismo',
        description: 'Creative editorial layout.',
        free: false,
        photo: false,
        docx: true,
        locked: true,
      ),
      MobileResumeTemplate(
        key: 'prestige',
        label: 'Prestige',
        description: 'Formal presentation-led layout.',
        free: false,
        photo: false,
        docx: true,
        locked: true,
      ),
      MobileResumeTemplate(
        key: 'vivid',
        label: 'Vivid',
        description: 'Colour-forward layout with portrait support.',
        free: false,
        photo: true,
        docx: false,
        locked: true,
      ),
      MobileResumeTemplate(
        key: 'vibrant',
        label: 'Vibrant',
        description: 'Energetic layout with a portrait block.',
        free: false,
        photo: true,
        docx: false,
        locked: true,
      ),
      MobileResumeTemplate(
        key: 'avant',
        label: 'Avant',
        description: 'Distinctive editorial layout with portrait support.',
        free: false,
        photo: true,
        docx: false,
        locked: true,
      ),
    ];

/// Contact block shown at the top of the sheet.
class ResumeContact {
  const ResumeContact({
    this.fullName = '',
    this.lastName = '',
    this.headline = '',
    this.email = '',
    this.phone = '',
    this.location = '',
    this.website = '',
    this.linkedin = '',
  });

  final String fullName;
  final String lastName;
  final String headline;
  final String email;
  final String phone;
  final String location;
  final String website;
  final String linkedin;

  ResumeContact copyWith({
    String? fullName,
    String? lastName,
    String? headline,
    String? email,
    String? phone,
    String? location,
    String? website,
    String? linkedin,
  }) {
    return ResumeContact(
      fullName: fullName ?? this.fullName,
      lastName: lastName ?? this.lastName,
      headline: headline ?? this.headline,
      email: email ?? this.email,
      phone: phone ?? this.phone,
      location: location ?? this.location,
      website: website ?? this.website,
      linkedin: linkedin ?? this.linkedin,
    );
  }

  factory ResumeContact.fromJson(Map<String, dynamic> json) {
    String read(String key) => json[key]?.toString() ?? '';
    return ResumeContact(
      fullName: read('fullName'),
      lastName: read('lastName'),
      headline: read('headline'),
      email: read('email'),
      phone: read('phone'),
      location: read('location'),
      website: read('website'),
      linkedin: read('linkedin'),
    );
  }

  Map<String, dynamic> toJson() => {
    'fullName': fullName,
    'lastName': lastName,
    'headline': headline,
    'email': email,
    'phone': phone,
    'location': location,
    'website': website,
    'linkedin': linkedin,
  };
}

/// One item in a resume section.
class ResumeEntry {
  const ResumeEntry({
    required this.id,
    this.title = '',
    this.organisation = '',
    this.location = '',
    this.date = '',
    this.url = '',
    this.summary = '',
    List<String>? bullets,
    List<String>? tags,
  }) : bullets = bullets ?? const <String>[],
       tags = tags ?? const <String>[];

  final String id;
  final String title;
  final String organisation;
  final String location;
  final String date;
  final String url;
  final String summary;
  final List<String> bullets;
  final List<String> tags;

  ResumeEntry copyWith({
    String? id,
    String? title,
    String? organisation,
    String? location,
    String? date,
    String? url,
    String? summary,
    List<String>? bullets,
    List<String>? tags,
  }) {
    return ResumeEntry(
      id: id ?? this.id,
      title: title ?? this.title,
      organisation: organisation ?? this.organisation,
      location: location ?? this.location,
      date: date ?? this.date,
      url: url ?? this.url,
      summary: summary ?? this.summary,
      bullets: bullets ?? this.bullets,
      tags: tags ?? this.tags,
    );
  }

  factory ResumeEntry.fromJson(Map<String, dynamic> json) {
    final start = json['startDate']?.toString() ?? '';
    final end = (json['current'] == true)
        ? 'Present'
        : json['endDate']?.toString() ?? '';
    final legacyDate = [start, end].where((v) => v.isNotEmpty).join(' – ');
    return ResumeEntry(
      id: json['id']?.toString() ?? '',
      title: json['title']?.toString() ?? '',
      organisation: json['organisation']?.toString() ?? '',
      location: json['location']?.toString() ?? '',
      date: json['date']?.toString() ?? legacyDate,
      url: json['url']?.toString() ?? '',
      summary: json['summary']?.toString() ?? '',
      bullets: ((json['bullets'] as List?) ?? const [])
          .map((item) => item.toString())
          .toList(),
      tags: ((json['tags'] as List?) ?? const [])
          .map((item) => item.toString())
          .toList(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'title': title,
      'organisation': organisation,
      'location': location,
      'date': date,
      'url': url,
      'summary': summary,
      'bullets': bullets,
      'tags': tags,
    };
  }
}

/// A resume section (Experience, Education, Skills, etc.).
class ResumeSection {
  const ResumeSection({
    required this.id,
    required this.type,
    required this.title,
    this.entries = const <ResumeEntry>[],
  });

  final String id;
  final String type;
  final String title;
  final List<ResumeEntry> entries;

  ResumeSection copyWith({
    String? id,
    String? type,
    String? title,
    List<ResumeEntry>? entries,
  }) {
    return ResumeSection(
      id: id ?? this.id,
      type: type ?? this.type,
      title: title ?? this.title,
      entries: entries ?? this.entries,
    );
  }

  factory ResumeSection.fromJson(Map<String, dynamic> json) {
    return ResumeSection(
      id: json['id']?.toString() ?? '',
      type: json['type']?.toString() ?? 'custom',
      title: json['title']?.toString() ?? '',
      entries: ((json['entries'] as List?) ?? const [])
          .whereType<Map>()
          .map((item) => ResumeEntry.fromJson(Map<String, dynamic>.from(item)))
          .toList(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'type': type,
      'title': title,
      'entries': entries.map((entry) => entry.toJson()).toList(),
    };
  }
}

/// Four independent millimetre margins.
class ResumeMargins {
  const ResumeMargins({
    this.top = 16,
    this.right = 16,
    this.bottom = 16,
    this.left = 16,
  });

  final int top;
  final int right;
  final int bottom;
  final int left;

  ResumeMargins copyWith({int? top, int? right, int? bottom, int? left}) {
    return ResumeMargins(
      top: top ?? this.top,
      right: right ?? this.right,
      bottom: bottom ?? this.bottom,
      left: left ?? this.left,
    );
  }

  Map<String, dynamic> toJson() {
    return {'top': top, 'right': right, 'bottom': bottom, 'left': left};
  }
}

/// The saved design controls.
class ResumeDesign {
  const ResumeDesign({
    this.font = 'lora',
    this.textColor = '#1E1A17',
    this.accentColor = '#FF8A00',
    this.textSize = 'comfortable',
    this.pageSize = 'letter',
    this.margins = const ResumeMargins(),
    this.photoUrl,
  });

  final String font;
  final String textColor;
  final String accentColor;
  final String textSize;
  final String pageSize;
  final ResumeMargins margins;
  final String? photoUrl;

  ResumeDesign copyWith({
    String? font,
    String? textColor,
    String? accentColor,
    String? textSize,
    String? pageSize,
    ResumeMargins? margins,
    String? photoUrl,
  }) {
    return ResumeDesign(
      font: font ?? this.font,
      textColor: textColor ?? this.textColor,
      accentColor: accentColor ?? this.accentColor,
      textSize: textSize ?? this.textSize,
      pageSize: pageSize ?? this.pageSize,
      margins: margins ?? this.margins,
      photoUrl: photoUrl,
    );
  }

  ResumeDesign clearPhoto() {
    return ResumeDesign(
      font: font,
      textColor: textColor,
      accentColor: accentColor,
      textSize: textSize,
      pageSize: pageSize,
      margins: margins,
      photoUrl: null,
    );
  }

  factory ResumeDesign.fromJson(Map<String, dynamic> json) {
    final legacyMargin = json['margin']?.toString() ?? '';
    final fallback = switch (legacyMargin) {
      'narrow' => const ResumeMargins(top: 12, right: 12, bottom: 12, left: 12),
      'wide' => const ResumeMargins(top: 22, right: 22, bottom: 22, left: 22),
      _ => const ResumeMargins(top: 16, right: 16, bottom: 16, left: 16),
    };
    final raw = json['margins'];
    final marginsMap = raw is Map ? Map<String, dynamic>.from(raw) : {};
    int margin(String key, int fallbackValue) {
      final value = marginsMap[key];
      if (value is num) return value.toInt().clamp(0, 30);
      return fallbackValue;
    }

    final font = json['font']?.toString() ?? '';
    return ResumeDesign(
      font: resumeFonts.any((item) => item.key == font) ? font : 'lora',
      textColor: json['textColor']?.toString() ?? '#1E1A17',
      accentColor: json['accentColor']?.toString() ?? '#FF8A00',
      textSize: json['textSize']?.toString() ?? 'comfortable',
      pageSize: json['pageSize']?.toString() ?? 'letter',
      margins: ResumeMargins(
        top: margin('top', fallback.top),
        right: margin('right', fallback.right),
        bottom: margin('bottom', fallback.bottom),
        left: margin('left', fallback.left),
      ),
      photoUrl: json['photoUrl']?.toString(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'font': font,
      'textColor': textColor,
      'accentColor': accentColor,
      'textSize': textSize,
      'pageSize': pageSize,
      'margins': margins.toJson(),
      if (photoUrl != null) 'photoUrl': photoUrl,
    };
  }
}

/// Cover-letter fields.
class CoverLetter {
  const CoverLetter({
    this.recipientName = '',
    this.recipientCompany = '',
    this.recipientAddress = '',
    this.subject = '',
    this.greeting = '',
    this.body = '',
    this.signoff = '',
  });

  final String recipientName;
  final String recipientCompany;
  final String recipientAddress;
  final String subject;
  final String greeting;
  final String body;
  final String signoff;

  CoverLetter copyWith({
    String? recipientName,
    String? recipientCompany,
    String? recipientAddress,
    String? subject,
    String? greeting,
    String? body,
    String? signoff,
  }) {
    return CoverLetter(
      recipientName: recipientName ?? this.recipientName,
      recipientCompany: recipientCompany ?? this.recipientCompany,
      recipientAddress: recipientAddress ?? this.recipientAddress,
      subject: subject ?? this.subject,
      greeting: greeting ?? this.greeting,
      body: body ?? this.body,
      signoff: signoff ?? this.signoff,
    );
  }

  factory CoverLetter.fromJson(Map<String, dynamic> json) {
    return CoverLetter(
      recipientName: json['recipientName']?.toString() ?? '',
      recipientCompany: json['recipientCompany']?.toString() ?? '',
      recipientAddress: json['recipientAddress']?.toString() ?? '',
      subject: json['subject']?.toString() ?? '',
      greeting: json['greeting']?.toString() ?? '',
      body: json['body']?.toString() ?? '',
      signoff: json['signoff']?.toString() ?? '',
    );
  }

  Map<String, dynamic> toJson() => {
    'recipientName': recipientName,
    'recipientCompany': recipientCompany,
    'recipientAddress': recipientAddress,
    'subject': subject,
    'greeting': greeting,
    'body': body,
    'signoff': signoff,
  };
}

/// The structured editor model for a resume or cover letter.
class ResumeDocument {
  const ResumeDocument({
    required this.kind,
    required this.contact,
    required this.sections,
    required this.design,
    this.coverLetter = const CoverLetter(),
  });

  final String kind;
  final ResumeContact contact;
  final List<ResumeSection> sections;
  final ResumeDesign design;
  final CoverLetter coverLetter;

  bool get isLetter => kind == 'cover_letter';

  ResumeDocument copyWith({
    String? kind,
    ResumeContact? contact,
    List<ResumeSection>? sections,
    ResumeDesign? design,
    CoverLetter? coverLetter,
  }) {
    return ResumeDocument(
      kind: kind ?? this.kind,
      contact: contact ?? this.contact,
      sections: sections ?? this.sections,
      design: design ?? this.design,
      coverLetter: coverLetter ?? this.coverLetter,
    );
  }

  /// Parses the saved structured document, or converts legacy plain text.
  factory ResumeDocument.fromJson(
    Map<String, dynamic>? source, {
    String fallbackKind = 'resume',
    String fallbackContent = '',
  }) {
    if (source == null || source.isEmpty) {
      final body = fallbackContent.trim();
      final sections = <ResumeSection>[];
      if (body.isNotEmpty) {
        sections.add(
          ResumeSection(
            id: 'section-summary',
            type: 'summary',
            title: 'Summary',
            entries: [ResumeEntry(id: 'entry-summary', summary: body)],
          ),
        );
      }
      return ResumeDocument(
        kind: fallbackKind == 'cover_letter' ? 'cover_letter' : 'resume',
        contact: const ResumeContact(),
        sections: sections,
        design: const ResumeDesign(),
        coverLetter: CoverLetter(body: body),
      );
    }

    final kind =
        source['kind']?.toString() == 'cover_letter' ||
            (source['kind'] == null && fallbackKind == 'cover_letter')
        ? 'cover_letter'
        : 'resume';
    final rawSections = ((source['sections'] as List?) ?? const [])
        .whereType<Map>()
        .map((item) => ResumeSection.fromJson(Map<String, dynamic>.from(item)))
        .toList();

    // Skills is one grouped block in Resumonk; flatten old per-skill entries.
    final sections = rawSections.map((section) {
      if (section.type != 'skills') return section;
      if (section.entries.isEmpty) return section;
      final summary = section.entries
          .map((entry) {
            if (entry.summary.trim().isNotEmpty) return entry.summary;
            return [
              entry.title,
              if (entry.tags.isNotEmpty) entry.tags.join(', '),
            ].where((part) => part.isNotEmpty).join(', ');
          })
          .where((value) => value.trim().isNotEmpty)
          .join('\n');
      return section.copyWith(
        id: section.id.isEmpty ? 'section-skills' : section.id,
        entries: [
          ResumeEntry(
            id: section.entries.first.id.isEmpty
                ? 'entry-skills'
                : section.entries.first.id,
            summary: summary,
          ),
        ],
      );
    }).toList();

    final rawDesign = source['design'];
    final design = rawDesign is Map
        ? ResumeDesign.fromJson(Map<String, dynamic>.from(rawDesign))
        : const ResumeDesign();
    final rawLetter = source['coverLetter'];
    final letter = rawLetter is Map
        ? CoverLetter.fromJson(Map<String, dynamic>.from(rawLetter))
        : CoverLetter(
            body: sections
                .firstWhere(
                  (section) => section.title.trim().isEmpty,
                  orElse: () => sections.isNotEmpty
                      ? sections.first
                      : const ResumeSection(
                          id: 'letter-body',
                          type: 'custom',
                          title: '',
                          entries: [ResumeEntry(id: 'letter-body')],
                        ),
                )
                .entries
                .map((entry) => entry.summary)
                .join('\n'),
          );

    return ResumeDocument(
      kind: kind,
      contact: ResumeContact.fromJson(
        (source['contact'] is Map)
            ? Map<String, dynamic>.from(source['contact'] as Map)
            : <String, dynamic>{},
      ),
      sections: sections,
      design: design,
      coverLetter: letter,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'kind': kind,
      'contact': contact.toJson(),
      'sections': sections.map((section) => section.toJson()).toList(),
      'design': design.toJson(),
      'coverLetter': coverLetter.toJson(),
    };
  }
}

/// Section catalogue matching Resumonk's add-section menu.
const List<({String type, String label, String entryLabel})>
resumeSectionCatalogue = [
  (type: 'summary', label: 'Summary', entryLabel: 'summary'),
  (type: 'experience', label: 'Experience', entryLabel: 'experience'),
  (type: 'education', label: 'Education', entryLabel: 'education'),
  (type: 'skills', label: 'Skills', entryLabel: 'skills'),
  (type: 'projects', label: 'Projects', entryLabel: 'project'),
  (type: 'publications', label: 'Publications', entryLabel: 'publication'),
  (
    type: 'volunteering',
    label: 'Volunteering',
    entryLabel: 'volunteering position',
  ),
  (type: 'honors', label: 'Honors', entryLabel: 'honor'),
  (type: 'awards', label: 'Awards', entryLabel: 'award'),
  (type: 'languages', label: 'Languages', entryLabel: 'language'),
  (
    type: 'certifications',
    label: 'Certifications',
    entryLabel: 'certification',
  ),
  (
    type: 'recommendations',
    label: 'Recommendations',
    entryLabel: 'recommendation',
  ),
  (type: 'custom', label: 'Custom section…', entryLabel: 'entry'),
];

/// A single editable field for a section entry.
({String field, String label, bool long}) resumeField({
  required String sectionType,
}) {
  switch (sectionType) {
    case 'experience':
      return (field: 'designation', label: 'Designation', long: false);
    case 'education':
      return (field: 'degree', label: 'Degree', long: false);
    case 'projects':
      return (field: 'project_title', label: 'Project title', long: false);
    case 'publications':
      return (field: 'title', label: 'Title', long: false);
    case 'volunteering':
      return (field: 'cause', label: 'Cause', long: false);
    case 'honors':
      return (field: 'honor', label: 'Honor', long: false);
    case 'awards':
      return (field: 'award', label: 'Award', long: false);
    case 'languages':
      return (field: 'language', label: 'Language', long: false);
    case 'certifications':
      return (field: 'certification', label: 'Certification', long: false);
    case 'recommendations':
      return (field: 'referee', label: 'Referee', long: false);
    case 'skills':
      return (field: 'skills', label: 'Skills', long: true);
    case 'summary':
      return (field: 'summary', label: 'Summary', long: true);
    default:
      return (field: 'heading', label: 'Heading', long: false);
  }
}

/// The full ordered field list for each section type.
List<({String field, String label, bool long})> resumeEntryFields({
  required String sectionType,
}) {
  final primary = resumeField(sectionType: sectionType);
  final secondary = resumeSecondaryField(sectionType);
  final fields = <({String field, String label, bool long})>[];

  if (sectionType == 'summary') {
    return [primary];
  }
  if (sectionType == 'skills') {
    return [primary];
  }
  if (sectionType == 'languages') {
    return [primary, secondary];
  }

  fields.addAll([primary, if (secondary.field.isNotEmpty) secondary]);
  if (sectionType == 'projects' ||
      sectionType == 'publications' ||
      sectionType == 'awards' ||
      sectionType == 'certifications') {
    fields.add((field: 'url', label: 'Link', long: false));
  }
  if (sectionType != 'languages') {
    fields.add((field: 'date', label: 'Date(s)', long: false));
  }
  fields.add((field: 'details', label: 'Details', long: true));
  return fields;
}

({String field, String label, bool long}) resumeSecondaryField(
  String sectionType,
) {
  switch (sectionType) {
    case 'experience':
      return (field: 'company', label: 'Company', long: false);
    case 'education':
      return (field: 'institute', label: 'Institute', long: false);
    case 'projects':
      return (field: 'organisation', label: 'Organisation', long: false);
    case 'publications':
      return (field: 'publisher', label: 'Publisher', long: false);
    case 'volunteering':
      return (field: 'organization', label: 'Organization', long: false);
    case 'honors':
      return (field: 'issuer', label: 'Issuer', long: false);
    case 'awards':
      return (field: 'awarded_by', label: 'Awarded by', long: false);
    case 'languages':
      return (field: 'proficiency', label: 'Proficiency', long: false);
    case 'certifications':
      return (field: 'authority', label: 'Certifying Authority', long: false);
    case 'recommendations':
      return (field: 'designation', label: 'Designation', long: false);
    default:
      return (field: 'subheading', label: 'Subheading', long: false);
  }
}

/// Local-only helper: a blank entry id for add actions.
String resumeEntryId() =>
    'entry-${DateTime.now().microsecondsSinceEpoch.toString()}';

/// Starter document for a new resume.
ResumeDocument starterResumeDocument({String kind = 'resume'}) {
  final isLetter = kind == 'cover_letter';
  if (isLetter) {
    return ResumeDocument(
      kind: 'cover_letter',
      contact: const ResumeContact(),
      sections: const <ResumeSection>[],
      design: const ResumeDesign(),
      coverLetter: const CoverLetter(),
    );
  }
  ResumeSection make(String type) {
    return ResumeSection(
      id: 'section-$type',
      type: type,
      title: resumeSectionCatalogue.firstWhere((row) => row.type == type).label,
      entries: type == 'summary' || type == 'skills'
          ? [ResumeEntry(id: 'entry-$type')]
          : const <ResumeEntry>[],
    );
  }

  return ResumeDocument(
    kind: 'resume',
    contact: const ResumeContact(),
    sections: [
      make('summary'),
      make('experience'),
      make('education'),
      make('skills'),
      make('projects'),
    ],
    design: const ResumeDesign(),
  );
}

/// Small debug helper used in tests and validation logs.
String encodeResumeDocument(ResumeDocument document) {
  return jsonEncode(document.toJson());
}
