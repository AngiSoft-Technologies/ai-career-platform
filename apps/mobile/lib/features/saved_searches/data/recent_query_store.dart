import 'package:shared_preferences/shared_preferences.dart';

/// Small, shared store for query chips on the feed and saved-search screen.
/// It is deliberately feature-level: no core API is needed for recent text.
class RecentQueryStore {
  RecentQueryStore({this.limit = 8});

  static const _key = 'recent_searches_v1';
  final int limit;

  Future<List<String>> recent() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getStringList(_key) ?? const <String>[];
  }

  Future<void> add(String query) async {
    final value = query.trim();
    if (value.isEmpty) return;
    final prefs = await SharedPreferences.getInstance();
    final items = prefs.getStringList(_key) ?? <String>[];
    final next = [
      value,
      ...items.where((item) => item.toLowerCase() != value.toLowerCase()),
    ].take(limit).toList();
    await prefs.setStringList(_key, next);
  }

  Future<void> clear() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_key);
  }
}
