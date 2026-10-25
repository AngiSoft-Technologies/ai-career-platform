import '../../opportunities/domain/opportunity.dart';
import '../domain/job_match.dart';

class MatchRepository {
  const MatchRepository();

  JobMatch matchFor(Opportunity opportunity) {
    return opportunity.match ??
        const JobMatch(
          score: 0,
          explanation: 'No match analysis is available yet.',
          gaps: [],
          factors: MatchFactors(),
        );
  }
}
