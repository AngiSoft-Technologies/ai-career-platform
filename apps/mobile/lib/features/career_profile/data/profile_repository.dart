import '../../../core/networking/api_client.dart';
import '../../../core/networking/api_exception.dart';
import '../../../core/storage/local_database.dart';
import '../../../core/synchronization/offline_action.dart';
import '../domain/candidate_profile.dart';

class ProfileRepository {
  ProfileRepository({
    required ApiClient apiClient,
    required LocalDatabase database,
  }) : _apiClient = apiClient,
       _database = database;

  final ApiClient _apiClient;
  final LocalDatabase _database;

  Future<CandidateProfile> getProfile() async {
    try {
      final response = await _apiClient.get('/profile');
      final profile = CandidateProfile.fromJson(_profileMap(response));
      await _database.cacheProfile(profile.toJson());
      return profile;
    } on ApiException catch (error) {
      if (!error.isNetworkError) rethrow;
      final cached = await _database.cachedProfile();
      if (cached == null) rethrow;
      return CandidateProfile.fromJson(cached);
    }
  }

  Future<CandidateProfile> updateProfile(Map<String, dynamic> changes) async {
    try {
      dynamic response;
      try {
        response = await _apiClient.patch('/profile', body: changes);
      } on ApiException catch (error) {
        if (!error.isNotFound) rethrow;
        response = await _apiClient.put('/profile', body: changes);
      }
      final profile = CandidateProfile.fromJson(_profileMap(response));
      await _database.cacheProfile(profile.toJson());
      return profile;
    } on ApiException catch (error) {
      if (!error.isNetworkError) rethrow;
      final cached = await _database.cachedProfile() ?? <String, dynamic>{};
      final updated = Map<String, dynamic>.from(cached)..addAll(changes);
      updated['version'] = (updated['version'] as int? ?? 1) + 1;
      final profile = CandidateProfile.fromJson(updated);
      await _database.cacheProfile(profile.toJson());
      await _enqueue('update_profile', changes);
      return profile;
    }
  }

  Map<String, dynamic> _profileMap(dynamic response) {
    if (response is Map && response['profile'] is Map) {
      return Map<String, dynamic>.from(response['profile'] as Map);
    }
    if (response is Map) return Map<String, dynamic>.from(response);
    return <String, dynamic>{};
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
