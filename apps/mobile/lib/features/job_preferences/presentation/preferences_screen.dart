import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../shared/widgets/app_states.dart';
import '../domain/job_preferences.dart';
import 'preferences_controller.dart';

class PreferencesScreen extends StatefulWidget {
  const PreferencesScreen({super.key});

  @override
  State<PreferencesScreen> createState() => _PreferencesScreenState();
}

class _PreferencesScreenState extends State<PreferencesScreen> {
  final _formKey = GlobalKey<FormState>();
  final _countries = TextEditingController();
  final _locations = TextEditingController();
  final _roles = TextEditingController();
  final _salary = TextEditingController();
  String _seniority = 'junior';
  String _currency = 'KES';
  bool _remoteOnly = false;
  bool _relocate = false;
  bool _notifications = true;
  bool _initialized = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<PreferencesController>().load();
    });
  }

  @override
  void dispose() {
    _countries.dispose();
    _locations.dispose();
    _roles.dispose();
    _salary.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<PreferencesController>();
    if (controller.state == PreferencesLoadState.ready && !_initialized) {
      _apply(controller.preferences);
    }
    return Scaffold(
      appBar: AppBar(title: const Text('Job preferences')),
      body: switch (controller.state) {
        PreferencesLoadState.idle || PreferencesLoadState.loading =>
          const LoadingState(label: 'Loading preferences…'),
        PreferencesLoadState.error => ErrorState(
          message: controller.errorMessage ?? 'Unable to load job preferences',
          onRetry: controller.load,
        ),
        PreferencesLoadState.ready ||
        PreferencesLoadState.saving => _form(context, controller),
      },
    );
  }

  Widget _form(BuildContext context, PreferencesController controller) {
    return Form(
      key: _formKey,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
        children: [
          SectionCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Target opportunities',
                  style: Theme.of(context).textTheme.titleMedium
                      ?.copyWith(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 14),
                TextFormField(
                  controller: _roles,
                  decoration: const InputDecoration(
                    labelText: 'Preferred roles',
                    helperText: 'Separate roles with commas',
                  ),
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _countries,
                  decoration: const InputDecoration(
                    labelText: 'Preferred countries',
                    helperText: 'Separate countries with commas',
                  ),
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _locations,
                  decoration: const InputDecoration(
                    labelText: 'Preferred locations',
                    helperText: 'Separate locations with commas',
                  ),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: _seniority,
                  decoration: const InputDecoration(
                    labelText: 'Desired seniority',
                  ),
                  items: const [
                    DropdownMenuItem(value: 'intern', child: Text('Intern')),
                    DropdownMenuItem(value: 'junior', child: Text('Junior')),
                    DropdownMenuItem(value: 'mid', child: Text('Mid-level')),
                    DropdownMenuItem(value: 'senior', child: Text('Senior')),
                    DropdownMenuItem(value: 'lead', child: Text('Lead')),
                  ],
                  onChanged: (value) =>
                      setState(() => _seniority = value ?? 'junior'),
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
                  'Compensation and mobility',
                  style: Theme.of(context).textTheme.titleMedium
                      ?.copyWith(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 14),
                TextFormField(
                  controller: _salary,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: 'Minimum salary',
                    prefixIcon: Icon(Icons.payments_outlined),
                  ),
                  validator: (value) {
                    if (value == null || value.trim().isEmpty) return null;
                    final salary = int.tryParse(value.trim());
                    if (salary == null || salary < 0) {
                      return 'Enter a valid minimum salary';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: _currency,
                  decoration: const InputDecoration(labelText: 'Currency'),
                  items: const [
                    DropdownMenuItem(value: 'KES', child: Text('KES')),
                    DropdownMenuItem(value: 'USD', child: Text('USD')),
                    DropdownMenuItem(value: 'EUR', child: Text('EUR')),
                    DropdownMenuItem(value: 'GBP', child: Text('GBP')),
                  ],
                  onChanged: (value) =>
                      setState(() => _currency = value ?? 'KES'),
                ),
                const SizedBox(height: 8),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Remote opportunities only'),
                  value: _remoteOnly,
                  onChanged: (value) => setState(() => _remoteOnly = value),
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Willing to relocate'),
                  value: _relocate,
                  onChanged: (value) => setState(() => _relocate = value),
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Notifications enabled'),
                  value: _notifications,
                  onChanged: (value) => setState(() => _notifications = value),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          FilledButton(
            onPressed: controller.state == PreferencesLoadState.saving
                ? null
                : _save,
            child: controller.state == PreferencesLoadState.saving
                ? const SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('Save preferences'),
          ),
        ],
      ),
    );
  }

  void _apply(JobPreferences preferences) {
    _initialized = true;
    _countries.text = preferences.preferredCountries.join(', ');
    _locations.text = preferences.preferredLocations.join(', ');
    _roles.text = preferences.preferredRoles.join(', ');
    _salary.text = preferences.minSalary?.toString() ?? '';
    _seniority = preferences.desiredSeniority;
    _currency = preferences.currency;
    _remoteOnly = preferences.remoteOnly;
    _relocate = preferences.willingToRelocate;
    _notifications = preferences.notificationsEnabled;
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    final salary = _salary.text.trim().isEmpty
        ? null
        : int.tryParse(_salary.text.trim());
    final success = await context.read<PreferencesController>().save(
      JobPreferences(
        preferredCountries: _list(_countries.text),
        preferredLocations: _list(_locations.text),
        preferredRoles: _list(_roles.text),
        desiredSeniority: _seniority,
        minSalary: salary,
        currency: _currency,
        remoteOnly: _remoteOnly,
        willingToRelocate: _relocate,
        notificationsEnabled: _notifications,
      ),
    );
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          success ? 'Preferences saved.' : 'Could not save preferences.',
        ),
      ),
    );
  }

  List<String> _list(String value) {
    return value
        .split(',')
        .map((item) => item.trim())
        .where((item) => item.isNotEmpty)
        .toList();
  }
}
