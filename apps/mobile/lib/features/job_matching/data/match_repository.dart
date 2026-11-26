import 'dart:convert';

import '../../../core/networking/api_client.dart';
import '../../../core/networking/api_exception.dart';
import '../../../core/storage/local_database.dart';
import '../../opportunities/domain/opportunity.dart';
import '../domain/job_match.dart';

class MatchRepository {
  MatchRepository({required ApiClient apiClient, LocalDatabase? database})
    : _apiClient = apiClient,
      _database = database;

  final ApiClient _apiClient;
  final LocalDatabase? _database;

  static const _cacheKey = 'cached_matches_v1';

  /// True when the last read came from the offline cache.
  bool servedFromCache = false;
  DateTime? cachedAt;

  Future<List<Opportunity>> listMatches({int limit = 50}) async {
    try {
      final response = await _apiClient.get(
        '/matches',
        query: {'limit': '$limit'},
      );
      final items = _items(response);
      await _cache(items);
      servedFromCache = false;
      return items;
    } on ApiException catch (error) {
      if (!error.isNetworkError) rethrow;
      servedFromCache = true;
      return cachedMatches();
    }
  }

  /// Offline fallback stored in LocalDatabase's generic sync_metadata table.
  /// TODO(core dependency): when a dedicated `cachedMatches` accessor lands,
  /// move this off the shared key-value row.
  Future<List<Opportunity>> cachedMatches() async {
    final db = _database;
    if (db == null) return const [];
    final raw = await db.getSyncMetadata(_cacheKey);
    if (raw == null) return const [];
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! List) return const [];
      return decoded
          .whereType<Map>()
          .map((item) => Opportunity.fromJson(Map<String, dynamic>.from(item)))
          .toList();
    } on FormatException {
      return const [];
    }
  }

  Future<void> _cache(List<Opportunity> items) async {
    final db = _database;
    if (db == null) return;
    await db.setSyncMetadata(
      _cacheKey,
      jsonEncode(items.map((item) => item.toJson()).toList()),
    );
    cachedAt = DateTime.now();
  }

  List<Opportunity> _items(dynamic response) {
    if (response is Map && response['items'] is List) {
      return (response['items'] as List)
          .whereType<Map>()
          .map((item) => Opportunity.fromJson(Map<String, dynamic>.from(item)))
          .toList();
    }
    throw const ApiException(
      statusCode: 502,
      message: 'The match service returned an unexpected response.',
    );
  }

  JobMatch matchFor(Opportunity opportunity) {
    return opportunity.match ??
        const JobMatch(
          score: 0,
          explanation: 'No match analysis is available yet.',
          gaps: [],
          factors: MatchFactors(),
        );
  }
}
