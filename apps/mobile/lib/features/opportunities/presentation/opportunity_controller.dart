import 'package:flutter/foundation.dart';

import '../data/opportunity_repository.dart';
import '../domain/opportunity.dart';

enum OpportunityLoadState { idle, loading, ready, error }

enum OpportunitySort { relevance, newest, salary }

extension OpportunitySortLabel on OpportunitySort {
  String get label => switch (this) {
    OpportunitySort.relevance => 'Best match',
    OpportunitySort.newest => 'Newest first',
    OpportunitySort.salary => 'Highest salary',
  };
}

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
  Set<String> _seenIds = {};
  Set<String> _appliedIds = {};
  List<String> _recent = const [];
  OpportunitySort _sort = OpportunitySort.relevance;

  OpportunityLoadState get state => _state;

  /// Deduped and sorted view of the feed. Boards repeat the same posting with
  /// different URLs, so identity is a canonical key, not the raw id.
  List<Opportunity> get items {
    final sorted = List<Opportunity>.from(_items);
    switch (_sort) {
      case OpportunitySort.relevance:
        break;
      case OpportunitySort.newest:
        sorted.sort(
          (a, b) => (b.postedAt?.millisecondsSinceEpoch ?? 0).compareTo(
            a.postedAt?.millisecondsSinceEpoch ?? 0,
          ),
        );
      case OpportunitySort.salary:
        sorted.sort(
          (a, b) => (b.salaryMax ?? b.salaryMin ?? 0).compareTo(
            a.salaryMax ?? a.salaryMin ?? 0,
          ),
        );
    }
    return sorted;
  }

  Set<String> get savedIds => _savedIds;
  Set<String> get seenIds => _seenIds;
  Set<String> get appliedIds => _appliedIds;
  List<String> get recent => _recent;
  OpportunitySort get sort => _sort;
  DateTime? get servedCachedAt => _repository.servedCachedAt;
  OpportunitySearch get search => _search;
  String? get errorMessage => _errorMessage;
  bool get showSavedOnly => _showSavedOnly;
  int get unseenCount =>
      _items.where((item) => !_seenIds.contains(item.id)).length;

  void setSort(OpportunitySort value) {
    _sort = value;
    notifyListeners();
  }

  bool get hasActiveFilters =>
      _search.country != null ||
      _search.workMode != null ||
      _search.seniority != null ||
      _search.employmentType != null ||
      _search.eligibility != null ||
      _search.semantic ||
      _showSavedOnly;
  String get query => _search.query ?? '';
  void setQuery(String value) {
    _search = OpportunitySearch(
      query: value,
      country: _search.country,
      workMode: _search.workMode,
      seniority: _search.seniority,
      employmentType: _search.employmentType,
      eligibility: _search.eligibility,
      semantic: _search.semantic,
    );
  }

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
      _items = _dedupe(_items);
      _savedIds = await _repository.savedIds();
      _seenIds = await _repository.seenIds();
      _appliedIds = await _repository.appliedIds();
      _recent = await _repository.recentQueries();
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
    String? employmentType,
    String? eligibility,
    bool? semantic,
  }) async {
    _search = OpportunitySearch(
      query: query ?? _search.query,
      country: country ?? _search.country,
      workMode: workMode ?? _search.workMode,
      seniority: seniority ?? _search.seniority,
      employmentType: employmentType ?? _search.employmentType,
      eligibility: eligibility ?? _search.eligibility,
      semantic: semantic ?? _search.semantic,
    );
    await load();
  }

  /// Keeps only the roles a candidate can hold. The switch is on the
  /// filter sheet because the default answer is no: three quarters of
  /// the catalogue is posted elsewhere, with a residency rule on it.
  Future<void> toggleEligibility() => searchNow(
    eligibility: _search.eligibility == 'eligible' ? null : 'eligible',
  );

  Future<void> toggleSaved(Opportunity opportunity) async {
    final willSave = !_savedIds.contains(opportunity.id);
    await _repository.setSaved(opportunity, willSave);
    _savedIds = await _repository.savedIds();
    if (willSave) await _repository.addRecentQuery(opportunity.title);
    _recent = await _repository.recentQueries();
    notifyListeners();
  }

  /// Called when the candidate opens a role; drives the unseen dot and also
  /// becomes a recent-query chip for the next search.
  Future<void> markSeen(Opportunity opportunity) async {
    await _repository.markSeen(opportunity.id);
    _seenIds = await _repository.seenIds();
    notifyListeners();
  }

  Future<void> rememberQuery(String query) async {
    await _repository.addRecentQuery(query);
    _recent = await _repository.recentQueries();
    notifyListeners();
  }

  Future<void> applyQuickFilter({
    String? query,
    String? country,
    String? workMode,
    String? seniority,
    String? eligibility,
  }) => searchNow(
    query: query ?? _search.query,
    country: country,
    workMode: workMode,
    seniority: seniority,
    eligibility: eligibility,
  );

  List<Opportunity> _dedupe(List<Opportunity> items) {
    final keys = <String>{};
    return items.where((item) => keys.add(item.canonicalKey)).toList();
  }

  Future<Opportunity> getOpportunity(String id) => _repository.getById(id);
}
