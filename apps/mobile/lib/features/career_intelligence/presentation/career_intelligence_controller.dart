import 'package:flutter/foundation.dart';

import '../data/career_intelligence_repository.dart';
import '../domain/career_intelligence.dart';

enum CareerInsightState { idle, loading, ready, error }

class CareerIntelligenceController extends ChangeNotifier {
  CareerIntelligenceController({
    required CareerIntelligenceRepository repository,
  }) : _repository = repository;

  final CareerIntelligenceRepository _repository;

  CareerInsightState _state = CareerInsightState.idle;
  CareerIntelligence? _insights;
  String? _errorMessage;

  CareerInsightState get state => _state;
  CareerIntelligence? get insights => _insights;
  String? get errorMessage => _errorMessage;

  Future<void> load() async {
    _state = CareerInsightState.loading;
    _errorMessage = null;
    notifyListeners();
    try {
      _insights = await _repository.getAnalysis();
      _state = CareerInsightState.ready;
    } catch (error) {
      _errorMessage = error.toString();
      _state = CareerInsightState.error;
    }
    notifyListeners();
  }
}
