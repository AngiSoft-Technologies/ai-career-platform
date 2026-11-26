import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../shared/formatting/app_formatters.dart';
import '../../../shared/widgets/app_background.dart';
import '../../../shared/widgets/app_states.dart';
import '../domain/saved_search.dart';
import 'recent_query_chips.dart';
import 'saved_search_controller.dart';

/// Saved searches and their alert policies. Routed by the caller — this
/// screen only talks to [SavedSearchController], so it works offline too.
class SavedSearchesScreen extends StatefulWidget {
  const SavedSearchesScreen({super.key});

  @override
  State<SavedSearchesScreen> createState() => _SavedSearchesScreenState();
}

class _SavedSearchesScreenState extends State<SavedSearchesScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<SavedSearchController>().load();
    });
  }

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<SavedSearchController>();
    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        title: const Text('Saved searches & alerts'),
        actions: [
          IconButton(
            tooltip: 'Refresh saved searches',
            
            onPressed: () => controller.load(refresh: true),
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _edit(context, controller, null),
        tooltip: 'New saved search',
        child: const Icon(Icons.add_rounded),
      ),
      body: AppBackground(
        child: switch (controller.state) {
          SavedSearchLoadState.idle || SavedSearchLoadState.loading =>
            controller.items.isEmpty
                ? const LoadingState(label: 'Loading saved searches…')
                : _list(context, controller),
          SavedSearchLoadState.error =>
            controller.items.isEmpty
                ? ErrorState(
                    message:
                        controller.errorMessage ?? 'Unable to load searches',
                    onRetry: controller.load,
                  )
                : _list(context, controller),
          SavedSearchLoadState.ready => _list(context, controller),
        },
      ),
    );
  }

  Widget _list(BuildContext context, SavedSearchController controller) {
    return RefreshIndicator(
      onRefresh: () => controller.load(refresh: true),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 96),
        children: [
          if (controller.servedFromCache)
            const Padding(
              padding: EdgeInsets.only(bottom: 12),
              child: _CachedSearchesNote(),
            ),
          RecentQueryChips(
            queries: controller.recent,
            onSelected: (query) =>
                _edit(context, controller, null, initialQuery: query),
          ),
          if (controller.recent.isNotEmpty) const SizedBox(height: 18),
          if (controller.items.isEmpty)
            const EmptyState(
              title: 'No saved searches yet',
              message: 'Save a query to get alerts when new roles appear.',
              icon: Icons.bookmark_border_rounded,
            ),
          for (final search in controller.items)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: _SavedSearchCard(
                search: search,
                alert: controller.alertFor(search.id),
                onOpen: () => controller.addRecent(search.query),
                onEdit: () => _edit(context, controller, search),
                onDelete: () => _confirmDelete(context, controller, search),
                onToggleAlerts: () => controller.toggleAlerts(search),
                onMarkSeen: () => controller.markSeen(search.id),
                onChangeCadence: (cadence) async {
                  final alert =
                      controller.alertFor(search.id) ?? search.toAlert();
                  await controller.saveAlert(alert.copyWith(cadence: cadence));
                },
                onChangeChannels: (channels) async {
                  final alert =
                      controller.alertFor(search.id) ?? search.toAlert();
                  await controller.saveAlert(
                    alert.copyWith(channels: channels),
                  );
                },
              ),
            ),
        ],
      ),
    );
  }

  Future<void> _edit(
    BuildContext context,
    SavedSearchController controller,
    SavedSearch? search, {
    String? initialQuery,
  }) async {
    final result = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (context) =>
          SavedSearchEditorSheet(search: search, initialQuery: initialQuery),
    );
    if (result == null) return;
    final cadence = result['cadence'] as AlertCadence;
    final channels = result['channels'] as AlertChannels;
    final quietHours = result['quietHours'] as AlertQuietHours;
    if (search == null) {
      await controller.create(
        name: result['name'] as String,
        query: result['query'] as String,
        country: result['country'] as String?,
        workMode: result['workMode'] as String?,
        seniority: result['seniority'] as String?,
        employmentType: result['employmentType'] as String?,
        eligibility: result['eligibility'] as String?,
        alertsEnabled: result['alertsEnabled'] as bool,
        cadence: cadence,
        channels: channels,
        quietHours: quietHours,
      );
    } else {
      await controller.update(
        search.copyWith(
          name: result['name'] as String,
          query: result['query'] as String,
          country: result['country'] as String?,
          workMode: result['workMode'] as String?,
          seniority: result['seniority'] as String?,
          employmentType: result['employmentType'] as String?,
          eligibility: result['eligibility'] as String?,
          alertsEnabled: result['alertsEnabled'] as bool,
          cadence: cadence,
          channels: channels,
          quietHours: quietHours,
        ),
      );
    }
  }

  Future<void> _confirmDelete(
    BuildContext context,
    SavedSearchController controller,
    SavedSearch search,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete saved search?'),
        content: Text('“${search.name}” and its alert will be removed.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed == true) await controller.delete(search.id);
  }
}

