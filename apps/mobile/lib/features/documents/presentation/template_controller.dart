import 'package:flutter/foundation.dart';

import '../data/document_repository.dart';
import '../domain/resume_template.dart';

enum TemplateLoadState { idle, loading, ready, error }

class TemplateController extends ChangeNotifier {
  TemplateController({required DocumentRepository repository})
    : _repository = repository;

  final DocumentRepository _repository;

  TemplateLoadState _state = TemplateLoadState.idle;
  List<ResumeTemplate> _resumeTemplates = const [];
  List<CoverLetterTemplate> _coverLetterTemplates = const [];
  String? _errorMessage;

  TemplateLoadState get state => _state;
  List<ResumeTemplate> get resumeTemplates => _resumeTemplates;
  List<CoverLetterTemplate> get coverLetterTemplates => _coverLetterTemplates;
  String? get errorMessage => _errorMessage;

  /// Resume templates sorted by server sort order, ATS-safe ones first within
  /// each category group.
  List<ResumeTemplate> get atsSafeResumeTemplates =>
      _resumeTemplates.where((t) => t.atsSafe).toList();

  List<ResumeTemplate> get nonAtsSafeResumeTemplates =>
      _resumeTemplates.where((t) => !t.atsSafe).toList();

  Future<void> load() async {
    _state = TemplateLoadState.loading;
    _errorMessage = null;
    notifyListeners();
    try {
      final catalogue = await _repository.listTemplates();
      _resumeTemplates = catalogue.resume;
      _coverLetterTemplates = catalogue.coverLetter;
      _state = TemplateLoadState.ready;
    } catch (error) {
      _errorMessage = error.toString();
      _state = TemplateLoadState.error;
    }
    notifyListeners();
  }
}
