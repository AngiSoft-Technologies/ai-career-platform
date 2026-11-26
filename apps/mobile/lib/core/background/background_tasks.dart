import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:workmanager/workmanager.dart';

import '../authentication/api_auth_service.dart';
import '../authentication/token_storage.dart';
import '../configuration/app_settings.dart';
import '../networking/api_client.dart';
import '../storage/local_database.dart';
import '../synchronization/sync_engine.dart';

class BackgroundTasks {
  static const syncTask = 'mboqara.background.sync';
  static const _enabledKey = 'background_sync_enabled';
  static bool _initialized = false;

  static Future<bool> isEnabled() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_enabledKey) ?? true;
  }

  static Future<void> setEnabled(bool value) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_enabledKey, value);
    if (!value) {
      await Workmanager().cancelByUniqueName('mboqara-sync');
    } else {
      await registerIfPossible();
    }
  }

  /// Registers the periodic sync only for a signed-in user who opted in.
  /// A fresh install used to schedule a task that woke up every 30 minutes
  /// only to fail on a missing token.
  static Future<void> initialize() async {
    if (_initialized || kIsWeb) return;
    try {
      await Workmanager().initialize(callbackDispatcher);
      _initialized = true;
      await registerIfPossible();
    } catch (e) {
      debugPrint('Background tasks unavailable: $e');
    }
  }

  static Future<void> registerIfPossible() async {
    if (!_initialized || kIsWeb) return;
    if (!await isEnabled()) return;
    final tokenStorage = TokenStorage();
    final token = await tokenStorage.readToken();
    if (token == null || token.isEmpty) return;
    await Workmanager().registerPeriodicTask(
      'mboqara-sync',
      syncTask,
      frequency: const Duration(minutes: 30),
      initialDelay: const Duration(minutes: 2),
      existingWorkPolicy: ExistingPeriodicWorkPolicy.keep,
      constraints: Constraints(networkType: NetworkType.connected),
    );
  }

  static Future<void> cancel() async {
    await Workmanager().cancelByUniqueName('mboqara-sync');
  }
}

@pragma('vm:entry-point')
void callbackDispatcher() {
  Workmanager().executeTask((task, inputData) async {
    try {
      if (task == BackgroundTasks.syncTask) {
        final settings = await AppSettings.load();
        final database = await LocalDatabase.open();
        final tokenStorage = TokenStorage();
        final token = await tokenStorage.readToken();
        if (token == null || token.isEmpty) return true;
        final authService = ApiAuthService(settings: settings);
        final apiClient = ApiClient(
          settings: settings,
          tokenStorage: tokenStorage,
          authService: authService,
        );
        final engine = SyncEngine(apiClient: apiClient, database: database);
        final result = await engine.syncNow();
        return result.failed == 0;
      }
      return true;
    } catch (e) {
      debugPrint('Background task failed: $task $e');
      return false;
    }
  });
}
