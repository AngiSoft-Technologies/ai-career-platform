import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../networking/api_client.dart';

class AppFeatureFlags {
  const AppFeatureFlags({
    this.minSupportedVersion,
    this.killSwitch = false,
    this.maintenanceMode = false,
    this.forceUpdate = false,
    this.flags = const {},
    this.apiVersion,
    this.storeUrl,
  });

  final String? minSupportedVersion;
  final bool killSwitch;
  final bool maintenanceMode;
  final bool forceUpdate;
  final Map<String, dynamic> flags;
  final String? apiVersion;
  final String? storeUrl;

  bool isEnabled(String key, {bool defaultValue = false}) {
    final value = flags[key];
    if (value is bool) return value;
    return defaultValue;
  }

  /// Compares dot-separated numeric versions (ignores build metadata).
  bool isBelowMinimum(String currentVersion) {
    final minimum = minSupportedVersion;
    if (minimum == null || minimum.isEmpty) return false;
    return _compare(currentVersion, minimum) < 0;
  }

  static int _compare(String a, String b) {
    final left = a.split('+').first.split('.').map(_int).toList();
    final right = b.split('+').first.split('.').map(_int).toList();
    final length = left.length > right.length ? left.length : right.length;
    for (var i = 0; i < length; i++) {
      final l = i < left.length ? left[i] : 0;
      final r = i < right.length ? right[i] : 0;
      if (l != r) return l < r ? -1 : 1;
    }
    return 0;
  }

  static int _int(String value) => int.tryParse(value) ?? 0;

  factory AppFeatureFlags.fromJson(Map<String, dynamic> json) =>
      AppFeatureFlags(
        minSupportedVersion: json['minSupportedVersion'] as String?,
        killSwitch: json['killSwitch'] == true || json['kill_switch'] == true,
        maintenanceMode:
            json['maintenanceMode'] == true || json['maintenance_mode'] == true,
        forceUpdate:
            json['forceUpdate'] == true || json['force_update'] == true,
        flags: Map<String, dynamic>.from(
          (json['flags'] ?? json['featureFlags']) as Map? ?? const {},
        ),
        apiVersion: json['apiVersion'] as String?,
        storeUrl: json['storeUrl'] as String?,
      );

  Map<String, dynamic> toJson() => {
    'minSupportedVersion': minSupportedVersion,
    'killSwitch': killSwitch,
    'maintenanceMode': maintenanceMode,
    'forceUpdate': forceUpdate,
    'flags': flags,
    'apiVersion': apiVersion,
    'storeUrl': storeUrl,
  };
}

/// Cached remote config with offline fallback.
///
/// A failed fetch keeps the last good config; there is no "fetch failed so
/// the kill switch is off" shortcut — a stale config is safer than none.
class AppFeatureFlagsStore {
  AppFeatureFlagsStore(this._apiClient);

  static const _key = 'app_feature_flags_v1';
  final ApiClient _apiClient;

  AppFeatureFlags? _memory;

  Future<AppFeatureFlags> load() async {
    if (_memory != null) return _memory!;
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_key);
    if (raw == null) return const AppFeatureFlags();
    try {
      _memory = AppFeatureFlags.fromJson(
        Map<String, dynamic>.from(jsonDecode(raw) as Map),
      );
    } catch (_) {
      _memory = const AppFeatureFlags();
    }
    return _memory!;
  }

  Future<AppFeatureFlags> refresh() async {
    try {
      final data = await _apiClient.get<Map<String, dynamic>>('/config/client');
      final flags = AppFeatureFlags.fromJson(data);
      await save(flags);
      _memory = flags;
      return flags;
    } catch (error) {
      debugPrint('Remote config fetch failed; using cached config: $error');
      return load();
    }
  }

  Future<void> save(AppFeatureFlags value) async {
    _memory = value;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, jsonEncode(value.toJson()));
  }
}
