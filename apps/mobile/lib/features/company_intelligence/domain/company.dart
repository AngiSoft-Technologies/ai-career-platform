/// A company, as the companies endpoint returns it.
///
/// The web's `/companies` page has browsed employers since the catalogue
/// learned which company posts which role; the mobile app only ever
/// showed a company card on one opportunity. These models close that
/// gap — the same list, the same detail, the same numbers.
class Company {
  const Company({
    required this.id,
    required this.name,
    required this.slug,
    this.website,
    this.careersUrl,
    this.industry,
    this.country,
    this.openRoles = 0,
    this.newThisWeek = 0,
  });

  final String id;
  final String name;
  final String slug;
  final String? website;
  final String? careersUrl;
  final String? industry;
  final String? country;

  /// Live roles the catalogue currently holds for this company.
  final int openRoles;

  /// Roles first seen in the last seven days — the "still hiring" signal.
  final int newThisWeek;

  bool get isHiringNow => newThisWeek > 0;

  /// "Energy · Kenya", or an em dash when the company row is thin.
  String get subtitle {
    final parts = [
      industry,
      country,
    ].where((p) => p != null && p.trim().isNotEmpty);
    return parts.isEmpty ? '—' : parts.join(' · ');
  }

  factory Company.fromJson(Map<String, dynamic> json) {
    return Company(
      id: json['id'] as String,
      name: (json['name'] as String?) ?? 'Unknown company',
      slug: json['slug'] as String,
      website: json['website'] as String?,
      careersUrl: json['careers_url'] as String?,
      industry: json['industry'] as String?,
      country: json['country'] as String?,
      openRoles: _integer(json['open_roles']),
      newThisWeek: _integer(json['new_this_week']),
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'slug': slug,
    'website': website,
    'careers_url': careersUrl,
    'industry': industry,
    'country': country,
    'open_roles': openRoles,
    'new_this_week': newThisWeek,
  };
}

/// One role on a company's page — the employer's hiring history.
class CompanyRole {
  const CompanyRole({
    required this.id,
    required this.title,
    this.country,
    this.city,
    this.workMode,
    this.seniority,
    this.employmentType,
    this.salaryMin,
    this.salaryMax,
    this.currency,
    this.applyUrl,
    this.postedAt,
    this.status,
  });

  final String id;
  final String title;
  final String? country;
  final String? city;
  final String? workMode;
  final String? seniority;
  final String? employmentType;
  final int? salaryMin;
  final int? salaryMax;
  final String? currency;
  final String? applyUrl;
  final DateTime? postedAt;
  final String? status;

  factory CompanyRole.fromJson(Map<String, dynamic> json) {
    return CompanyRole(
      id: json['id'] as String,
      title: (json['title'] as String?) ?? 'Untitled role',
      country: json['country'] as String?,
      city: json['city'] as String?,
      workMode: json['work_mode'] as String?,
      seniority: json['seniority'] as String?,
      employmentType: json['employment_type'] as String?,
      salaryMin: _integerOrNull(json['salary_min']),
      salaryMax: _integerOrNull(json['salary_max']),
      currency: json['currency'] as String?,
      applyUrl: json['apply_url'] as String?,
      postedAt: DateTime.tryParse(json['posted_at'] as String? ?? ''),
      status: json['status'] as String?,
    );
  }
}

/// The numbers a company's hiring history adds up to.
class CompanyStats {
  const CompanyStats({
    this.total = 0,
    this.last7Days = 0,
    this.last30Days = 0,
    this.averageSalary,
    this.countries = 0,
  });

  final int total;
  final int last7Days;
  final int last30Days;
  final int? averageSalary;
  final int countries;

  factory CompanyStats.fromJson(Map<String, dynamic> json) {
    return CompanyStats(
      total: _integer(json['total']),
      last7Days: _integer(json['last_7_days']),
      last30Days: _integer(json['last_30_days']),
      averageSalary: _integerOrNull(json['avg_salary']),
      countries: _integer(json['countries']),
    );
  }
}

/// A company, its live roles, and what its history adds up to.
class CompanyDetail {
  const CompanyDetail({
    required this.company,
    required this.roles,
    required this.stats,
  });

  final Company company;
  final List<CompanyRole> roles;
  final CompanyStats stats;

  factory CompanyDetail.fromJson(Map<String, dynamic> json) {
    return CompanyDetail(
      company: Company.fromJson(json['company'] as Map<String, dynamic>),
      roles: ((json['roles'] as List?) ?? const [])
          .map((role) => CompanyRole.fromJson(role as Map<String, dynamic>))
          .toList(),
      stats: CompanyStats.fromJson(
        (json['stats'] as Map<String, dynamic>?) ?? const <String, dynamic>{},
      ),
    );
  }
}

int _integer(Object? value) => _integerOrNull(value) ?? 0;

int? _integerOrNull(Object? value) {
  if (value is int) return value;
  if (value is num) return value.toInt();
  if (value is String) return int.tryParse(value);
  return null;
}
