import '../../../core/networking/api_client.dart';
import '../../../core/networking/api_exception.dart';
import '../../../core/storage/local_database.dart';
import '../../../core/synchronization/offline_action.dart';
import '../domain/job_preferences.dart';

class PreferencesRepository {
  PreferencesRepository({
    required ApiClient apiClient,
    required LocalDatabase database,
  }) : _apiClient = apiClient,
       _database = database;

  final ApiClient _apiClient;
  final LocalDatabase _database;

  Future<JobPreferences> getPreferences() async {
    try {
      final response = await _apiClient.get('/profile/preferences');
      final preferences = JobPreferences.fromJson(_preferencesMap(response));
      await _database.cachePreferences(preferences.toJson());
      return preferences;
    } on ApiException catch (error) {
      if (!error.isNotFound && !error.isNetworkError) rethrow;
      final cached = await _database.cachedPreferences();
      if (cached != null) return JobPreferences.fromJson(cached);
      if (error.isNetworkError) rethrow;
      return const JobPreferences();
    }
  }

  Future<JobPreferences> savePreferences(JobPreferences preferences) async {
    final body = preferences.toJson();
    try {
      final response = await _apiClient.put('/profile/preferences', body: body);
      final saved = JobPreferences.fromJson(_preferencesMap(response));
      await _database.cachePreferences(saved.toJson());
      return saved;
    } on ApiException catch (error) {
      if (!error.isNotFound && !error.isNetworkError) rethrow;
      await _database.cachePreferences(body);
      if (error.isNetworkError) await _enqueue(body);
      return preferences;
    }
  }

  Map<String, dynamic> _preferencesMap(dynamic response) {
    if (response is Map && response['preferences'] is Map) {
      return Map<String, dynamic>.from(response['preferences'] as Map);
    }
    if (response is Map) return Map<String, dynamic>.from(response);
    return <String, dynamic>{};
  }

  Future<void> _enqueue(Map<String, dynamic> payload) async {
    final now = DateTime.now();
    await _database.enqueueAction(
      OfflineAction(
        idempotencyKey: 'update_preferences-${now.microsecondsSinceEpoch}',
        actionType: 'update_preferences',
        payload: payload,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      ),
    );
  }
}
