import '../networking/api_client.dart';
import '../networking/api_exception.dart';
import '../storage/local_database.dart';
import 'offline_action.dart';

class SyncRunResult {
  const SyncRunResult({
    required this.completed,
    required this.failed,
    required this.pending,
  });

  final int completed;
  final int failed;
  final int pending;
}

class SyncEngine {
  SyncEngine({required ApiClient apiClient, required LocalDatabase database})
    : _apiClient = apiClient,
      _database = database;

  final ApiClient _apiClient;
  final LocalDatabase _database;

  Future<SyncRunResult> syncNow() async {
    final actions = await _database.pendingActions();
    var completed = 0;
    var failed = 0;
    for (final action in actions) {
      try {
        await _execute(action);
        await _database.updateAction(
          action.idempotencyKey,
          status: 'completed',
        );
        completed++;
      } on ApiException catch (error) {
        if (error.isNetworkError) {
          await _database.updateAction(
            action.idempotencyKey,
            status: 'pending',
            error: error.message,
          );
        } else {
          await _database.updateAction(
            action.idempotencyKey,
            status: 'failed',
            error: error.message,
          );
          failed++;
        }
      } catch (error) {
        await _database.updateAction(
          action.idempotencyKey,
          status: 'failed',
          error: error.toString(),
        );
        failed++;
      }
    }
    final pending = await _database.actionCount(status: 'pending');
    return SyncRunResult(
      completed: completed,
      failed: failed,
      pending: pending,
    );
  }

  Future<void> _execute(OfflineAction action) async {
    switch (action.actionType) {
      case 'create_application':
        await _apiClient.post('/applications', body: action.payload);
      case 'update_application_status':
        try {
          await _apiClient.patch(
            '/applications/${action.payload['id']}',
            body: action.payload['body'],
          );
        } on ApiException catch (error) {
          if (!error.isNotFound) rethrow;
          await _apiClient.patch(
            '/applications/${action.payload['id']}/status',
            body: action.payload['body'],
          );
        }
      case 'update_profile':
        try {
          await _apiClient.patch('/profile', body: action.payload);
        } on ApiException catch (error) {
          if (!error.isNotFound) rethrow;
          await _apiClient.put('/profile', body: action.payload);
        }
      case 'update_preferences':
        await _apiClient.put('/profile/preferences', body: action.payload);
      case 'schedule_followup':
        await _apiClient.post(
          '/applications/${action.payload['applicationId']}/followups',
          body: action.payload['body'],
        );
      case 'update_followup':
        await _apiClient.patch('/followups', body: action.payload);
      case 'generate_document':
        try {
          await _apiClient.post('/documents', body: action.payload);
        } on ApiException catch (error) {
          if (!error.isNotFound) rethrow;
          await _apiClient.post('/documents/generate', body: action.payload);
        }
      default:
        throw ApiException(
          statusCode: 400,
          message: 'Unknown offline action ${action.actionType}',
        );
    }
  }
}
