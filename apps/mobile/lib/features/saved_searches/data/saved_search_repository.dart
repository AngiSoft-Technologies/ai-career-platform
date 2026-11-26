import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/networking/api_client.dart';
import '../../../core/networking/api_exception.dart';
import '../../../core/storage/local_database.dart';
import '../../../core/synchronization/offline_action.dart';
import '../../opportunities/domain/opportunity.dart';
import '../domain/saved_search.dart';
import 'recent_query_store.dart';

/// SQLite access used by the repository. Kept as an interface so controllers
/// and tests can swap in an in-memory store without opening a database.
abstract class SavedSearchLocalStore {
  Future<List<Map<String, dynamic>>> savedSearchRows();
  Future<void> upsertSavedSearch(Map<String, dynamic> item);
  Future<void> replaceSavedSearches(List<Map<String, dynamic>> items);
}

class SavedSearchDatabaseStore implements SavedSearchLocalStore {
  const SavedSearchDatabaseStore(this._database);

  final LocalDatabase _database;

  @override
  Future<List<Map<String, dynamic>>> savedSearchRows() =>
      _database.savedSearchRows();

  @override
  Future<void> upsertSavedSearch(Map<String, dynamic> item) =>
      _database.upsertSavedSearch(item);

  @override
  Future<void> replaceSavedSearches(List<Map<String, dynamic>> items) =>
      _database.cacheSavedSearches(items);
}

/// Test-friendly store with the same semantics as the SQLite table.
class InMemorySavedSearchStore implements SavedSearchLocalStore {
  final Map<String, Map<String, dynamic>> _rows = {};

  @override
  Future<List<Map<String, dynamic>>> savedSearchRows() async {
    final rows = _rows.values.toList()
      ..sort(
        (a, b) => (b['updatedAt'] as int? ?? 0).compareTo(
          a['updatedAt'] as int? ?? 0,
        ),
      );
    return rows.map((row) => Map<String, dynamic>.from(row)).toList();
  }

  @override
  Future<void> upsertSavedSearch(Map<String, dynamic> item) async {
    final id =
        item['id'] as String? ??
        'local-${DateTime.now().microsecondsSinceEpoch}';
    _rows[id] = {
      ...item,
      'id': id,
      'updatedAt': DateTime.now().millisecondsSinceEpoch,
    };
  }

  @override
  Future<void> replaceSavedSearches(List<Map<String, dynamic>> items) async {
    _rows.clear();
    for (final item in items) {
      await upsertSavedSearch(item);
    }
  }
}

/// Alerts live in the `job_alerts` SQLite table on the server-shaped schema.
///
/// TODO(missing core API): LocalDatabase has a `job_alerts` table but no
/// `jobAlertRows()` / `upsertJobAlert()` accessor yet. Until that lands,
/// alert settings are mirrored in SharedPreferences and searched through
/// [JobAlertStore] so this feature does not need a core change.
abstract class JobAlertStore {
  Future<List<JobAlert>> load();
  Future<void> replace(List<JobAlert> alerts);
}

class JobAlertPreferencesStore implements JobAlertStore {
  static const _key = 'job_alerts_v1';

  @override
  Future<List<JobAlert>> load() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_key);
    if (raw == null) return const [];
    final decoded = jsonDecode(raw) as List;
    return decoded
        .whereType<Map>()
        .map((item) => JobAlert.fromJson(Map<String, dynamic>.from(item)))
        .toList();
  }

  @override
  Future<void> replace(List<JobAlert> alerts) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      _key,
      jsonEncode(alerts.map((alert) => alert.toJson()).toList()),
    );
  }
}

class InMemoryJobAlertStore implements JobAlertStore {
  final Map<String, JobAlert> _alerts = {};

  @override
  Future<List<JobAlert>> load() async => _alerts.values.toList(growable: false);

  @override
  Future<void> replace(List<JobAlert> alerts) async {
    _alerts
      ..clear()
      ..addEntries(alerts.map((alert) => MapEntry(alert.searchId, alert)));
  }
}

class SavedSearchRepository {
  SavedSearchRepository({
    ApiClient? apiClient,
    LocalDatabase? database,
    SavedSearchLocalStore? store,
    JobAlertStore? alertStore,
    RecentQueryStore? recentQueryStore,
  }) : _apiClient = apiClient,
       _database = database,
       _store =
           store ??
           (database == null
               ? InMemorySavedSearchStore()
               : SavedSearchDatabaseStore(database)),
       _alertStore = alertStore ?? JobAlertPreferencesStore(),
       _recent = recentQueryStore ?? RecentQueryStore();

  final ApiClient? _apiClient;
  final LocalDatabase? _database;
  final SavedSearchLocalStore _store;
  final JobAlertStore _alertStore;
  final RecentQueryStore _recent;

  /// True when the last list/alert read came from local storage.
  bool servedFromCache = false;

  Future<List<SavedSearch>> list({bool refresh = false}) async {
    if (_apiClient != null && refresh) {
      try {
        final response = await _apiClient.get('/v1/me/saved-searches');
        final items = _searchList(response)
            .map(SavedSearch.fromJson)
            .toList(growable: false);
        await _replaceAll(items);
        servedFromCache = false;
        return items;
      } on ApiException catch (error) {
        if (!error.isNetworkError) rethrow;
      }
    }
    servedFromCache = true;
    final rows = await _store.savedSearchRows();
    return rows.map(SavedSearch.fromJson).toList(growable: false);
  }

