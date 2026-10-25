import 'package:flutter/foundation.dart';

import '../data/opportunity_repository.dart';
import '../domain/opportunity.dart';

enum OpportunityLoadState { idle, loading, ready, error }

class OpportunityController extends ChangeNotifier {
  OpportunityController({required OpportunityRepository repository})
    : _repository = repository;

  final OpportunityRepository _repository;

  OpportunityLoadState _state = OpportunityLoadState.idle;
  List<Opportunity> _items = const [];
  Set<String> _savedIds = {};
  OpportunitySearch _search = const OpportunitySearch();
  String? _errorMessage;
  bool _showSavedOnly = false;

  OpportunityLoadState get state => _state;
  List<Opportunity> get items => _items;
  Set<String> get savedIds => _savedIds;
  OpportunitySearch get search => _search;
  String? get errorMessage => _errorMessage;
  bool get showSavedOnly => _showSavedOnly;

  Future<void> load({bool showSavedOnly = false}) async {
    _showSavedOnly = showSavedOnly;
    _state = OpportunityLoadState.loading;
    _errorMessage = null;
    notifyListeners();
    try {
      if (showSavedOnly) {
        _items = await _repository.savedOpportunities();
      } else {
        _items = await _repository.search(_search);
      }
      _savedIds = await _repository.savedIds();
      _state = OpportunityLoadState.ready;
    } catch (error) {
      _errorMessage = error.toString();
      _state = OpportunityLoadState.error;
    }
    notifyListeners();
  }

  Future<void> refresh() => load(showSavedOnly: _showSavedOnly);

  Future<void> searchNow({
    String? query,
    String? country,
    String? workMode,
    String? seniority,
    bool? semantic,
  }) async {
    _search = OpportunitySearch(
      query: query ?? _search.query,
      country: country ?? _search.country,
      workMode: workMode ?? _search.workMode,
      seniority: seniority ?? _search.seniority,
      semantic: semantic ?? _search.semantic,
    );
    await load();
  }

  Future<void> toggleSaved(Opportunity opportunity) async {
    final willSave = !_savedIds.contains(opportunity.id);
    await _repository.setSaved(opportunity, willSave);
    _savedIds = await _repository.savedIds();
    notifyListeners();
  }

  Future<Opportunity> getOpportunity(String id) => _repository.getById(id);
}