class _CachedSearchesNote extends StatelessWidget {
  const _CachedSearchesNote();

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Showing saved searches stored on this device',
      child: SectionCard(
        color: Theme.of(context).colorScheme.tertiaryContainer,
        child: Row(
          children: [
            const Icon(Icons.cloud_off_outlined),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                'Showing saved searches stored on this device.',
                style: Theme.of(context).textTheme.bodyMedium,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SavedSearchCard extends StatelessWidget {
  const _SavedSearchCard({
    required this.search,
    required this.alert,
    required this.onOpen,
    required this.onEdit,
    required this.onDelete,
    required this.onToggleAlerts,
    required this.onMarkSeen,
    required this.onChangeCadence,
    required this.onChangeChannels,
  });

  final SavedSearch search;
  final JobAlert? alert;
  final VoidCallback onOpen;
  final VoidCallback onEdit;
  final VoidCallback onDelete;
  final VoidCallback onToggleAlerts;
  final VoidCallback onMarkSeen;
  final ValueChanged<AlertCadence> onChangeCadence;
  final ValueChanged<AlertChannels> onChangeChannels;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Semantics(
      label: 'Saved search ${search.name}, ${search.query}',
      child: SectionCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: InkWell(
                    onTap: onOpen,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          search.name,
                          style: Theme.of(context).textTheme.titleMedium
                              ?.copyWith(fontWeight: FontWeight.w700),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          search.query.isEmpty ? 'All roles' : search.query,
                          style: Theme.of(context).textTheme.bodyMedium
                              ?.copyWith(color: scheme.onSurfaceVariant),
                        ),
                      ],
                    ),
                  ),
                ),
                if (search.newCount > 0)
                  Semantics(
                    label: '${search.newCount} new since last seen',
                    child: Badge(
                      label: Text('${search.newCount}'),
                      child: const Icon(Icons.notifications_none_rounded),
                    ),
                  ),
                IconButton(
                  tooltip: 'Edit saved search',
                  
                  onPressed: onEdit,
                  icon: const Icon(Icons.edit_outlined),
                ),
                IconButton(
                  tooltip: 'Delete saved search',
                  
                  onPressed: onDelete,
                  icon: const Icon(Icons.delete_outline_rounded),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                if (search.country != null)
                  Chip(
                    
                    label: Text(search.country!),
                    visualDensity: VisualDensity.compact,
                  ),
                if (search.workMode != null)
                  Chip(
                    
                    label: Text(search.workMode!),
                    visualDensity: VisualDensity.compact,
                  ),
                if (search.seniority != null)
                  Chip(
                    
                    label: Text(search.seniority!),
                    visualDensity: VisualDensity.compact,
                  ),
              ],
            ),
            const SizedBox(height: 8),
            SwitchListTile.adaptive(
              contentPadding: EdgeInsets.zero,
              title: const Text('Alerts on'),
              subtitle: Text(
                '${(alert ?? search.toAlert()).cadence.wireValue} · '
                '${(alert ?? search.toAlert()).lastEvaluatedAt == null ? 'Not evaluated yet' : 'Checked ${AppFormatters.relativeDate((alert ?? search.toAlert()).lastEvaluatedAt)}'}',
              ),
              value: (alert ?? search.toAlert()).enabled,
              onChanged: (_) => onToggleAlerts,
            ),
            if (search.newCount > 0)
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton.icon(
                  onPressed: onMarkSeen,
                  icon: const Icon(Icons.check_circle_outline_rounded),
                  label: const Text('Mark as seen'),
                ),
              ),
            Wrap(
              spacing: 8,
              children: [
                for (final cadence in AlertCadence.values)
                  ChoiceChip(
                    label: Text(cadence.wireValue),
                    selected: (alert ?? search.toAlert()).cadence == cadence,
                    onSelected: (_) => onChangeCadence(cadence),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              children: [
                FilterChip(
                  label: const Text('Push'),
                  selected: (alert ?? search.toAlert()).channels.push,
                  onSelected: (value) => onChangeChannels(
                    (alert ?? search.toAlert()).channels.copyWith(push: value),
                  ),
                ),
                FilterChip(
                  label: const Text('In app'),
                  selected: (alert ?? search.toAlert()).channels.inApp,
                  onSelected: (value) => onChangeChannels(
                    (alert ?? search.toAlert()).channels.copyWith(inApp: value),
                  ),
                ),
                FilterChip(
                  label: const Text('Email'),
                  selected: (alert ?? search.toAlert()).channels.email,
                  onSelected: (value) => onChangeChannels(
                    (alert ?? search.toAlert()).channels.copyWith(email: value),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// Create/edit form. Returns a plain map so the caller stays in control of
/// persistence and error messages.
class SavedSearchEditorSheet extends StatefulWidget {
  const SavedSearchEditorSheet({super.key, this.search, this.initialQuery});

  final SavedSearch? search;
  final String? initialQuery;

  @override
  State<SavedSearchEditorSheet> createState() => _SavedSearchEditorSheetState();
}

class _SavedSearchEditorSheetState extends State<SavedSearchEditorSheet> {
  late final TextEditingController _name;
  late final TextEditingController _query;
  late final TextEditingController _country;
  late final TextEditingController _workMode;
  late final TextEditingController _seniority;
  late final TextEditingController _employmentType;
  late final TextEditingController _eligibility;
  late final TextEditingController _quietStart;
  late final TextEditingController _quietEnd;
  late AlertCadence _cadence;
  late AlertChannels _channels;
  late bool _alertsEnabled;
  final _formKey = GlobalKey<FormState>();

  @override
  void initState() {
    super.initState();
    final search = widget.search;
    _name = TextEditingController(text: search?.name ?? '');
    _query = TextEditingController(
      text: search?.query ?? widget.initialQuery ?? '',
    );
    _country = TextEditingController(text: search?.country ?? '');
    _workMode = TextEditingController(text: search?.workMode ?? '');
    _seniority = TextEditingController(text: search?.seniority ?? '');
    _employmentType = TextEditingController(text: search?.employmentType ?? '');
    _eligibility = TextEditingController(text: search?.eligibility ?? '');
    _quietStart = TextEditingController(text: search?.quietHours.start ?? '');
    _quietEnd = TextEditingController(text: search?.quietHours.end ?? '');
    _cadence = search?.cadence ?? AlertCadence.daily;
    _channels = search?.channels ?? const AlertChannels();
    _alertsEnabled = search?.alertsEnabled ?? true;
  }

  @override
  void dispose() {
    for (final controller in [
      _name,
      _query,
      _country,
      _workMode,
      _seniority,
      _employmentType,
      _eligibility,
      _quietStart,
      _quietEnd,
    ]) {
      controller.dispose();
    }
    super.dispose();
  }

  String? _optional(String value) {
    final trimmed = value.trim();
    return trimmed.isEmpty ? null : trimmed;
  }

  void _save() {
    if (!_formKey.currentState!.validate()) return;
    Navigator.pop(context, <String, dynamic>{
      'name': _name.text.trim(),
      'query': _query.text.trim(),
      'country': _optional(_country.text),
      'workMode': _optional(_workMode.text),
      'seniority': _optional(_seniority.text),
      'employmentType': _optional(_employmentType.text),
      'eligibility': _optional(_eligibility.text),
      'alertsEnabled': _alertsEnabled,
      'cadence': _cadence,
      'channels': _channels,
      'quietHours': AlertQuietHours(
        start: _optional(_quietStart.text),
        end: _optional(_quietEnd.text),
      ),
    });
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(
        20,
        4,
        20,
        MediaQuery.viewInsetsOf(context).bottom + 24,
      ),
      child: Form(
        key: _formKey,
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                widget.search == null
                    ? 'New saved search'
                    : 'Edit saved search',
                style: Theme.of(context).textTheme.titleLarge
                    ?.copyWith(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 18),
              TextFormField(
                controller: _name,
                decoration: const InputDecoration(labelText: 'Name'),
                validator: (value) => value == null || value.trim().isEmpty
                    ? 'Give this search a name'
                    : null,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _query,
                decoration: const InputDecoration(
                  labelText: 'Query',
                  hintText: 'e.g. Flutter engineer remote',
                ),
                validator: (value) => value == null || value.trim().isEmpty
                    ? 'Enter what you want to be alerted about'
                    : null,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _country,
                decoration: const InputDecoration(
                  labelText: 'Country (optional)',
                ),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: TextFormField(
                      controller: _workMode,
                      decoration: const InputDecoration(
                        labelText: 'Work mode (optional)',
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextFormField(
                      controller: _seniority,
                      decoration: const InputDecoration(
                        labelText: 'Seniority (optional)',
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: TextFormField(
                      controller: _employmentType,
                      decoration: const InputDecoration(
                        labelText: 'Employment type (optional)',
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextFormField(
                      controller: _eligibility,
                      decoration: const InputDecoration(
                        labelText: 'Eligibility (optional)',
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              SwitchListTile.adaptive(
                contentPadding: EdgeInsets.zero,
                title: const Text('Job alerts'),
                subtitle: const Text('Notify me about new matches'),
                value: _alertsEnabled,
                onChanged: (value) => setState(() => _alertsEnabled = value),
              ),
              if (_alertsEnabled) ...[
                DropdownButtonFormField<AlertCadence>(
                  initialValue: _cadence,
                  decoration: const InputDecoration(labelText: 'Cadence'),
                  items: [
                    for (final cadence in AlertCadence.values)
                      DropdownMenuItem(
                        value: cadence,
                        child: Text(cadence.wireValue),
                      ),
                  ],
                  onChanged: (value) =>
                      setState(() => _cadence = value ?? AlertCadence.daily),
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  children: [
                    FilterChip(
                      label: const Text('Push'),
                      selected: _channels.push,
                      onSelected: (value) => setState(
                        () => _channels = _channels.copyWith(push: value),
                      ),
                    ),
                    FilterChip(
                      label: const Text('In app'),
                      selected: _channels.inApp,
                      onSelected: (value) => setState(
                        () => _channels = _channels.copyWith(inApp: value),
                      ),
                    ),
                    FilterChip(
                      label: const Text('Email'),
                      selected: _channels.email,
                      onSelected: (value) => setState(
                        () => _channels = _channels.copyWith(email: value),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: TextFormField(
                        controller: _quietStart,
                        decoration: const InputDecoration(
                          labelText: 'Quiet from (HH:mm)',
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: TextFormField(
                        controller: _quietEnd,
                        decoration: const InputDecoration(
                          labelText: 'Quiet until (HH:mm)',
                        ),
                      ),
                    ),
                  ],
                ),
              ],
              const SizedBox(height: 20),
              FilledButton(
                onPressed: _save,
                child: Text(
                  widget.search == null ? 'Save search' : 'Update search',
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
