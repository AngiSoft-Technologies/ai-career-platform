import '../../opportunities/domain/opportunity.dart';
import '../domain/company_intelligence.dart';

class CompanyIntelligenceRepository {
  const CompanyIntelligenceRepository();

  CompanyIntelligence build(
    Opportunity opportunity, {
    int opportunityCount = 1,
  }) {
    return CompanyIntelligence.fromOpportunity(
      opportunity,
      opportunityCount: opportunityCount,
    );
  }
}
