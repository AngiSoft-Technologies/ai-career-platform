import 'package:flutter/foundation.dart';

import '../data/document_repository.dart';
import '../domain/document_version.dart';
import '../domain/generated_document.dart';

enum DocumentLoadState { idle, loading, ready, error }

class DocumentController extends ChangeNotifier {
  DocumentController({required DocumentRepository repository})
    : _repository = repository;

  final DocumentRepository _repository;

  DocumentLoadState _state = DocumentLoadState.idle;
  List<GeneratedDocument> _items = const [];
  String? _errorMessage;
  bool _isGenerating = false;

  DocumentLoadState get state => _state;
  List<GeneratedDocument> get items => _items;
  String? get errorMessage => _errorMessage;
  bool get isGenerating => _isGenerating;

  Future<void> load() async {
    _state = DocumentLoadState.loading;
    _errorMessage = null;
    notifyListeners();
    try {
      _items = await _repository.listDocuments();
      _state = DocumentLoadState.ready;
    } catch (error) {
      _errorMessage = error.toString();
      _state = DocumentLoadState.error;
    }
    notifyListeners();
  }

  Future<GeneratedDocument?> generate({
    required String opportunityId,
    String? applicationId,
    required String type,
  }) async {
    _isGenerating = true;
    _errorMessage = null;
    notifyListeners();
    try {
      final document = await _repository.generate(
        opportunityId: opportunityId,
        applicationId: applicationId,
        type: type,
      );
      _items = [document, ..._items.where((item) => item.id != document.id)];
      _isGenerating = false;
      notifyListeners();
      return document;
    } catch (error) {
      _errorMessage = error.toString();
      _isGenerating = false;
      notifyListeners();
      return null;
    }
  }

  Future<GeneratedDocument?> getDocument(String id) =>
      _repository.getDocument(id);

  /// Local-first edit: the cache is updated immediately and the change is
  /// queued as `update_document` while offline.
  Future<GeneratedDocument?> updateDocument(
    String id, {
    String? title,
    String? content,
    String? templateKey,
  }) async {
    try {
      final updated = await _repository.updateDocument(
        id: id,
        title: title,
        content: content,
        templateKey: templateKey,
      );
      _items = [updated, ..._items.where((item) => item.id != updated.id)];
      notifyListeners();
      return updated;
    } catch (error) {
      _errorMessage = error.toString();
      notifyListeners();
      return null;
    }
  }

  Future<List<DocumentVersion>> versions(String id) => _repository.versions(id);

  Future<GeneratedDocument?> restoreVersion(
    String documentId,
    DocumentVersion version,
  ) => _repository.restoreVersion(documentId, version);

  Future<List<int>> exportDocument(
    String id,
    String format, {
    String? template,
  }) => _repository.exportDocument(id: id, format: format, template: template);

  Future<Map<String, dynamic>?> latestAtsReport(String id) =>
      _repository.latestAtsReport(id);

  Future<Map<String, dynamic>> runAtsCheck(String id) =>
      _repository.runAtsCheck(id);
}
