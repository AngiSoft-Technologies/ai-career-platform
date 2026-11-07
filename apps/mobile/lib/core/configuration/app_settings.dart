import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

class AppSettings extends ChangeNotifier {
  AppSettings._({required this.baseUrl, required this.isDemoMode});

  static const defaultBaseUrl = 'https://mboqara-api-angisoft.fly.dev/v1';
  static const _baseUrlKey = 'api_base_url';
  static const _demoModeKey = 'demo_mode';

  String baseUrl;
  bool isDemoMode;

  static Future<AppSettings> load() async {
    final preferences = await SharedPreferences.getInstance();
    return AppSettings._(
      baseUrl: preferences.getString(_baseUrlKey) ?? defaultBaseUrl,
      // A fresh install starts against the real service. Demo mode is
      // something a candidate chooses on the sign-in screen ("Continue in
      // demo mode"), not something a first-run user is handed — a shipped
      // app that defaults to demo shows a candidate a catalogue that is
      // not the catalogue.
      isDemoMode: preferences.getBool(_demoModeKey) ?? false,
    );
  }

  Future<void> setBaseUrl(String value) async {
    final normalized = value.trim().replaceFirst(RegExp(r'/+$'), '');
    if (normalized == baseUrl) return;
    final preferences = await SharedPreferences.getInstance();
    await preferences.setString(_baseUrlKey, normalized);
    baseUrl = normalized;
    notifyListeners();
  }

  Future<void> setDemoMode(bool value) async {
    if (value == isDemoMode) return;
    final preferences = await SharedPreferences.getInstance();
    await preferences.setBool(_demoModeKey, value);
    isDemoMode = value;
    notifyListeners();
  }
}
