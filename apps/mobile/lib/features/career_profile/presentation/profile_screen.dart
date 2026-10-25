import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../../shared/widgets/app_states.dart';
import '../../career_intelligence/presentation/career_intelligence_controller.dart';
import '../../career_intelligence/presentation/career_intelligence_panel.dart';
import '../domain/candidate_profile.dart';
import 'profile_controller.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<ProfileController>().load();
      context.read<CareerIntelligenceController>().load();
    });
  }

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<ProfileController>();
    final insights = context.watch<CareerIntelligenceController>();
    return Scaffold(
      appBar: AppBar(
        title: const Text('Career profile'),
        actions: [
          IconButton(
            tooltip: 'Settings',
            onPressed: () => context.push('/settings'),
            icon: const Icon(Icons.settings_outlined),
          ),
          IconButton(
            tooltip: 'Refresh profile',
            onPressed: () {
              controller.load();
              insights.load();
            },
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: switch (controller.state) {
        ProfileLoadState.idle ||
        ProfileLoadState.loading ||
        ProfileLoadState.saving => const LoadingState(
          label: 'Loading your profile…',
        ),
        ProfileLoadState.error => ErrorState(
          message: controller.errorMessage ?? 'Unable to load your profile',
          onRetry: controller.load,
        ),
        ProfileLoadState.ready => _content(
          context,
          controller.profile!,
          insights,
        ),
      },
    );
  }

  Widget _content(
    BuildContext context,
    CandidateProfile profile,
    CareerIntelligenceController insights,
  ) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
      children: [
        Row(
          children: [
            CircleAvatar(
              radius: 32,
              backgroundColor: Theme.of(context).colorScheme.primaryContainer,
              foregroundColor: Theme.of(context).colorScheme.onPrimaryContainer,
              child: Text(
                _initials(profile.fullName),
                style: Theme.of(context).textTheme.titleLarge
                    ?.copyWith(fontWeight: FontWeight.w800),
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    profile.fullName.isEmpty
                        ? 'Your profile'
                        : profile.fullName,
                    style: Theme.of(context).textTheme.titleLarge
                        ?.copyWith(fontWeight: FontWeight.w800),
                  ),
                  Text(
                    profile.headline.isEmpty
                        ? 'Add a professional headline'
                        : profile.headline,
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            ),
            IconButton.filledTonal(
              tooltip: 'Edit profile',
              onPressed: () => _editProfile(context, profile),
              icon: const Icon(Icons.edit_rounded),
            ),
          ],
        ),
        const SizedBox(height: 18),
        SectionCard(
          child: Column(
            children: [
              _ProfileRow(
                icon: Icons.location_on_outlined,
                label: 'Location',
                value: profile.location.isEmpty ? 'Not set' : profile.location,
              ),
              _ProfileRow(
                icon: Icons.public_rounded,
                label: 'Country',
                value: profile.country.isEmpty ? 'Not set' : profile.country,
              ),
              _ProfileRow(
                icon: Icons.work_history_outlined,
                label: 'Experience',
                value: '${profile.yearsExperience} years',
              ),
              _ProfileRow(
                icon: Icons.signal_cellular_alt_rounded,
                label: 'Seniority',
                value: profile.seniority,
              ),
              _ProfileRow(
                icon: Icons.home_work_outlined,
                label: 'Remote preferred',
                value: profile.remotePreferred ? 'Yes' : 'No',
              ),
            ],
          ),
        ),
        if (profile.summary.isNotEmpty) ...[
          const SizedBox(height: 14),
          SectionCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Professional summary',
                  style: Theme.of(context).textTheme.titleMedium
                      ?.copyWith(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 8),
                Text(profile.summary),
              ],
            ),
          ),
        ],
        if (profile.skills.isNotEmpty) ...[
          const SizedBox(height: 14),
          SectionCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Skills',
                  style: Theme.of(context).textTheme.titleMedium
                      ?.copyWith(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: profile.skills
                      .map((skill) => Chip(label: Text(skill)))
                      .toList(),
                ),
              ],
            ),
          ),
        ],
        if (profile.desiredRoles.isNotEmpty) ...[
          const SizedBox(height: 14),
          SectionCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Target roles',
                  style: Theme.of(context).textTheme.titleMedium
                      ?.copyWith(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: profile.desiredRoles
                      .map(
                        (role) => Chip(
                          avatar: const Icon(Icons.flag_outlined),
                          label: Text(role),
                        ),
                      )
                      .toList(),
                ),
              ],
            ),
          ),
        ],
        const SizedBox(height: 14),
        OutlinedButton.icon(
          onPressed: () => context.push('/preferences'),
          icon: const Icon(Icons.tune_rounded),
          label: const Text('Job preferences'),
        ),
        const SizedBox(height: 14),
        if (insights.state == CareerInsightState.loading ||
            insights.state == CareerInsightState.idle)
          const SectionCard(child: LinearProgressIndicator())
        else if (insights.state == CareerInsightState.error)
          SectionCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  insights.errorMessage ?? 'Career insights are unavailable.',
                ),
                const SizedBox(height: 8),
                TextButton(
                  onPressed: insights.load,
                  child: const Text('Try again'),
                ),
              ],
            ),
          )
        else if (insights.insights != null)
          CareerIntelligencePanel(insights: insights.insights!),
      ],
    );
  }

  Future<void> _editProfile(
    BuildContext context,
    CandidateProfile profile,
  ) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (context) => _ProfileEditor(profile: profile),
    );
  }

  String _initials(String name) {
    final parts = name
        .trim()
        .split(RegExp(r'\s+'))
        .where((part) => part.isNotEmpty)
        .toList();
    if (parts.isEmpty) return '?';
    if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
    return '${parts.first[0]}${parts.last[0]}'.toUpperCase();
  }
}

