import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';

import '../storage/local_database.dart';
import 'offline_action.dart';
import 'sync_engine.dart';

/// Owns the user-facing sync state: connectivity, queue counts, last clean
/// sync and the conflicts that need a decision. It is a [WidgetsBindingObserver]
/// so returning from the background replays the queue even when the network
/// did not flap.
class SyncController extends ChangeNotifier with WidgetsBindingObserver {
  SyncController({
    required SyncEngine syncEngine,
    required LocalDatabase database,
  }) : _syncEngine = syncEngine,
       _database = database;

  final SyncEngine _syncEngine;
  final LocalDatabase _database;
  StreamSubscription<List<ConnectivityResult>>? _connectivitySubscription;
  Timer? _statusTicker;
  bool _initialized = false;

  bool _isOnline = true;
  bool _isSyncing = false;
  int _pendingCount = 0;
  int _failedCount = 0;
  int _conflictCount = 0;
  DateTime? _lastSyncAt;
  String? _lastError;
  List<OfflineAction> _conflicts = const [];

  bool get isOnline => _isOnline;
  bool get isSyncing => _isSyncing;
  int get pendingCount => _pendingCount;
  int get failedCount => _failedCount;
  int get conflictCount => _conflictCount;
  DateTime? get lastSyncAt => _lastSyncAt;
  String? get lastError => _lastError;
  List<OfflineAction> get conflicts => _conflicts;

  Future<void> initialize() async {
    if (_initialized) return;
    _initialized = true;
    WidgetsBinding.instance.addObserver(this);
    final connectivity = Connectivity();
    final results = await connectivity.checkConnectivity();
    _updateConnectivity(results);
    _connectivitySubscription = connectivity.onConnectivityChanged.listen((
      value,
    ) {
      _updateConnectivity(value);
      if (_isOnline) unawaited(syncNow());
    });
    _statusTicker = Timer.periodic(const Duration(seconds: 30), (_) {
      unawaited(refreshStatus());
    });
    await refreshStatus();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && _isOnline) {
      unawaited(syncNow());
    }
  }

  Future<void> refreshStatus() async {
    _pendingCount = await _database.actionCount(status: 'pending');
    _failedCount = await _database.actionCount(status: 'failed');
    _conflictCount = await _database.actionCount(status: 'conflict');
    _conflicts = await _database.conflictActions();
    final last = await _database.getSyncMetadata('last_sync_at');
    if (last != null) _lastSyncAt = DateTime.tryParse(last);
    notifyListeners();
  }

  Future<void> syncNow() async {
    if (_isSyncing || !_isOnline) return;
    _isSyncing = true;
    _lastError = null;
    notifyListeners();
    try {
      final result = await _syncEngine.syncNow();
      _pendingCount = result.pending;
      _failedCount = await _database.actionCount(status: 'failed');
      _conflictCount = await _database.actionCount(status: 'conflict');
      _conflicts = await _database.conflictActions();
      if (result.syncedAt != null) _lastSyncAt = result.syncedAt;
    } catch (error) {
      _lastError = error.toString();
    } finally {
      _isSyncing = false;
      notifyListeners();
    }
  }

  /// Resolves a 409 from the conflict sheet and replays the chosen version.
  Future<void> resolveConflict(
    String idempotencyKey,
    String resolution, {
    Map<String, dynamic>? mergedPayload,
  }) async {
    await _syncEngine.resolveConflict(
      idempotencyKey,
      resolution,
      mergedPayload: mergedPayload,
    );
    await refreshStatus();
  }

  /// Drops failed actions that cannot be replayed (for example a deleted
  /// entity after the user chose "use server").
  Future<void> discardAction(String idempotencyKey) async {
    await _database.deleteAction(idempotencyKey);
    await refreshStatus();
  }

  /// Shared-device safety: called from the forced-logout path.
  Future<void> clearLocalData() async {
    await _database.clearUserData();
    _pendingCount = 0;
    _failedCount = 0;
    _conflictCount = 0;
    _conflicts = const [];
    _lastSyncAt = null;
    notifyListeners();
  }

  void _updateConnectivity(List<ConnectivityResult> results) {
    final online = results.any((result) => result != ConnectivityResult.none);
    if (_isOnline == online) return;
    _isOnline = online;
    notifyListeners();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _connectivitySubscription?.cancel();
    _statusTicker?.cancel();
    super.dispose();
  }
}
