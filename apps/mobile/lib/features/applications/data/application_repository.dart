import '../../../core/networking/api_client.dart';
import '../../../core/networking/api_exception.dart';
import '../../../core/storage/local_database.dart';
import '../../../core/synchronization/offline_action.dart';
import '../domain/job_application.dart';

class ApplicationRepository {
  ApplicationRepository({
    required ApiClient apiClient,
    required LocalDatabase database,
  }) : _apiClient = apiClient,
       _database = database;

  final ApiClient _apiClient;
  final LocalDatabase _database;

  Future<List<JobApplication>> listApplications() async {
    try {
      final response = await _apiClient.get('/applications');
      final applications = _applicationList(response)
          .map(JobApplication.fromJson)
          .toList();
      await Future.wait(
        applications.map((item) => _database.cacheApplication(item.toJson())),
      );
      return applications;
    } on ApiException catch (error) {
      if (!error.isNetworkError) rethrow;
      final cached = await _database.cachedApplications();
      return cached.map(JobApplication.fromJson).toList();
    }
  }

  Future<JobApplication> getApplication(String id) async {
    try {
      final response = await _apiClient.get('/applications/$id');
      return JobApplication.fromJson(_applicationMap(response));
    } on ApiException catch (error) {
      if (!error.isNotFound && !error.isNetworkError) rethrow;
      final applications = await listApplications();
      return applications.firstWhere(
        (application) => application.id == id,
        orElse: () => throw ApiException(
          statusCode: 404,
          message: error.isNetworkError
              ? 'This application is not available offline yet'
              : 'Application not found',
        ),
      );
    }
  }

  Future<JobApplication> createApplication(String opportunityId) async {
    try {
      final response = await _apiClient.post(
        '/applications',
        body: {'opportunityId': opportunityId},
      );
      final application = JobApplication.fromJson(_applicationMap(response));
      await _database.cacheApplication(application.toJson());
      return application;
    } on ApiException catch (error) {
      if (!error.isNetworkError) rethrow;
      final now = DateTime.now();
      final application = JobApplication(
        id: 'local-${now.microsecondsSinceEpoch}',
        userId: 'offline',
        opportunityId: opportunityId,
        status: 'SHORTLISTED',
        createdAt: now,
        updatedAt: now,
        version: 1,
      );
      await _database.cacheApplication(application.toJson());
      await _enqueue('create_application', {'opportunityId': opportunityId});
      return application;
    }
  }

  Future<JobApplication> updateStatus(
    JobApplication application, {
    required String status,
    String? note,
  }) async {
    final body = <String, dynamic>{
      'status': status,
      'version': application.version,
      if (note != null && note.isNotEmpty) 'note': note,
    };
    try {
      dynamic response;
      try {
        response = await _apiClient.patch(
          '/applications/${application.id}',
          body: body,
        );
      } on ApiException catch (error) {
        if (!error.isNotFound) rethrow;
        response = await _apiClient.patch(
          '/applications/${application.id}/status',
          body: body,
        );
      }
      final updated = JobApplication.fromJson(_applicationMap(response));
      await _database.cacheApplication(updated.toJson());
      return updated;
    } on ApiException catch (error) {
      if (!error.isNetworkError) rethrow;
      final updated = JobApplication(
        id: application.id,
        userId: application.userId,
        opportunityId: application.opportunityId,
        status: status,
        appliedAt: application.appliedAt,
        createdAt: application.createdAt,
        updatedAt: DateTime.now(),
        version: application.version + 1,
      );
      await _database.cacheApplication(updated.toJson());
      await _enqueue('update_application_status', {
        'id': application.id,
        'body': body,
      });
      return updated;
    }
  }

  Map<String, dynamic> _applicationMap(dynamic response) {
    if (response is Map && response['application'] is Map) {
      return Map<String, dynamic>.from(response['application'] as Map);
    }
    if (response is Map) return Map<String, dynamic>.from(response);
    return <String, dynamic>{};
  }

  List<Map<String, dynamic>> _applicationList(dynamic response) {
    if (response is Map && response['applications'] is List) {
      return (response['applications'] as List)
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList();
    }
    if (response is List) {
      return response
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList();
    }
    return const [];
  }

  Future<void> _enqueue(String type, Map<String, dynamic> payload) async {
    final now = DateTime.now();
    await _database.enqueueAction(
      OfflineAction(
        idempotencyKey: '$type-${now.microsecondsSinceEpoch}',
        actionType: type,
        payload: payload,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      ),
    );
  }
}
