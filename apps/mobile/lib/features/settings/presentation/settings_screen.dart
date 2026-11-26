import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';

import '../../../core/authentication/auth_session.dart';
import '../../../core/configuration/app_settings.dart';
import '../../../core/notifications/notification_preferences_store.dart';
import '../../../core/permissions/app_permissions.dart';
import '../../../core/security/base_url_validator.dart';
import '../../../core/security/biometric_lock_service.dart';
import '../../../core/networking/api_client.dart';
import '../../../core/synchronization/sync_controller.dart';
import '../../notifications/domain/notification_preferences.dart';
import '../../../shared/formatting/app_formatters.dart';
import '../../../shared/theme/app_colors.dart';
import '../../../shared/widgets/app_background.dart';
import '../../../shared/widgets/app_states.dart';
import '../data/privacy_repository.dart';
import '../data/settings_repository.dart';
import '../domain/settings_state.dart';
import 'privacy_controller.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key, this.privacyController, this.biometricLock});

  /// Injectable so widget tests can drive privacy switches without a network.
  final PrivacyController? privacyController;
  final BiometricLockService? biometricLock;

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final _baseUrlController = TextEditingController();
  final _notificationPrefsStore = NotificationPreferencesStore();
  String? _baseUrlError;
  NotificationPreferences _notificationPrefs = const NotificationPreferences();
  bool _prefsLoaded = false;

  late final PrivacyController _privacy;
  late final BiometricLockService _biometric;
  bool _biometricSupported = false;
  bool _biometricEnabled = false;
  bool _exporting = false;

  @override
  void initState() {
    super.initState();
    _privacy =
        widget.privacyController ??
        PrivacyController(
          repository: PrivacyRepository(apiClient: context.read<ApiClient>()),
        );
    _biometric = widget.biometricLock ?? BiometricLockService();
    _loadNotificationPrefs();
    _loadSecurityState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _privacy.load());
  }

  Future<void> _loadSecurityState() async {
    final supported = await _biometric.isSupported();
    final enabled = await _biometric.isEnabled();
    if (!mounted) return;
    setState(() {
      _biometricSupported = supported;
      _biometricEnabled = enabled;
    });
  }

  Future<void> _loadNotificationPrefs() async {
    final prefs = await _notificationPrefsStore.load();
    if (!mounted) return;
    setState(() {
      _notificationPrefs = prefs;
      _prefsLoaded = true;
    });
  }

  Future<void> _saveNotificationPrefs(NotificationPreferences prefs) async {
    setState(() => _notificationPrefs = prefs);
    await _notificationPrefsStore.save(prefs);
    // Backend is source of truth; best-effort sync when available.
    try {
      if (!mounted) return;
      await context.read<ApiClient>().put(
        '/me/notification-preferences',
        body: prefs.toJson(),
      );
    } catch (_) {}
  }

  @override
  void dispose() {
    _baseUrlController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final settings = context.watch<AppSettings>();
    final auth = context.watch<AuthSession>();
    final sync = context.watch<SyncController>();
    if (_baseUrlController.text.isEmpty) {
      _baseUrlController.text = settings.baseUrl;
    }
    final state = SettingsState(
      baseUrl: settings.baseUrl,
      mode: auth.isDemoMode ? SettingsMode.demo : SettingsMode.real,
      isOnline: sync.isOnline,
      isSyncing: sync.isSyncing,
      pendingActions: sync.pendingCount,
      failedActions: sync.failedCount,
      lastSyncAt: sync.lastSyncAt,
    );
    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(title: const Text('Settings')),
      body: AppBackground(
        child: ListenableBuilder(
          listenable: _privacy,
          builder: (context, _) => ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
            children: [
              SectionCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Appearance',
                      style: Theme.of(context).textTheme.titleMedium
                          ?.copyWith(fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'System mode follows your device. You can override it here.',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                    ),
                    const SizedBox(height: 12),
                    SegmentedButton<ThemeMode>(
                      segments: const [
                        ButtonSegment(
                          value: ThemeMode.system,
                          label: Text('System'),
                          icon: Icon(Icons.brightness_auto_rounded),
                        ),
                        ButtonSegment(
                          value: ThemeMode.light,
                          label: Text('Light'),
                          icon: Icon(Icons.light_mode_rounded),
                        ),
                        ButtonSegment(
                          value: ThemeMode.dark,
                          label: Text('Dark'),
                          icon: Icon(Icons.dark_mode_rounded),
                        ),
                      ],
                      selected: {settings.themeMode},
                      onSelectionChanged: (selection) {
                        context.read<AppSettings>().setThemeMode(
                          selection.first,
                        );
                      },
                    ),
                    const SizedBox(height: 16),
                    _ThemePalettePreview(),
                    const SizedBox(height: 14),
                    const _ColorCodeReference(),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              SectionCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'API connection',
                      style: Theme.of(context).textTheme.titleMedium
                          ?.copyWith(fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _baseUrlController,
                      keyboardType: TextInputType.url,
                      autocorrect: false,
                      decoration: InputDecoration(
                        labelText: 'Base URL',
                        hintText: AppSettings.defaultBaseUrl,
                        errorText: _baseUrlError,
                        prefixIcon: const Icon(Icons.dns_outlined),
                      ),
                    ),
                    const SizedBox(height: 12),
                    FilledButton.icon(
                      onPressed: _saveBaseUrl,
                      icon: const Icon(Icons.save_outlined),
                      label: const Text('Save base URL'),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'API version: v1',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              SectionCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Account mode',
                      style: Theme.of(context).textTheme.titleMedium
                          ?.copyWith(fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 12),
                    SegmentedButton<SettingsMode>(
                      segments: const [
                        ButtonSegment(
                          value: SettingsMode.demo,
                          label: Text('Demo'),
                          icon: Icon(Icons.science_outlined),
                        ),
                        ButtonSegment(
                          value: SettingsMode.real,
                          label: Text('Real account'),
                          icon: Icon(Icons.person_outline_rounded),
                        ),
                      ],
                      selected: {state.mode},
                      onSelectionChanged: (selection) =>
                          _changeMode(selection.first, auth),
                    ),
                    const SizedBox(height: 10),
                    Text(
                      auth.isDemoMode
                          ? 'Demo mode uses the seeded candidate and skips authentication.'
                          : auth.isAuthenticated
                          ? 'Authenticated with your MboQara account.'
                          : 'Sign in to use a real account.',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              SectionCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Notifications',
                      style: Theme.of(context).textTheme.titleMedium
                          ?.copyWith(fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Push is a delivery transport only. Your backend remains the source of truth for notification content and state.',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                    ),
                    if (_prefsLoaded) ...[
                      SwitchListTile.adaptive(
                        contentPadding: EdgeInsets.zero,
                        title: const Text('Push notifications'),
                        subtitle: const Text(
                          'Allow device alerts for important updates',
                        ),
                        value: _notificationPrefs.pushEnabled,
                        onChanged: (v) async {
                          if (v) {
                            final ok = await AppPermissions.ensureNotifications(
                              context,
                            );
                            if (!ok) return;
                          }
                          await _saveNotificationPrefs(
                            _notificationPrefs.copyWith(pushEnabled: v),
                          );
                        },
                      ),
                      SwitchListTile.adaptive(
                        contentPadding: EdgeInsets.zero,
                        title: const Text('Job matches'),
                        value: _notificationPrefs.matches,
                        onChanged: (v) => _saveNotificationPrefs(
                          _notificationPrefs.copyWith(matches: v),
                        ),
                      ),
                      SwitchListTile.adaptive(
                        contentPadding: EdgeInsets.zero,
                        title: const Text('Application updates'),
                        value: _notificationPrefs.applications,
                        onChanged: (v) => _saveNotificationPrefs(
                          _notificationPrefs.copyWith(applications: v),
                        ),
                      ),
                      SwitchListTile.adaptive(
                        contentPadding: EdgeInsets.zero,
                        title: const Text('Reminders & follow-ups'),
                        value: _notificationPrefs.reminders,
                        onChanged: (v) => _saveNotificationPrefs(
                          _notificationPrefs.copyWith(reminders: v),
                        ),
                      ),
                      SwitchListTile.adaptive(
                        contentPadding: EdgeInsets.zero,
                        title: const Text('Tips & offers'),
                        value: _notificationPrefs.marketing,
                        onChanged: (v) => _saveNotificationPrefs(
                          _notificationPrefs.copyWith(marketing: v),
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Quiet hours',
                        style: Theme.of(context).textTheme.labelLarge?.copyWith(
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                        ),
                      ),
                      const SizedBox(height: 6),
                      _quietHoursFields(context),
                      const SizedBox(height: 8),
                      TextButton.icon(
                        onPressed: _openSystemSettings,
                        icon: const Icon(Icons.tune_rounded),
                        label: const Text('Open system notification settings'),
                      ),
                    ] else
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 8),
                        child: LinearProgressIndicator(),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              SectionCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(
                          state.isOnline
                              ? Icons.cloud_done_outlined
                              : Icons.cloud_off_outlined,
                          color: state.isOnline
                              ? Theme.of(context).colorScheme.primary
                              : Theme.of(context).colorScheme.error,
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            state.isOnline ? 'Online' : 'Offline',
                            style: Theme.of(context).textTheme.titleMedium
                                ?.copyWith(fontWeight: FontWeight.w700),
                          ),
                        ),
                        if (state.isSyncing)
                          const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Text(
                      '${state.pendingActions} pending action${state.pendingActions == 1 ? '' : 's'} · ${state.failedActions} failed',
                    ),
                    const SizedBox(height: 4),
                    Text(
                      state.lastSyncAt == null
                          ? 'No manual sync completed yet.'
                          : 'Last synced ${AppFormatters.dateTime(state.lastSyncAt)}',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                    ),
                    const SizedBox(height: 12),
                    OutlinedButton.icon(
                      onPressed: state.isOnline && !state.isSyncing
                          ? () => context.read<SyncController>().syncNow()
                          : null,
                      icon: const Icon(Icons.sync_rounded),
                      label: const Text('Sync now'),
                    ),
                  ],
                ),
              ),
              if (sync.conflicts.isNotEmpty) ...[
                const SizedBox(height: 14),
                Semantics(
                  label: '${sync.conflicts.length} sync conflicts need review',
                  child: SectionCard(
                    color: Theme.of(context).colorScheme.errorContainer,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${sync.conflicts.length} item(s) need your review',
                          style: Theme.of(context).textTheme.titleMedium
                              ?.copyWith(fontWeight: FontWeight.w700),
                        ),
                        const SizedBox(height: 8),
                        for (final conflict in sync.conflicts.take(5))
                          ListTile(
                            contentPadding: EdgeInsets.zero,
                            leading: const Icon(Icons.warning_amber_rounded),
                            title: Text(
                              conflict.actionType.replaceAll('_', ' '),
                            ),
                            subtitle: Text(
                              '${conflict.entityType ?? 'item'} · '
                              '${AppFormatters.dateTime(conflict.updatedAt)}',
                            ),
                            trailing: TextButton(
                              onPressed: () => _resolveConflict(conflict),
                              child: const Text('Resolve'),
                            ),
                          ),
                        TextButton.icon(
                          onPressed: () => showModalBottomSheet<void>(
                            context: context,
                            isScrollControlled: true,
                            showDragHandle: true,
                            builder: (context) => Padding(
                              padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                                  Text(
                                    'Sync conflicts',
                                    style: Theme.of(context)
                                        .textTheme
                                        .titleLarge,
                                  ),
                                  const SizedBox(height: 12),
                                  for (final conflict in sync.conflicts)
                                    ListTile(
                                      contentPadding: EdgeInsets.zero,
                                      title: Text(conflict.actionType),
                                      subtitle: Text(
                                        'Created ${AppFormatters.dateTime(conflict.createdAt)}',
                                      ),
                                      trailing: TextButton(
                                        onPressed: () =>
                                            _resolveConflict(conflict),
                                        child: const Text('Resolve'),
                                      ),
                                    ),
                                ],
                              ),
                            ),
                          ),
                          icon: const Icon(Icons.list_alt_rounded),
                          label: const Text('Review all conflicts'),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
              const SizedBox(height: 14),
              Semantics(
                label: 'Security and app lock',
                child: SectionCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Security',
                        style: Theme.of(context).textTheme.titleMedium
                            ?.copyWith(fontWeight: FontWeight.w700),
                      ),
                      const SizedBox(height: 8),
                      SwitchListTile.adaptive(
                        contentPadding: EdgeInsets.zero,
                        title: const Text('Lock app with biometrics'),
                        subtitle: Text(
                          _biometricSupported
                              ? 'Require a fingerprint, face, or device PIN to open the app.'
                              : 'Biometric unlock is not available on this device.',
                        ),
                        value: _biometricEnabled,
                        onChanged: _biometricSupported
                            ? _toggleBiometric
                            : null,
                      ),
                      if (_biometricEnabled) ...[
                        const SizedBox(height: 4),
                        DropdownButtonFormField<int>(
                          initialValue: _privacy.lockTimeoutMinutes,
                          decoration: const InputDecoration(
                            labelText: 'Lock after',
                            prefixIcon: Icon(Icons.lock_clock_outlined),
                          ),
                          items: const [
                            DropdownMenuItem(value: 1, child: Text('1 minute')),
                            DropdownMenuItem(
                              value: 5,
                              child: Text('5 minutes'),
                            ),
                            DropdownMenuItem(
                              value: 15,
                              child: Text('15 minutes'),
                            ),
                          ],
                          onChanged: (value) =>
                              _privacy.setLockTimeout(value ?? 1),
                        ),
                      ],
                      const SizedBox(height: 8),
                      TextButton.icon(
                        onPressed: _openSystemSettings,
                        icon: const Icon(Icons.tune_rounded),
                        label: const Text('Open device settings'),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 14),
              Semantics(
                label: 'Privacy controls',
                child: SectionCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Privacy',
                        style: Theme.of(context).textTheme.titleMedium
                            ?.copyWith(fontWeight: FontWeight.w700),
                      ),
                      const SizedBox(height: 8),
                      SwitchListTile.adaptive(
                        contentPadding: EdgeInsets.zero,
                        title: const Text('Share anonymous analytics'),
                        subtitle: const Text(
                          'Helps us improve rankings and reliability.',
                        ),
                        value: _privacy.settings.allowAnalytics,
                        onChanged: (value) => _privacy.update(
                          _privacy.settings.copyWith(allowAnalytics: value),
                        ),
                      ),
                      SwitchListTile.adaptive(
                        contentPadding: EdgeInsets.zero,
                        title: const Text('Personalised recommendations'),
                        subtitle: const Text(
                          'Use your profile and history to rank roles.',
                        ),
                        value: _privacy.settings.personalisation,
                        onChanged: (value) => _privacy.update(
                          _privacy.settings.copyWith(personalisation: value),
                        ),
                      ),
                      SwitchListTile.adaptive(
                        contentPadding: EdgeInsets.zero,
                        title: const Text('Hide screen previews'),
                        subtitle: const Text(
                          'Blur the app switcher preview on supported devices.',
                        ),
                        value: _privacy.settings.screenshotProtection,
                        onChanged: (value) => _privacy.update(
                          _privacy.settings.copyWith(
                            screenshotProtection: value,
                          ),
                        ),
                      ),
                      SwitchListTile.adaptive(
                        contentPadding: EdgeInsets.zero,
                        title: const Text('Background sync'),
                        subtitle: const Text(
                          'Replay queued changes while the app is in the background.',
                        ),
                        value: _privacy.backgroundSync,
                        onChanged: _privacy.setBackgroundSync,
                      ),
                      if (_privacy.errorMessage != null)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: Text(
                            'Privacy settings could not be saved: '
                            '${_privacy.errorMessage}',
                            style: TextStyle(
                              color: Theme.of(context).colorScheme.error,
                            ),
                          ),
                        ),
                      if (_privacy.devices.isNotEmpty) ...[
                        const SizedBox(height: 6),
                        Text(
                          'Signed-in devices',
                          style: Theme.of(context).textTheme.labelLarge,
                        ),
                        for (final device in _privacy.devices)
                          ListTile(
                            contentPadding: EdgeInsets.zero,
                            leading: const Icon(Icons.devices_other_outlined),
                            title: Text(
                              '${device.label.isEmpty ? 'Device' : device.label}'
                              '${device.current ? ' (this device)' : ''}',
                            ),
                            subtitle: Text(
                              device.lastActiveAt == null
                                  ? 'Last active unknown'
                                  : 'Last active '
                                        '${AppFormatters.dateTime(device.lastActiveAt)}',
                            ),
                          ),
                      ],
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          OutlinedButton.icon(
                            onPressed: _exporting ? null : _exportData,
                            icon: const Icon(Icons.download_outlined),
                            label: Text(
                              _exporting
                                  ? 'Preparing export…'
                                  : 'Export my data',
                            ),
                          ),
                          OutlinedButton.icon(
                            onPressed: _deleteAccount,
                            icon: Icon(
                              Icons.delete_forever_outlined,
                              color: Theme.of(context).colorScheme.error,
                            ),
                            label: Text(
                              'Delete account',
                              style: TextStyle(
                                color: Theme.of(context).colorScheme.error,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 14),
              OutlinedButton.icon(
                onPressed: _signOut,
                icon: const Icon(Icons.logout_rounded),
                label: const Text('Sign out'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _resolveConflict(dynamic conflict) async {
    final resolution = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Resolve sync conflict'),
        content: Text(
          'Choose which version of "${conflict.actionType}" to keep.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, 'use_local'),
            child: const Text('Keep mine'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, 'use_server'),
            child: const Text('Use server'),
          ),
        ],
      ),
    );
    if (resolution == null) return;
    if (!context.mounted) return;
    await context.read<SyncController>().resolveConflict(
      conflict.idempotencyKey as String,
      resolution,
    );
  }

  Future<void> _toggleBiometric(bool value) async {
    if (value) {
      final ok = await _biometric.authenticate(
        reason: 'Confirm it is you before enabling app lock',
      );
      if (!ok) return;
    }
    await _biometric.setEnabled(value);
    if (!mounted) return;
    setState(() => _biometricEnabled = value);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(value ? 'App lock enabled.' : 'App lock disabled.'),
      ),
    );
  }

  Future<void> _exportData() async {
    setState(() => _exporting = true);
    try {
      final api = context.read<ApiClient>();
      final repository = PrivacyRepository(apiClient: api);
      final file = await repository.exportData();
      await Share.shareXFiles(
        [file],
        subject: 'My MboQara data',
        text: 'A copy of my account data.',
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Export failed: $error')));
    } finally {
      if (mounted) setState(() => _exporting = false);
    }
  }

  Future<void> _deleteAccount() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete your account?'),
        content: const Text(
          'This removes your profile, applications and documents from the '
          'server. This cannot be undone.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            style: FilledButton.styleFrom(
              backgroundColor: Theme.of(context).colorScheme.error,
            ),
            child: const Text('Delete account'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    if (!context.mounted) return;
    try {
      await context.read<ApiClient>().delete('/v1/me');
      if (!context.mounted) return;
      await context.read<AuthSession>().signOut();
      context.go('/onboarding');
    } catch (error) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not delete the account: $error')),
      );
    }
  }

  Future<void> _openSystemSettings() => openAppSettings();

  Widget _quietHoursFields(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: TextField(
            decoration: const InputDecoration(
              labelText: 'Quiet from (HH:mm)',
              hintText: '22:00',
            ),
            controller: TextEditingController(
              text: _notificationPrefs.quietHoursStart ?? '',
            ),
            onSubmitted: (value) => _saveNotificationPrefs(
              _notificationPrefs.copyWith(
                quietHoursStart: value.trim().isEmpty ? null : value.trim(),
              ),
            ),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: TextField(
            decoration: const InputDecoration(
              labelText: 'Quiet until (HH:mm)',
              hintText: '07:00',
            ),
            controller: TextEditingController(
              text: _notificationPrefs.quietHoursEnd ?? '',
            ),
            onSubmitted: (value) => _saveNotificationPrefs(
              _notificationPrefs.copyWith(
                quietHoursEnd: value.trim().isEmpty ? null : value.trim(),
              ),
            ),
          ),
        ),
      ],
    );
  }

  Future<void> _saveBaseUrl() async {
    final value = _baseUrlController.text.trim();
    final validation = BaseUrlValidator.validate(value);
    if (validation != null) {
      setState(() => _baseUrlError = validation);
      return;
    }
    try {
      await context.read<SettingsRepository>().setBaseUrl(value);
      if (!mounted) return;
      setState(() => _baseUrlError = null);
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Base URL updated.')));
    } on ArgumentError catch (error) {
      if (!mounted) return;
      setState(() => _baseUrlError = error.message?.toString());
    }
  }

  Future<void> _changeMode(SettingsMode mode, AuthSession auth) async {
    await auth.setDemoMode(mode == SettingsMode.demo);
    if (!mounted) return;
    if (mode == SettingsMode.real && !auth.isSignedIn) {
      context.go('/onboarding');
    }
  }

  Future<void> _signOut() async {
    await context.read<AuthSession>().signOut();
    if (!mounted) return;
    context.go('/onboarding');
  }
}

