import 'package:flutter/foundation.dart';

import '../data/profile_repository.dart';
import '../domain/candidate_profile.dart';

enum ProfileLoadState { idle, loading, ready, saving, error }

class ProfileController extends ChangeNotifier {
  ProfileController({required ProfileRepository repository})
    : _repository = repository;

  final ProfileRepository _repository;

  ProfileLoadState _state = ProfileLoadState.idle;
  CandidateProfile? _profile;
  String? _errorMessage;

  ProfileLoadState get state => _state;
  CandidateProfile? get profile => _profile;
  String? get errorMessage => _errorMessage;

  Future<void> load() async {
    _state = ProfileLoadState.loading;
    _errorMessage = null;
    notifyListeners();
    try {
      _profile = await _repository.getProfile();
      _state = ProfileLoadState.ready;
    } catch (error) {
      _errorMessage = error.toString();
      _state = ProfileLoadState.error;
    }
    notifyListeners();
  }

  Future<bool> save(Map<String, dynamic> changes) async {
    _state = ProfileLoadState.saving;
    _errorMessage = null;
    notifyListeners();
    try {
      _profile = await _repository.updateProfile(changes);
      _state = ProfileLoadState.ready;
      notifyListeners();
      return true;
    } catch (error) {
      _errorMessage = error.toString();
      _state = ProfileLoadState.error;
      notifyListeners();
      return false;
    }
  }
}
