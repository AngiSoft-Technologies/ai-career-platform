import 'package:flutter/foundation.dart';

import '../data/saved_search_repository.dart';
import '../domain/saved_search.dart';

enum SavedSearchLoadState { idle, loading, ready, error }

class SavedSearchController extends ChangeNotifier {
  SavedSearchController({required this.repository});

  final SavedSearchRepository repository;

  SavedSearchLoadState _state = SavedSearchLoadState.idle;
  List<SavedSearch> _items = const [];
  List<JobAlert> _alerts = const [];
  List<String> _recent = const [];
  String? _errorMessage;

  SavedSearchLoadState get state => _state;
  List<SavedSearch> get items => _items;
  List<JobAlert> get alerts => _alerts;
  List<String> get recent => _recent;
  String? get errorMessage => _errorMessage;
  bool get servedFromCache => repository.servedFromCache;

  JobAlert? alertFor(String searchId) {
    for (final alert in _alerts) {
      if (alert.searchId == searchId) return alert;
    }
    return null;
  }

  Future<void> load({bool refresh = false}) async {
    _state = SavedSearchLoadState.loading;
    _errorMessage = null;
    notifyListeners();
    try {
      _items = await repository.list(refresh: refresh);
      _alerts = await repository.alerts();
      _recent = await repository.recentQueries();
      _state = SavedSearchLoadState.ready;
    } catch (error) {
      _errorMessage = error.toString();
      _state = SavedSearchLoadState.error;
    }
    notifyListeners();
  }

  Future<bool> create({
    required String name,
    required String query,
    String? country,
    String? workMode,
    String? seniority,
    String? employmentType,
    String? eligibility,
    bool alertsEnabled = true,
    AlertCadence cadence = AlertCadence.daily,
    AlertChannels channels = const AlertChannels(),
    AlertQuietHours quietHours = const AlertQuietHours(),
  }) async {
    final now = DateTime.now();
    final search = SavedSearch(
      id: 'local-${now.microsecondsSinceEpoch}',
      name: name.trim().isEmpty ? 'Saved search' : name.trim(),
      query: query.trim(),
      country: country,
      workMode: workMode,
      seniority: seniority,
      employmentType: employmentType,
      eligibility: eligibility,
      alertsEnabled: alertsEnabled,
      cadence: cadence,
      channels: channels,
      quietHours: quietHours,
      updatedAt: now,
    );
    return _commit(() async {
      final created = await repository.create(search);
      await repository.addRecentQuery(created.query);
      await _reloadLocal();
      return true;
    });
  }

  Future<bool> update(SavedSearch search) async {
    return _commit(() async {
      await repository.update(search);
      await repository.addRecentQuery(search.query);
      await _reloadLocal();
      return true;
    });
  }

  Future<bool> delete(String id) async {
    return _commit(() async {
      await repository.delete(id);
      await _reloadLocal();
      return true;
    });
  }

  Future<bool> toggleAlerts(SavedSearch search) async {
    return update(search.copyWith(alertsEnabled: !search.alertsEnabled));
  }

  Future<bool> saveAlert(JobAlert alert) async {
    return _commit(() async {
      await repository.saveAlert(alert);
      await _reloadLocal();
      return true;
    });
  }

  Future<bool> markSeen(String id) async {
    return _commit(() async {
      await repository.markSeen(id);
      await _reloadLocal();
      return true;
    });
  }

  Future<void> addRecent(String query) async {
    await repository.addRecentQuery(query);
    _recent = await repository.recentQueries();
    notifyListeners();
  }

  Future<bool> _commit(Future<bool> Function() action) async {
    try {
      final result = await action();
      _errorMessage = null;
      notifyListeners();
      return result;
    } catch (error) {
      _errorMessage = error.toString();
      notifyListeners();
      return false;
    }
  }

  Future<void> _reloadLocal() async {
    _items = await repository.list();
    _alerts = await repository.alerts();
    _recent = await repository.recentQueries();
  }
}
