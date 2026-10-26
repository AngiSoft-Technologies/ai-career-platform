import '../../../core/networking/api_client.dart';
import '../../../core/networking/api_exception.dart';
import '../../opportunities/domain/opportunity.dart';
import '../domain/job_match.dart';

class MatchRepository {
  const MatchRepository({required ApiClient apiClient})
    : _apiClient = apiClient;

  final ApiClient _apiClient;

  Future<List<Opportunity>> listMatches({int limit = 50}) async {
    final response = await _apiClient.get(
      '/matches',
      query: {'limit': '$limit'},
    );
    if (response is Map && response['items'] is List) {
      return (response['items'] as List)
          .whereType<Map>()
          .map((item) => Opportunity.fromJson(Map<String, dynamic>.from(item)))
          .toList();
    }
    throw const ApiException(
      statusCode: 502,
      message: 'The match service returned an unexpected response.',
    );
  }

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
