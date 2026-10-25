import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../../core/authentication/auth_session.dart';
import '../../../core/configuration/app_settings.dart';
import '../../../core/security/base_url_validator.dart';
import '../../../core/synchronization/sync_controller.dart';
import '../../../shared/formatting/app_formatters.dart';
import '../../../shared/widgets/app_states.dart';
import '../data/settings_repository.dart';
import '../domain/settings_state.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final _baseUrlController = TextEditingController();
  String? _baseUrlError;

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
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
        children: [
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
                      ? 'Authenticated with your Neon Auth account.'
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
          const SizedBox(height: 14),
          OutlinedButton.icon(
            onPressed: _signOut,
            icon: const Icon(Icons.logout_rounded),
            label: const Text('Sign out'),
          ),
        ],
      ),
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