class _ProfileEditor extends StatefulWidget {
  const _ProfileEditor({required this.profile});

  final CandidateProfile profile;

  @override
  State<_ProfileEditor> createState() => _ProfileEditorState();
}

class _ProfileEditorState extends State<_ProfileEditor> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _fullName;
  late final TextEditingController _headline;
  late final TextEditingController _summary;
  late final TextEditingController _location;
  late final TextEditingController _country;
  late final TextEditingController _years;
  late final TextEditingController _skills;
  late final TextEditingController _roles;
  late String _seniority;
  late bool _remotePreferred;

  @override
  void initState() {
    super.initState();
    _fullName = TextEditingController(text: widget.profile.fullName);
    _headline = TextEditingController(text: widget.profile.headline);
    _summary = TextEditingController(text: widget.profile.summary);
    _location = TextEditingController(text: widget.profile.location);
    _country = TextEditingController(text: widget.profile.country);
    _years = TextEditingController(
      text: widget.profile.yearsExperience.toString(),
    );
    _skills = TextEditingController(text: widget.profile.skills.join(', '));
    _roles = TextEditingController(
      text: widget.profile.desiredRoles.join(', '),
    );
    _seniority = widget.profile.seniority;
    _remotePreferred = widget.profile.remotePreferred;
  }

  @override
  void dispose() {
    _fullName.dispose();
    _headline.dispose();
    _summary.dispose();
    _location.dispose();
    _country.dispose();
    _years.dispose();
    _skills.dispose();
    _roles.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.92,
      minChildSize: 0.6,
      maxChildSize: 0.96,
      builder: (context, scrollController) {
        return Form(
          key: _formKey,
          child: ListView(
            controller: scrollController,
            padding: EdgeInsets.fromLTRB(
              20,
              4,
              20,
              MediaQuery.viewInsetsOf(context).bottom + 24,
            ),
            children: [
              Text(
                'Edit career profile',
                style: Theme.of(context).textTheme.titleLarge
                    ?.copyWith(fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 18),
              TextFormField(
                controller: _fullName,
                decoration: const InputDecoration(labelText: 'Full name'),
                validator: _required,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _headline,
                decoration: const InputDecoration(labelText: 'Headline'),
                validator: _required,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _summary,
                minLines: 3,
                maxLines: 6,
                decoration: const InputDecoration(
                  labelText: 'Professional summary',
                ),
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _location,
                decoration: const InputDecoration(labelText: 'Location'),
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _country,
                decoration: const InputDecoration(labelText: 'Country'),
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _years,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'Years of experience',
                ),
                validator: (value) {
                  final years = int.tryParse(value ?? '');
                  if (years == null || years < 0 || years > 60) {
                    return 'Enter 0 to 60 years';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: _seniority,
                decoration: const InputDecoration(labelText: 'Seniority'),
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
              const SizedBox(height: 12),
              TextFormField(
                controller: _skills,
                decoration: const InputDecoration(
                  labelText: 'Skills',
                  helperText: 'Separate skills with commas',
                ),
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _roles,
                decoration: const InputDecoration(
                  labelText: 'Desired roles',
                  helperText: 'Separate roles with commas',
                ),
              ),
              const SizedBox(height: 8),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Remote preferred'),
                value: _remotePreferred,
                onChanged: (value) => setState(() => _remotePreferred = value),
              ),
              const SizedBox(height: 16),
              FilledButton(onPressed: _save, child: const Text('Save profile')),
            ],
          ),
        );
      },
    );
  }

  String? _required(String? value) {
    return value == null || value.trim().isEmpty
        ? 'This field is required'
        : null;
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    final messenger = ScaffoldMessenger.of(context);
    final success = await context.read<ProfileController>().save({
      'fullName': _fullName.text.trim(),
      'headline': _headline.text.trim(),
      'summary': _summary.text.trim(),
      'location': _location.text.trim(),
      'country': _country.text.trim(),
      'yearsExperience': int.parse(_years.text),
      'seniority': _seniority,
      'skills': _list(_skills.text),
      'desiredRoles': _list(_roles.text),
      'remotePreferred': _remotePreferred,
    });
    if (!mounted) return;
    if (success) {
      Navigator.pop(context);
      messenger.showSnackBar(const SnackBar(content: Text('Profile updated.')));
    }
  }

  List<String> _list(String value) {
    return value
        .split(',')
        .map((item) => item.trim())
        .where((item) => item.isNotEmpty)
        .toList();
  }
}

class _ProfileRow extends StatelessWidget {
  const _ProfileRow({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          Icon(icon, size: 20, color: Theme.of(context).colorScheme.primary),
          const SizedBox(width: 12),
          Expanded(child: Text(label)),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}
