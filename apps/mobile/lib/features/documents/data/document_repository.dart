import 'dart:convert';
import 'dart:typed_data';

import 'package:http/http.dart' as http;

import '../../../core/networking/api_client.dart';
import '../../../core/networking/api_exception.dart';
import '../../../core/storage/local_database.dart';
import '../../../core/synchronization/offline_action.dart';
import '../domain/generated_document.dart';
import '../domain/resume_template.dart';

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

  /// Fetch the server template catalogue (resume + cover letter templates).
  Future<TemplateCatalogue> listTemplates() async {
    final response = await _apiClient.get('/documents/templates');
    return TemplateCatalogue.fromJson(Map<String, dynamic>.from(response));
  }

  /// Generate a document with the AI tailoring agent using a chosen template.
  Future<GeneratedDocument> generateWithAi({
    required String opportunityId,
    String? applicationId,
    required String type,
    String? templateKey,
    String? userGuidance,
  }) async {
    final body = <String, dynamic>{
      'opportunityId': opportunityId,
      if (applicationId != null) 'applicationId': applicationId,
      'type': type,
      if (templateKey != null) 'templateKey': templateKey,
      if (userGuidance != null) 'userGuidance': userGuidance,
    };
    try {
      final response = await _apiClient.post('/documents/generate', body: body);
      final document = _aiDocumentMap(response);
      return GeneratedDocument(
        id: document['id'] as String? ?? '',
        applicationId: document['applicationId'] as String?,
        opportunityId: opportunityId,
        type: type,
        title: document['title'] as String? ?? 'Generated document',
        content: document['content'] as String? ?? '',
      );
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
      final response = await _apiClient.post('/documents/generate', body: body);
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

  /// Save edits to an existing document (title / content / template).
  Future<GeneratedDocument> updateDocument({
    required String id,
    String? title,
    String? content,
    String? templateKey,
  }) async {
    final body = <String, dynamic>{};
    if (title != null) body['title'] = title;
    if (content != null) body['content'] = content;
    if (templateKey != null) body['template'] = templateKey;
    final response = await _apiClient.patch('/documents/$id', body: body);
    return GeneratedDocument.fromJson(Map<String, dynamic>.from(response));
  }

  /// Export a document to PDF / DOCX / PPTX / PNG. Returns the raw bytes.
  ///
  /// [template] is the catalogue key to render with. Leave it null to use the
  /// document's saved template, which is what the editor already picked.
  Future<List<int>> exportDocument({
    required String id,
    required String format,
    String? template,
  }) async {
    final response = await _apiClient.post(
      '/documents/$id/export',
      body: {'format': format, if (template != null) 'template': template},
    );
    if (response is Map && response['data'] is String) {
      return base64Decode(response['data'] as String);
    }
    if (response is List) {
      return response.cast<int>().toList();
    }
    throw const ApiException(
      statusCode: 500,
      message: 'The export could not be read from the service.',
    );
  }

  /// Validate a document against ATS rules, optionally using a job's keywords.
  Future<Map<String, dynamic>> validateDocument({
    required String content,
    String? opportunityId,
    String? documentId,
    List<String> keywords = const [],
  }) async {
    final body = <String, dynamic>{
      'content': content,
      if (opportunityId != null) 'opportunityId': opportunityId,
      if (documentId != null) 'documentId': documentId,
      if (keywords.isNotEmpty) 'keywords': keywords,
    };
    final response = await _apiClient.post('/documents/validate', body: body);
    return Map<String, dynamic>.from(response);
  }

  Future<GeneratedDocument?> getDocument(String id) async {
    try {
      final response = await _apiClient.get('/documents/$id');
      final document = GeneratedDocument.fromJson(_documentMap(response));
      await _database.cacheDocument(document.toJson());
      return document;
    } on ApiException catch (error) {
      if (!error.isNetworkError) rethrow;
      final cached = await _database.cachedDocument(id);
      return cached == null ? null : GeneratedDocument.fromJson(cached);
    }
  }

  Map<String, dynamic> _documentMap(dynamic response) {
    if (response is Map && response['document'] is Map) {
      return Map<String, dynamic>.from(response['document'] as Map);
    }
    if (response is Map) return Map<String, dynamic>.from(response);
    return <String, dynamic>{};
  }

  Map<String, dynamic> _aiDocumentMap(dynamic response) {
    if (response is Map && response['document'] is Map) {
      return Map<String, dynamic>.from(response['document'] as Map);
    }
    if (response is Map) return Map<String, dynamic>.from(response);
    return <String, dynamic>{};
  }

  // ---------------------------------------------------------------------------
  // Resume onboarding — upload / LinkedIn / manual, then matching preferences.
  // ---------------------------------------------------------------------------

  /// True once the candidate has been through the resume-onboarding flow.
  Future<bool> resumeOnboardingComplete() async {
    final response = await _apiClient.get('/profile/onboarding');
    final map = Map<String, dynamic>.from(response as Map);
    return map['completed'] as bool? ?? false;
  }

  Future<void> completeResumeOnboarding({String? path}) async {
    await _apiClient.post(
      '/profile/onboarding-complete',
      body: <String, dynamic>{if (path != null) 'path': path},
    );
  }

  /// Saves the manually built resume. The API owns the schema, so the client
  /// only sends a loosely typed map.
  Future<GeneratedDocument> saveManualResume(
    Map<String, dynamic> resume,
  ) async {
    final response = await _apiClient.post('/profile/resume', body: resume);
    return GeneratedDocument.fromJson(_documentMap(response));
  }

  /// Uploads a picked file straight to its signed slot, then asks the resume
  /// builder agent to extract and structure it.
  Future<GeneratedDocument> importResumeFile({
    required String filename,
    required String contentType,
    required Uint8List bytes,
  }) async {
    final target = await _apiClient.post(
      '/documents/upload-url',
      body: <String, dynamic>{'filename': filename, 'contentType': contentType},
    );
    final upload = Map<String, dynamic>.from(target['target'] as Map);
    final uploadResponse = await http.put(
      Uri.parse(upload['url'] as String),
      headers: {'Content-Type': contentType},
      body: bytes,
    );
    if (uploadResponse.statusCode >= 400) {
      throw ApiException(
        statusCode: uploadResponse.statusCode,
        message: 'The file could not be uploaded. Try another one.',
      );
    }

    final response = await _apiClient.post(
      '/documents/import',
      body: <String, dynamic>{
        'storageKey': upload['key'] as String,
        'filename': filename,
        'contentType': contentType,
      },
    );
    return GeneratedDocument.fromJson(_documentMap(response));
  }

  /// Imports a public profile URL. Used when LinkedIn OAuth is unavailable.
  Future<GeneratedDocument> importLinkedInProfile(String profileUrl) async {
    final response = await _apiClient.post(
      '/auth/linkedin/import',
      body: <String, dynamic>{'profileUrl': profileUrl},
    );
    return GeneratedDocument.fromJson(_documentMap(response));
  }

  /// Reads the latest ATS verdict the verifier agent stored for a document.
  Future<Map<String, dynamic>?> latestAtsReport(String documentId) async {
    final response = await _apiClient.get('/documents/$documentId/ats');
    final map = Map<String, dynamic>.from(response as Map);
    final report = map['report'];
    if (report is Map) return Map<String, dynamic>.from(report);
    return null;
  }

  /// Re-runs the verifier on demand — the system also runs it automatically.
  Future<Map<String, dynamic>> runAtsCheck(String documentId) async {
    final response = await _apiClient.post('/documents/$documentId/ats/run');
    final map = Map<String, dynamic>.from(response as Map);
    final report = map['report'];
    if (report is Map) return Map<String, dynamic>.from(report);
    return map;
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
