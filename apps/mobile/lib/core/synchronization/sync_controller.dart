import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';

import '../storage/local_database.dart';
import 'sync_engine.dart';

class SyncController extends ChangeNotifier {
  SyncController({
    required SyncEngine syncEngine,
    required LocalDatabase database,
  }) : _syncEngine = syncEngine,
       _database = database;

  final SyncEngine _syncEngine;
  final LocalDatabase _database;
  StreamSubscription<List<ConnectivityResult>>? _connectivitySubscription;

  bool _isOnline = true;
  bool _isSyncing = false;
  int _pendingCount = 0;
  int _failedCount = 0;
  DateTime? _lastSyncAt;
  String? _lastError;

  bool get isOnline => _isOnline;
  bool get isSyncing => _isSyncing;
  int get pendingCount => _pendingCount;
  int get failedCount => _failedCount;
  DateTime? get lastSyncAt => _lastSyncAt;
  String? get lastError => _lastError;

  Future<void> initialize() async {
    final connectivity = Connectivity();
    final results = await connectivity.checkConnectivity();
    _updateConnectivity(results);
    _connectivitySubscription = connectivity.onConnectivityChanged.listen((
      value,
    ) {
      _updateConnectivity(value);
      if (_isOnline) unawaited(syncNow());
    });
    await refreshStatus();
  }

  Future<void> refreshStatus() async {
    _pendingCount = await _database.actionCount(status: 'pending');
    _failedCount = await _database.actionCount(status: 'failed');
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
      _lastSyncAt = DateTime.now();
    } catch (error) {
      _lastError = error.toString();
    } finally {
      _isSyncing = false;
      notifyListeners();
    }
  }

  void _updateConnectivity(List<ConnectivityResult> results) {
    final online = results.any((result) => result != ConnectivityResult.none);
    if (_isOnline == online) return;
    _isOnline = online;
    notifyListeners();
  }

  @override
  void dispose() {
    _connectivitySubscription?.cancel();
    super.dispose();
  }
}
