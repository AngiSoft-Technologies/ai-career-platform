import '../../opportunities/domain/opportunity.dart';

class CompanyIntelligence {
  const CompanyIntelligence({
    required this.companyName,
    required this.companySlug,
    required this.location,
    required this.platform,
    required this.applicationMethod,
    required this.opportunityCount,
    this.website,
  });

  final String companyName;
  final String companySlug;
  final String location;
  final String platform;
  final String applicationMethod;
  final int opportunityCount;
  final String? website;

  factory CompanyIntelligence.fromOpportunity(
    Opportunity opportunity, {
    int opportunityCount = 1,
  }) {
    return CompanyIntelligence(
      companyName: opportunity.companyName,
      companySlug: opportunity.companySlug,
      location: opportunity.locationLabel,
      platform: opportunity.platform,
      applicationMethod: opportunity.applicationMethod,
      opportunityCount: opportunityCount,
      website: opportunity.companyWebsite,
    );
  }
}
