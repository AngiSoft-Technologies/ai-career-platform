import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../../shared/widgets/app_states.dart';
import '../domain/company.dart';
import 'companies_controller.dart';

/// Every company the catalogue has a live role for.
///
/// The web has browsed employers since the catalogue learned which
/// company posts which role; the mobile app could only show the company
/// behind one opportunity. This is the same list — sorted by open roles,
/// filterable as you type, and cached so it opens without a connection.
class CompanyListScreen extends StatefulWidget {
  const CompanyListScreen({super.key});

  @override
  State<CompanyListScreen> createState() => _CompanyListScreenState();
}

class _CompanyListScreenState extends State<CompanyListScreen> {
  final _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<CompaniesController>().load();
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<CompaniesController>();
    return Scaffold(
      appBar: AppBar(
        title: Image.asset(
          'assets/branding/logo_wordmark.png',
          height: 24,
          fit: BoxFit.contain,
          filterQuality: FilterQuality.high,
        ),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
            child: TextField(
              controller: _searchController,
              textInputAction: TextInputAction.search,
              onChanged: controller.updateSearch,
              decoration: InputDecoration(
                hintText: 'Filter by company, industry, or country',
                prefixIcon: const Icon(Icons.search_rounded),
                suffixIcon: controller.search.isEmpty
                    ? null
                    : IconButton(
                        tooltip: 'Clear filter',
                        onPressed: () {
                          _searchController.clear();
                          controller.updateSearch('');
                        },
                        icon: const Icon(Icons.close_rounded),
                      ),
              ),
            ),
          ),
          Expanded(child: _body(context, controller)),
        ],
      ),
    );
  }

  Widget _body(BuildContext context, CompaniesController controller) {
    if (controller.listState == CompaniesLoadState.loading &&
        controller.companies.isEmpty) {
      return const LoadingState(label: 'Loading companies hiring now…');
    }
    if (controller.listState == CompaniesLoadState.error &&
        controller.companies.isEmpty) {
      return ErrorState(
        message: controller.errorMessage ?? 'Unable to load companies',
        onRetry: controller.load,
      );
    }
    if (controller.companies.isEmpty) {
      return EmptyState(
        title: controller.search.isEmpty
            ? 'No companies yet'
            : 'No companies match “${controller.search}”',
        message: controller.search.isEmpty
            ? 'Companies appear here as soon as the catalogue verifies a live role for them.'
            : 'Try a shorter name, or an industry.',
        icon: Icons.business_center_outlined,
      );
    }
    return RefreshIndicator(
      onRefresh: controller.load,
      child: ListView.separated(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
        itemCount: controller.companies.length + 1,
        separatorBuilder: (_, index) => const SizedBox(height: 12),
        itemBuilder: (context, index) {
          if (index == 0) {
            return Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Text(
                '${controller.companies.length} companies',
                style: Theme.of(context).textTheme.labelLarge?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
            );
          }
          final company = controller.companies[index - 1];
          return _CompanyListCard(
            company: company,
            onTap: () => context.push('/companies/${company.slug}'),
          );
        },
      ),
    );
  }
}

class _CompanyListCard extends StatelessWidget {
  const _CompanyListCard({required this.company, required this.onTap});

  final Company company;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SectionCard(
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              CircleAvatar(
                backgroundColor: theme.colorScheme.primaryContainer,
                foregroundColor: theme.colorScheme.onPrimaryContainer,
                child: Text(
                  _initials(company.name),
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      company.name,
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w700,
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
              if (company.isHiringNow)
                Chip(
                  label: Text('+${company.newThisWeek} this week'),
                  visualDensity: VisualDensity.compact,
                  backgroundColor: theme.colorScheme.secondaryContainer,
                  labelStyle: theme.textTheme.labelSmall?.copyWith(
                    color: theme.colorScheme.onSecondaryContainer,
                    fontWeight: FontWeight.w700,
                  ),
                ),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              _CountPill(
                icon: Icons.work_outline_rounded,
                value:
                    '${company.openRoles} open role${company.openRoles == 1 ? '' : 's'}',
              ),
              const Spacer(),
              const Icon(Icons.chevron_right_rounded),
            ],
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
}

class _CountPill extends StatelessWidget {
  const _CountPill({required this.icon, required this.value});

  final IconData icon;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(999),
        color: theme.colorScheme.surfaceContainerHighest,
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: theme.colorScheme.onSurfaceVariant),
          const SizedBox(width: 6),
          Text(
            value,
            style: theme.textTheme.labelMedium?.copyWith(
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}