  Future<SavedSearch> create(SavedSearch search) async {
    var created = search;
    if (_apiClient != null && !search.isLocal) {
      try {
        final response = await _apiClient.post(
          '/v1/me/saved-searches',
          body: search.toJson(),
        );
        created = SavedSearch.fromJson(_single(response, fallback: search));
      } on ApiException catch (error) {
        if (!error.isNetworkError) rethrow;
        await _enqueue('create_saved_search', search.toJson());
      }
    } else {
      await _enqueue('create_saved_search', search.toJson());
    }
    await _store.upsertSavedSearch(created.toJson());
    if (created.alertsEnabled) await saveAlert(created.toAlert());
    return created;
  }

  Future<SavedSearch> update(SavedSearch search) async {
    var updated = search;
    if (_apiClient != null && !search.isLocal) {
      try {
        final response = await _apiClient.patch(
          '/v1/me/saved-searches/${search.id}',
          body: search.toJson(),
        );
        updated = SavedSearch.fromJson(_single(response, fallback: search));
      } on ApiException catch (error) {
        if (!error.isNetworkError) rethrow;
        await _enqueue('update_saved_search', search.toJson());
      }
    } else {
      await _enqueue('update_saved_search', search.toJson());
    }
    await _store.upsertSavedSearch(updated.toJson());
    await saveAlert(updated.toAlert());
    return updated;
  }

  Future<void> delete(String id) async {
    if (_apiClient != null && !id.startsWith('local-')) {
      try {
        await _apiClient.delete('/v1/me/saved-searches/$id');
      } on ApiException catch (error) {
        if (!error.isNetworkError) rethrow;
        await _enqueue('delete_saved_search', {'id': id});
      }
    } else {
      await _enqueue('delete_saved_search', {'id': id});
    }
    final remaining = (await _store.savedSearchRows())
        .where((row) => row['id'] != id)
        .toList();
    await _store.replaceSavedSearches(remaining);
    final alerts = await _alertStore.load();
    await _alertStore.replace(
      alerts.where((alert) => alert.searchId != id).toList(),
    );
  }

  /// Clears the "new since last seen" badge locally and tells the server.
  Future<SavedSearch> markSeen(String id) async {
    final rows = await _store.savedSearchRows();
    final row = rows.firstWhere(
      (item) => item['id'] == id,
      orElse: () => <String, dynamic>{},
    );
    if (row.isEmpty) {
      return SavedSearch.fromJson({
        'id': id,
        'name': 'Saved search',
        'query': '',
      });
    }
    final seen = SavedSearch.fromJson(row)
        .copyWith(newCount: 0, lastEvaluatedAt: DateTime.now());
    await _store.upsertSavedSearch(seen.toJson());
    if (_apiClient != null && !seen.isLocal) {
      try {
        await _apiClient.post(
          '/v1/me/saved-searches/$id/seen',
          body: {'seenAt': DateTime.now().toUtc().toIso8601String()},
        );
      } on ApiException catch (error) {
        if (!error.isNetworkError) rethrow;
        await _enqueue('mark_search_seen', {'id': id});
      }
    } else {
      await _enqueue('mark_search_seen', {'id': id});
    }
    return seen;
  }

  Future<List<JobAlert>> alerts() => _alertStore.load();

  Future<JobAlert> saveAlert(JobAlert alert) async {
    final alerts = await _alertStore.load();
    final next = [
      alert,
      ...alerts.where((item) => item.searchId != alert.searchId),
    ];
    await _alertStore.replace(next);
    if (_apiClient != null && !alert.id.startsWith('local-')) {
      try {
        await _apiClient.put(
          '/v1/me/job-alerts/${alert.id}',
          body: alert.toJson(),
        );
      } on ApiException catch (error) {
        if (!error.isNetworkError) rethrow;
        await _enqueue('update_saved_search', alert.toJson());
      }
    } else {
      await _enqueue('update_saved_search', alert.toJson());
    }
    return alert;
  }

  Future<List<String>> recentQueries() => _recent.recent();

  Future<void> addRecentQuery(String query) => _recent.add(query);

  OpportunitySearch toSearch(SavedSearch search) => OpportunitySearch(
    query: search.query,
    country: search.country,
    workMode: search.workMode,
    seniority: search.seniority,
    employmentType: search.employmentType,
    eligibility: search.eligibility,
  );

  Future<void> _replaceAll(Iterable<SavedSearch> items) =>
      _store.replaceSavedSearches(items.map((item) => item.toJson()).toList());

  List<Map<String, dynamic>> _searchList(dynamic response) {
    final dynamic raw = response is Map
        ? (response['savedSearches'] ?? response['items'])
        : response;
    if (raw is! List) return const [];
    return raw
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
  }

  Map<String, dynamic> _single(
    dynamic response, {
    required SavedSearch fallback,
  }) {
    if (response is Map && response['savedSearch'] is Map) {
      return Map<String, dynamic>.from(response['savedSearch'] as Map);
    }
    if (response is Map) return Map<String, dynamic>.from(response);
    return fallback.toJson();
  }

  Future<void> _enqueue(String actionType, Map<String, dynamic> payload) async {
    final now = DateTime.now();
    final searchId = payload['id'] ?? payload['searchId'];
    await _enqueueAction(
      OfflineAction(
        idempotencyKey: '$actionType-${now.microsecondsSinceEpoch}',
        actionType: actionType,
        payload: payload,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
        entityType: 'saved_search',
        entityId: searchId?.toString(),
      ),
    );
  }

  /// Offline writes always go through LocalDatabase.enqueueAction in the app.
  /// With no database (pure unit tests) they are recorded in memory instead.
  Future<void> _enqueueAction(OfflineAction action) async {
    if (_database != null) {
      await _database.enqueueAction(action);
      return;
    }
    _queuedActions.add(action);
  }

  final List<OfflineAction> _queuedActions = <OfflineAction>[];
  List<OfflineAction> get queuedActions => List.unmodifiable(_queuedActions);
}
