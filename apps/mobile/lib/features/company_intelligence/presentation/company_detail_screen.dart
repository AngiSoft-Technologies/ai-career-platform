import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../shared/formatting/app_formatters.dart';
import '../../../shared/widgets/app_states.dart';
import '../domain/company.dart';
import 'companies_controller.dart';

/// A company: who they are, what they are hiring for, and what their
/// history adds up to.
///
/// The role list is the part a candidate actually uses — it answers "is
/// this company hiring for anything I could hold" without opening nine
/// postings.
class CompanyDetailScreen extends StatefulWidget {
  const CompanyDetailScreen({super.key, required this.slug});

  final String slug;

  @override
  State<CompanyDetailScreen> createState() => _CompanyDetailScreenState();
}

class _CompanyDetailScreenState extends State<CompanyDetailScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<CompaniesController>().open(widget.slug);
    });
  }

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<CompaniesController>();
    final detail = controller.detail;
    final state = controller.detailState;

    final Widget body;
    if (state == CompanyDetailState.idle ||
        state == CompanyDetailState.loading) {
      body = const LoadingState(label: 'Loading company…');
    } else if (state == CompanyDetailState.error) {
      body = ErrorState(
        message: controller.detailError ?? 'Unable to load this company',
        onRetry: () => controller.open(widget.slug),
      );
    } else if (detail == null) {
      body = const EmptyState(
        title: 'Company not found',
        message: 'It may have been removed from the catalogue.',
        icon: Icons.business_center_outlined,
      );
    } else {
      body = _content(context, detail);
    }

    return Scaffold(
      appBar: AppBar(title: Text(detail?.company.name ?? 'Company')),
      body: body,
    );
  }

  Widget _content(BuildContext context, CompanyDetail detail) {
    final theme = Theme.of(context);
    final company = detail.company;
    final stats = detail.stats;

    return RefreshIndicator(
      onRefresh: () => context.read<CompaniesController>().open(widget.slug),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        children: [
          SectionCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    CircleAvatar(
                      radius: 26,
                      backgroundColor: theme.colorScheme.primaryContainer,
                      foregroundColor: theme.colorScheme.onPrimaryContainer,
                      child: Text(
                        _initials(company.name),
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            company.name,
                            style: theme.textTheme.titleLarge?.copyWith(
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          Text(
                            company.subtitle,
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: theme.colorScheme.onSurfaceVariant,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                if (company.website != null && company.website!.isNotEmpty) ...[
                  const SizedBox(height: 14),
                  OutlinedButton.icon(
                    onPressed: () => _open(company.website!),
                    icon: const Icon(Icons.public_rounded),
                    label: const Text('Company website'),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _StatTile(
                  label: 'Live roles',
                  value: '${company.openRoles}',
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _StatTile(
                  label: 'New this week',
                  value: '${stats.last7Days}',
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _StatTile(
                  label: 'Countries',
                  value: '${stats.countries}',
                ),
              ),
            ],
          ),
          const SizedBox(height: 20),
          Text(
            'Roles',
            style: theme.textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 10),
          if (detail.roles.isEmpty)
            const EmptyState(
              title: 'No live roles',
              message: 'This company has no active roles in the catalogue right now.',
              icon: Icons.work_off_outlined,
            )
          else
            for (final role in detail.roles)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: _RoleCard(
                  role: role,
                  onTap: () => context.push('/opportunities/${role.id}'),
                ),
              ),
        ],
      ),
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

  Future<void> _open(String value) async {
    final uri = Uri.tryParse(value);
    if (uri == null) return;
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }
}

class _StatTile extends StatelessWidget {
  const _StatTile({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SectionCard(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            value,
            style: theme.textTheme.headlineSmall?.copyWith(
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: theme.textTheme.labelSmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ],
      ),
    );
  }
}

class _RoleCard extends StatelessWidget {
  const _RoleCard({required this.role, required this.onTap});

  final CompanyRole role;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final meta = <String>[
      if (role.country != null && role.country!.isNotEmpty) role.country!,
      if (role.workMode != null && role.workMode!.isNotEmpty)
        _title(role.workMode!),
      if (role.postedAt != null) AppFormatters.relativeDate(role.postedAt),
    ];
    return SectionCard(
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            role.title,
            style: theme.textTheme.titleSmall?.copyWith(
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            meta.join(' · '),
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
          if (role.salaryMin != null || role.salaryMax != null) ...[
            const SizedBox(height: 6),
            Text(
              AppFormatters.salary(
                minimum: role.salaryMin,
                maximum: role.salaryMax,
                currency: role.currency,
              ),
              style: theme.textTheme.labelMedium?.copyWith(
                fontWeight: FontWeight.w700,
                color: theme.colorScheme.primary,
              ),
            ),
          ],
        ],
      ),
    );
  }

  String _title(String value) {
    if (value.isEmpty) return value;
    return '${value[0].toUpperCase()}${value.substring(1)}';
  }
}
