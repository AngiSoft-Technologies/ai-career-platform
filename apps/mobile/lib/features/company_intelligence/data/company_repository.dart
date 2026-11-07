import '../../../core/networking/api_client.dart';
import '../../../core/networking/api_exception.dart';
import '../../../core/storage/local_database.dart';
import '../domain/company.dart';

/// The companies browser — the same data the web's `/companies` page
/// reads.
///
/// The mobile app could always say which company posts a role; it could
/// not browse employers, which is the half candidates actually use when
/// they are deciding where to apply. The list and the detail are cached
/// like the rest of the app's content, so the browser still opens with
/// no signal.
class CompanyRepository {
  CompanyRepository({
    required ApiClient apiClient,
    required LocalDatabase database,
  }) : _apiClient = apiClient,
       _database = database;

  final ApiClient _apiClient;
  final LocalDatabase _database;

  Future<List<Company>> companies({String? query, int limit = 60}) async {
    try {
      final response = await _apiClient.get(
        '/companies',
        query: {
          if (query != null && query.trim().isNotEmpty) 'q': query.trim(),
          'limit': '$limit',
        },
      );
      final items = _mapList(response, 'items');
      final companies = items
          .whereType<Map<String, dynamic>>()
          .map(Company.fromJson)
          .toList();
      // Only cache the unfiltered list: a search result is a slice, and
      // caching a slice would make the next offline visit look like the
      // whole catalogue.
      if (query == null || query.trim().isEmpty) {
        await _database.cacheCompanies(
          items.whereType<Map<String, dynamic>>().toList(),
        );
      }
      return companies;
    } on ApiException catch (error) {
      if (!error.isNetworkError) rethrow;
      final cached = await _database.cachedCompanies();
      return cached.map(Company.fromJson).toList();
    }
  }

  Future<CompanyDetail> company(String slug) async {
    try {
      final response = await _apiClient.get('/companies/$slug');
      return CompanyDetail.fromJson(response as Map<String, dynamic>);
    } on ApiException catch (error) {
      if (!error.isNetworkError) rethrow;
      // A detail page needs the live roles, so rather than show an empty
      // company from cache, say so and let the candidate retry.
      throw const ApiException(
        statusCode: 0,
        message: 'This company needs a connection to load its roles.',
        code: 'offline',
      );
    }
  }

  List<dynamic> _mapList(dynamic response, String key) {
    if (response is Map<String, dynamic>) {
      final items = response[key];
      if (items is List) return items;
    }
    if (response is List) return response;
    return const [];
  }
}
