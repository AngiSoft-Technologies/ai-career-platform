import '../../../core/networking/api_client.dart';
import '../../../core/networking/api_exception.dart';
import '../../applications/data/application_repository.dart';
import '../../opportunities/data/opportunity_repository.dart';
import '../domain/application_workspace.dart';
import '../domain/application_analysis.dart';

class ApplicationWorkspaceRepository {
  ApplicationWorkspaceRepository({
    required ApiClient apiClient,
    required ApplicationRepository applicationRepository,
    required OpportunityRepository opportunityRepository,
  }) : _apiClient = apiClient,
       _applicationRepository = applicationRepository,
       _opportunityRepository = opportunityRepository;

  final ApiClient _apiClient;
  final ApplicationRepository _applicationRepository;
  final OpportunityRepository _opportunityRepository;

  Future<ApplicationWorkspace> getWorkspace(String applicationId) async {
    final application = await _applicationRepository.getApplication(
      applicationId,
    );
    try {
      final response = await _apiClient.get(
        '/applications/$applicationId/workspace',
      );
      final opportunity = await _safeOpportunity(application.opportunityId);
      return ApplicationWorkspace.fromJson(
        _workspaceMap(response),
        applicationId: applicationId,
        opportunity: opportunity,
      );
    } on ApiException catch (error) {
      if (!error.isNotFound) rethrow;
      final opportunity = await _opportunityRepository.getById(
        application.opportunityId,
      );
      final response = await _apiClient.get(
        '/opportunities/${opportunity.id}/workspace',
      );
      return ApplicationWorkspace.fromJson(
        _workspaceMap(response),
        applicationId: applicationId,
        opportunity: opportunity,
      );
    }
  }

  Future<ApplicationAnalysis> analyzeApplication(String applicationId) async {
    final response = await _apiClient.post(
      '/applications/$applicationId/analyze',
    );
    if (response is Map && response['analysis'] is Map) {
      return ApplicationAnalysis.fromJson(
        Map<String, dynamic>.from(response['analysis'] as Map),
      );
    }
    if (response is Map) {
      return ApplicationAnalysis.fromJson(Map<String, dynamic>.from(response));
    }
    throw const ApiException(
      statusCode: 500,
      message: 'The application instructions could not be read.',
    );
  }

  Future<dynamic> _safeOpportunity(String opportunityId) async {
    try {
      return await _opportunityRepository.getById(opportunityId);
    } catch (_) {
      return null;
    }
  }

  Map<String, dynamic> _workspaceMap(dynamic response) {
    if (response is Map && response['workspace'] is Map) {
      return Map<String, dynamic>.from(response['workspace'] as Map);
    }
    if (response is Map) return Map<String, dynamic>.from(response);
    return <String, dynamic>{};
  }
}
