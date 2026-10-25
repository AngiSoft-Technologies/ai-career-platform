import 'package:flutter/foundation.dart';

import '../data/preferences_repository.dart';
import '../domain/job_preferences.dart';

enum PreferencesLoadState { idle, loading, ready, saving, error }

class PreferencesController extends ChangeNotifier {
  PreferencesController({required PreferencesRepository repository})
    : _repository = repository;

  final PreferencesRepository _repository;

  PreferencesLoadState _state = PreferencesLoadState.idle;
  JobPreferences _preferences = const JobPreferences();
  String? _errorMessage;

  PreferencesLoadState get state => _state;
  JobPreferences get preferences => _preferences;
  String? get errorMessage => _errorMessage;

  Future<void> load() async {
    _state = PreferencesLoadState.loading;
    _errorMessage = null;
    notifyListeners();
    try {
      _preferences = await _repository.getPreferences();
      _state = PreferencesLoadState.ready;
    } catch (error) {
      _errorMessage = error.toString();
      _state = PreferencesLoadState.error;
    }
    notifyListeners();
  }

  Future<bool> save(JobPreferences preferences) async {
    _state = PreferencesLoadState.saving;
    _errorMessage = null;
    notifyListeners();
    try {
      _preferences = await _repository.savePreferences(preferences);
      _state = PreferencesLoadState.ready;
      notifyListeners();
      return true;
    } catch (error) {
      _errorMessage = error.toString();
      _state = PreferencesLoadState.error;
      notifyListeners();
      return false;
    }
  }
}
