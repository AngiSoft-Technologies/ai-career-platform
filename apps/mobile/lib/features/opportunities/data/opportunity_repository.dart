import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/networking/api_client.dart';
import '../../../core/networking/api_exception.dart';
import '../../../core/storage/local_database.dart';
import '../../saved_searches/data/recent_query_store.dart';
import '../domain/opportunity.dart';

class OpportunityRepository {
  OpportunityRepository({
    required ApiClient apiClient,
    required LocalDatabase database,
    RecentQueryStore? recentQueryStore,
  }) : _apiClient = apiClient,
       _database = database,
       _recent = recentQueryStore ?? RecentQueryStore();

  final ApiClient _apiClient;
  final LocalDatabase _database;
  final RecentQueryStore _recent;

  static const _seenKey = 'seen_opportunities_v1';

  /// Set whenever a read came from local storage instead of the API, so the
  /// feed can label a stale result rather than passing it off as live.
  DateTime? servedCachedAt;

  Future<List<Opportunity>> search(OpportunitySearch search) async {
    try {
      final response = await _apiClient.get(
        '/opportunities',
        query: search.toQueryParameters(),
      );
      final items = _mapList(response, 'items');
      final opportunities = items.map(Opportunity.fromJson).toList();
      await Future.wait(
        opportunities.map((item) => _database.cacheOpportunity(item.toJson())),
      );
      servedCachedAt = null;
      return opportunities;
    } on ApiException catch (error) {
      if (!error.isNetworkError) rethrow;
      servedCachedAt = DateTime.now();
      return cachedOpportunities();
    }
  }

  /// Used by the feed to distinguish "seen" from "saved" and "applied" without
  /// another API round trip.
  Future<Set<String>> seenIds() async {
    final prefs = await SharedPreferences.getInstance();
    return (prefs.getStringList(_seenKey) ?? const <String>[]).toSet();
  }

  Future<void> markSeen(String id) async {
    final prefs = await SharedPreferences.getInstance();
    final ids = (await seenIds())..add(id);
    await prefs.setStringList(_seenKey, ids.toList());
  }

  /// Applications cache rows carry the opportunity id; read it locally so the
  /// feed can show an applied badge while offline.
  Future<Set<String>> appliedIds() async {
    final applications = await _database.cachedApplications();
    return applications
        .map((item) => item['opportunityId']?.toString() ?? '')
        .where((id) => id.isNotEmpty)
        .toSet();
  }

  Future<List<String>> recentQueries() => _recent.recent();

  Future<void> addRecentQuery(String query) => _recent.add(query);

  Future<Opportunity> getById(String id) async {
    try {
      final response = await _apiClient.get('/opportunities/$id');
      final item = _map(response, 'item');
      final opportunity = Opportunity.fromJson(item);
      await _database.cacheOpportunity(opportunity.toJson());
      servedCachedAt = null;
      return opportunity;
    } on ApiException catch (error) {
      if (!error.isNetworkError) rethrow;
      servedCachedAt = DateTime.now();
      final cached = await cachedOpportunities();
      return cached.firstWhere(
        (item) => item.id == id,
        orElse: () => throw const ApiException(
          statusCode: 404,
          message: 'This opportunity is not available offline yet',
        ),
      );
    }
  }

  Future<List<Opportunity>> cachedOpportunities() async {
    final rows = await _database.recentOpportunities();
    return rows.map(Opportunity.fromJson).toList();
  }

  Future<List<Opportunity>> savedOpportunities() async {
    final rows = await _database.savedOpportunities();
    return rows.map(Opportunity.fromJson).toList();
  }

  Future<Set<String>> savedIds() => _database.savedOpportunityIds();

  Future<bool> isSaved(String id) => _database.isOpportunitySaved(id);

  Future<void> setSaved(Opportunity opportunity, bool saved) async {
    if (saved) {
      await _database.saveOpportunity(opportunity.toJson());
    } else {
      await _database.removeSavedOpportunity(opportunity.id);
    }
  }

  List<Map<String, dynamic>> _mapList(dynamic response, String key) {
    if (response is Map && response[key] is List) {
      return (response[key] as List)
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList();
    }
    if (response is List) {
      return response
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList();
    }
    return const [];
  }

  Map<String, dynamic> _map(dynamic response, String key) {
    if (response is Map && response[key] is Map) {
      return Map<String, dynamic>.from(response[key] as Map);
    }
    if (response is Map) return Map<String, dynamic>.from(response);
    return <String, dynamic>{};
  }
}
