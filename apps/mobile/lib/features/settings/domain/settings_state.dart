enum SettingsMode { demo, real }

class SettingsState {
  const SettingsState({
    required this.baseUrl,
    required this.mode,
    required this.isOnline,
    required this.isSyncing,
    required this.pendingActions,
    required this.failedActions,
    this.lastSyncAt,
  });

  final String baseUrl;
  final SettingsMode mode;
  final bool isOnline;
  final bool isSyncing;
  final int pendingActions;
  final int failedActions;
  final DateTime? lastSyncAt;
}