class _ThemePalettePreview extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final app = context.appColors;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final items = <(String, Color)>[
      ('Surface', scheme.surface),
      ('Container', scheme.surfaceContainerLow),
      ('Primary', scheme.primary),
      ('Signal', app.signal),
      ('Verified', app.verified),
      ('Insight', app.insight),
      ('Text', scheme.onSurface),
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          isDark ? 'Dark mode color codes' : 'Light mode color codes',
          style: Theme.of(context).textTheme.labelLarge?.copyWith(
            fontWeight: FontWeight.w700,
            color: scheme.onSurfaceVariant,
          ),
        ),
        const SizedBox(height: 10),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final item in items)
              _ColorSwatch(label: item.$1, color: item.$2),
          ],
        ),
      ],
    );
  }
}

class _ColorSwatch extends StatelessWidget {
  const _ColorSwatch({required this.label, required this.color});
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final hex =
        '#${color.toARGB32().toRadixString(16).padLeft(8, '0').substring(2).toUpperCase()}';
    return Container(
      width: 96,
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: scheme.surfaceContainer.withValues(alpha: 0.7),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: scheme.outlineVariant.withValues(alpha: 0.45),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            height: 28,
            decoration: BoxDecoration(
              color: color,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(
                color: scheme.outlineVariant.withValues(alpha: 0.3),
              ),
            ),
          ),
          const SizedBox(height: 6),
          Text(label, style: Theme.of(context).textTheme.labelSmall),
          Text(
            hex,
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
              color: scheme.onSurfaceVariant,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
        ],
      ),
    );
  }
}

