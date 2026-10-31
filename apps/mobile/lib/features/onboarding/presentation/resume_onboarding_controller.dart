import 'package:flutter/foundation.dart';

import '../../documents/data/document_repository.dart';
import '../../documents/domain/generated_document.dart';

/// Drives the three resume-onboarding paths.
///
/// Each path ends the same way: mark onboarding complete, then hand the caller
/// the new document id so the router can move on to matching preferences and
/// the template gallery.
class ResumeOnboardingController extends ChangeNotifier {
  ResumeOnboardingController({required DocumentRepository repository})
    : _repository = repository;

  final DocumentRepository _repository;

  bool _isWorking = false;
  String? _errorMessage;
  GeneratedDocument? _document;

  bool get isWorking => _isWorking;
  String? get errorMessage => _errorMessage;
  GeneratedDocument? get document => _document;

  void _begin() {
    _isWorking = true;
    _errorMessage = null;
    notifyListeners();
  }

  void _fail(Object error) {
    _isWorking = false;
    _errorMessage = error.toString().replaceFirst('Exception: ', '');
    notifyListeners();
  }

  void _succeed(GeneratedDocument document) {
    _isWorking = false;
    _document = document;
    notifyListeners();
  }

  /// Uploads the file, then runs the resume builder agent over it.
  Future<bool> importFile({
    required String filename,
    required String contentType,
    required Uint8List bytes,
  }) async {
    _begin();
    try {
      final document = await _repository.importResumeFile(
        filename: filename,
        contentType: contentType,
        bytes: bytes,
      );
      await _repository.completeResumeOnboarding(path: 'upload');
      _succeed(document);
      return true;
    } catch (error) {
      _fail(error);
      return false;
    }
  }

  /// Imports a public profile URL.
  Future<bool> importProfile(String profileUrl) async {
    _begin();
    try {
      final document = await _repository.importLinkedInProfile(profileUrl);
      await _repository.completeResumeOnboarding(path: 'linkedin');
      _succeed(document);
      return true;
    } catch (error) {
      _fail(error);
      return false;
    }
  }

  /// Saves the manual form; the API owns the rest of the resume.
  Future<bool> saveManual(Map<String, dynamic> resume) async {
    _begin();
    try {
      final document = await _repository.saveManualResume(resume);
      await _repository.completeResumeOnboarding(path: 'manual');
      _succeed(document);
      return true;
    } catch (error) {
      _fail(error);
      return false;
    }
  }

  void clear() {
    _isWorking = false;
    _errorMessage = null;
    _document = null;
    notifyListeners();
  }
}
