import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../data/privacy_repository.dart';

/// Local, test-friendly state for the privacy section. The repository is
/// nullable so widget tests can drive the switches without an ApiClient.
class PrivacyController extends ChangeNotifier {
  PrivacyController({this.repository});

  final PrivacyRepository? repository;

  static const _backgroundSyncKey = 'background_sync_enabled';
  static const _deviceLockTimeoutKey = 'app_lock_timeout_minutes';

  PrivacySettings _settings = const PrivacySettings();
  List<TrustedDevice> _devices = const [];
  bool _backgroundSync = true;
  int _lockTimeoutMinutes = 1;
  bool _loading = false;
  String? _errorMessage;

  PrivacySettings get settings => _settings;
  List<TrustedDevice> get devices => _devices;
  bool get backgroundSync => _backgroundSync;
  int get lockTimeoutMinutes => _lockTimeoutMinutes;
  bool get loading => _loading;
  String? get errorMessage => _errorMessage;

  Future<void> load() async {
    _loading = true;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    _backgroundSync = prefs.getBool(_backgroundSyncKey) ?? true;
    _lockTimeoutMinutes = prefs.getInt(_deviceLockTimeoutKey) ?? 1;
    if (repository != null) {
      try {
        _settings = await repository!.load();
        _devices = await repository!.devices();
      } catch (error) {
        _errorMessage = error.toString();
      }
    }
    _loading = false;
    notifyListeners();
  }

  /// Optimistic update: the switch flips immediately and only rolls back if
  /// the server rejects the change.
  Future<void> update(PrivacySettings next) async {
    final previous = _settings;
    _settings = next;
    _errorMessage = null;
    notifyListeners();
    if (repository == null) return;
    try {
      _settings = await repository!.update(next);
    } catch (error) {
      _settings = previous;
      _errorMessage = error.toString();
    }
    notifyListeners();
  }

  Future<void> setBackgroundSync(bool value) async {
    _backgroundSync = value;
    final prefs = await SharedPreferences.getInstance();
    // TODO(missing core API): AppSettings has no `backgroundSync` flag yet;
    // until it does, the switch is persisted locally and the SyncController
    // caller should honour it by skipping automatic background replays.
    await prefs.setBool(_backgroundSyncKey, value);
    notifyListeners();
  }

  Future<void> setLockTimeout(int minutes) async {
    _lockTimeoutMinutes = minutes;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt(_deviceLockTimeoutKey, minutes);
    notifyListeners();
  }
}