class _ColorCodeReference extends StatelessWidget {
  const _ColorCodeReference();

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final style = Theme.of(context).textTheme.labelSmall
        ?.copyWith(color: scheme.onSurfaceVariant, fontFamily: 'monospace');
    Widget row(String name, String light, String dark) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          Expanded(
            flex: 3,
            child: Text(name, style: style?.copyWith(color: scheme.onSurface)),
          ),
          Expanded(flex: 2, child: Text(light, style: style)),
          Expanded(flex: 2, child: Text(dark, style: style)),
        ],
      ),
    );
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: scheme.surfaceContainer.withValues(alpha: 0.55),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: scheme.outlineVariant.withValues(alpha: 0.35),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Color codes',
            style: Theme.of(context).textTheme.labelLarge
                ?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(flex: 3, child: Text('Token', style: style)),
              Expanded(flex: 2, child: Text('Light', style: style)),
              Expanded(flex: 2, child: Text('Dark', style: style)),
            ],
          ),
          const Divider(height: 12),
          row('Background', '#F7F9FC', '#0B0F14'),
          row('Surface', '#FFFFFF', '#131925'),
          row('Card', '#EEF2F8', '#1A2230'),
          row('Text', '#1A1F2B', '#E6EBF3'),
          row('Muted text', '#4A5568', '#B4BFCC'),
          row('Primary', '#3D5AF1', '#9DB4FF'),
          row('Signal', '#B26A00', '#F2A33C'),
          row('Verified', '#0F8A5F', '#3ECF8E'),
          row('Insight', '#4C63D6', '#9DB4FF'),
          row('Error', '#BA1A1A', '#FFB4AB'),
        ],
      ),
    );
  }
}
