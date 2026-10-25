import '../../../core/networking/api_client.dart';
import '../../../core/networking/api_exception.dart';
import '../../../core/storage/local_database.dart';
import '../../../core/synchronization/offline_action.dart';
import '../domain/generated_document.dart';

class DocumentRepository {
  DocumentRepository({
    required ApiClient apiClient,
    required LocalDatabase database,
  }) : _apiClient = apiClient,
       _database = database;

  final ApiClient _apiClient;
  final LocalDatabase _database;

  Future<List<GeneratedDocument>> listDocuments({String? opportunityId}) async {
    try {
      final response = await _apiClient.get(
        '/documents',
        query: opportunityId == null ? null : {'opportunityId': opportunityId},
      );
      final documents = _documentList(response)
          .map(GeneratedDocument.fromJson)
          .toList();
      await Future.wait(
        documents.map((item) => _database.cacheDocument(item.toJson())),
      );
      return documents;
    } on ApiException catch (error) {
      if (!error.isNetworkError) rethrow;
      final cached = await _database.cachedDocuments();
      return cached
          .map(GeneratedDocument.fromJson)
          .where(
            (document) =>
                opportunityId == null ||
                document.opportunityId == opportunityId,
          )
          .toList();
    }
  }

  Future<GeneratedDocument> generate({
    required String opportunityId,
    String? applicationId,
    required String type,
  }) async {
    final body = <String, dynamic>{
      'opportunityId': opportunityId,
      'applicationId': ?applicationId,
      'type': type,
    };
    try {
      dynamic response;
      try {
        response = await _apiClient.post('/documents', body: body);
      } on ApiException catch (error) {
        if (!error.isNotFound) rethrow;
        response = await _apiClient.post('/documents/generate', body: body);
      }
      final document = GeneratedDocument.fromJson(_documentMap(response));
      await _database.cacheDocument(document.toJson());
      return document;
    } on ApiException catch (error) {
      if (!error.isNetworkError) rethrow;
      await _enqueue(body);
      throw const ApiException(
        statusCode: 0,
        message:
            'Document generation is queued and will run when you reconnect',
      );
    }
  }

  Future<GeneratedDocument?> getDocument(String id) async {
    final cached = await _database.cachedDocument(id);
    return cached == null ? null : GeneratedDocument.fromJson(cached);
  }

  Map<String, dynamic> _documentMap(dynamic response) {
    if (response is Map && response['document'] is Map) {
      return Map<String, dynamic>.from(response['document'] as Map);
    }
    if (response is Map) return Map<String, dynamic>.from(response);
    return <String, dynamic>{};
  }

  List<Map<String, dynamic>> _documentList(dynamic response) {
    if (response is Map && response['documents'] is List) {
      return (response['documents'] as List)
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

  Future<void> _enqueue(Map<String, dynamic> payload) async {
    final now = DateTime.now();
    await _database.enqueueAction(
      OfflineAction(
        idempotencyKey: 'generate_document-${now.microsecondsSinceEpoch}',
        actionType: 'generate_document',
        payload: payload,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      ),
    );
  }
}
