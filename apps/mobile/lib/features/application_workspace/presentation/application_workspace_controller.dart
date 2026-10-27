import 'package:flutter/foundation.dart';

import '../data/application_workspace_repository.dart';
import '../domain/application_workspace.dart';
import '../domain/application_analysis.dart';

enum WorkspaceLoadState { idle, loading, ready, error }

class ApplicationWorkspaceController extends ChangeNotifier {
  ApplicationWorkspaceController({
    required ApplicationWorkspaceRepository repository,
  }) : _repository = repository;

  final ApplicationWorkspaceRepository _repository;

  WorkspaceLoadState _state = WorkspaceLoadState.idle;
  ApplicationWorkspace? _workspace;
  String? _errorMessage;

  WorkspaceLoadState get state => _state;
  ApplicationWorkspace? get workspace => _workspace;
  String? get errorMessage => _errorMessage;

  Future<void> load(String applicationId) async {
    _state = WorkspaceLoadState.loading;
    _errorMessage = null;
    notifyListeners();
    try {
      _workspace = await _repository.getWorkspace(applicationId);
      _state = WorkspaceLoadState.ready;
    } catch (error) {
      _errorMessage = error.toString();
      _state = WorkspaceLoadState.error;
    }
    notifyListeners();
  }

  Future<ApplicationWorkspace> getWorkspace(String applicationId) =>
      _repository.getWorkspace(applicationId);

  Future<ApplicationAnalysis> analyzeApplication(String applicationId) =>
      _repository.analyzeApplication(applicationId);
}
