import '../../../core/networking/api_client.dart';
import '../../../core/networking/api_exception.dart';
import '../../career_profile/data/profile_repository.dart';
import '../domain/career_intelligence.dart';

class CareerIntelligenceRepository {
  CareerIntelligenceRepository({
    required ApiClient apiClient,
    required ProfileRepository profileRepository,
  }) : _apiClient = apiClient,
       _profileRepository = profileRepository;

  final ApiClient _apiClient;
  final ProfileRepository _profileRepository;

  Future<CareerIntelligence> getAnalysis() async {
    try {
      final response = await _apiClient.get('/ai/profile-analysis');
      return CareerIntelligence.fromJson(_analysisMap(response));
    } on ApiException catch (error) {
      if (!error.isNotFound && !error.isNetworkError) rethrow;
      return _localAnalysis();
    }
  }

  Future<CareerIntelligence> _localAnalysis() async {
    final profile = await _profileRepository.getProfile();
    final recommendations = <String>[];
    if (profile.summary.trim().isEmpty) {
      recommendations.add(
        'Add a concise summary of your impact and expertise.',
      );
    }
    if (profile.skills.isEmpty) {
      recommendations.add(
        'Add the technologies you want recruiters to discover.',
      );
    }
    if (profile.desiredRoles.isEmpty) {
      recommendations.add(
        'Choose target roles to improve opportunity ranking.',
      );
    }
    return CareerIntelligence(
      summary: profile.summary.trim().isEmpty
          ? 'Your career profile is ready for deeper analysis.'
          : profile.summary,
      strengths: profile.skills.take(5).toList(),
      gaps: const [],
      recommendations: recommendations,
    );
  }

  Map<String, dynamic> _analysisMap(dynamic response) {
    if (response is Map && response['analysis'] is Map) {
      return Map<String, dynamic>.from(response['analysis'] as Map);
    }
    if (response is Map) return Map<String, dynamic>.from(response);
    return <String, dynamic>{};
  }
}
