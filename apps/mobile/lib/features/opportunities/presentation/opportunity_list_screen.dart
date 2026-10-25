import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../../shared/formatting/app_formatters.dart';
import '../../../shared/widgets/app_states.dart';
import '../../../shared/widgets/match_score_badge.dart';
import '../domain/opportunity.dart';
import 'opportunity_controller.dart';

class OpportunityListScreen extends StatefulWidget {
  const OpportunityListScreen({super.key});

  @override
  State<OpportunityListScreen> createState() => _OpportunityListScreenState();
}

class _OpportunityListScreenState extends State<OpportunityListScreen> {
  final _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<OpportunityController>().load();
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<OpportunityController>();
    return Scaffold(
      appBar: AppBar(
        title: const Text('Opportunities'),
        actions: [
          IconButton(
            tooltip: controller.showSavedOnly
                ? 'Show all opportunities'
                : 'Show saved opportunities',
            onPressed: () =>
                controller.load(showSavedOnly: !controller.showSavedOnly),
            icon: Icon(
              controller.showSavedOnly
                  ? Icons.bookmark_rounded
                  : Icons.bookmark_border_rounded,
            ),
          ),
          IconButton(
            tooltip: 'Filters',
            onPressed: () => _showFilters(context, controller),
            icon: const Icon(Icons.tune_rounded),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
            child: TextField(
              controller: _searchController,
              textInputAction: TextInputAction.search,
              onSubmitted: (value) => controller.searchNow(query: value),
              decoration: InputDecoration(
                hintText: 'Search role, skill, or company',
                prefixIcon: const Icon(Icons.search_rounded),
                suffixIcon: IconButton(
                  tooltip: 'Search',
                  onPressed: () =>
                      controller.searchNow(query: _searchController.text),
                  icon: const Icon(Icons.arrow_forward_rounded),
                ),
              ),
            ),
          ),
          Expanded(child: _body(context, controller)),
        ],
      ),
    );
  }

  Widget _body(BuildContext context, OpportunityController controller) {
    if (controller.state == OpportunityLoadState.loading &&
        controller.items.isEmpty) {
      return const LoadingState(label: 'Finding relevant opportunities…');
    }
    if (controller.state == OpportunityLoadState.error &&
        controller.items.isEmpty) {
      return ErrorState(
        message: controller.errorMessage ?? 'Unable to load opportunities',
        onRetry: controller.refresh,
      );
    }
    if (controller.items.isEmpty) {
      return EmptyState(
        title: controller.showSavedOnly
            ? 'No saved jobs yet'
            : 'No opportunities found',
        message: controller.showSavedOnly
            ? 'Bookmark a role to keep it available here.'
            : 'Try removing a filter or broadening your search.',
        icon: Icons.search_off_rounded,
      );
    }
    return RefreshIndicator(
      onRefresh: controller.refresh,
      child: ListView.separated(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
        itemCount: controller.items.length + 1,
        separatorBuilder: (_, index) => const SizedBox(height: 12),
        itemBuilder: (context, index) {
          if (index == 0) {
            return Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Text(
                '${controller.items.length} opportunities',
                style: Theme.of(context).textTheme.labelLarge?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
            );
          }
          final opportunity = controller.items[index - 1];
          return _OpportunityCard(
            opportunity: opportunity,
            isSaved: controller.savedIds.contains(opportunity.id),
            onTap: () => context.push('/opportunities/${opportunity.id}'),
            onSave: () => controller.toggleSaved(opportunity),
          );
        },
      ),
    );
  }

  Future<void> _showFilters(
    BuildContext context,
    OpportunityController controller,
  ) async {
    var country = controller.search.country ?? '';
    var workMode = controller.search.workMode;
    var seniority = controller.search.seniority;
    var semantic = controller.search.semantic;
    final countryController = TextEditingController(text: country);
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (sheetContext) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            return Padding(
              padding: EdgeInsets.fromLTRB(
                20,
                4,
                20,
                MediaQuery.viewInsetsOf(context).bottom + 24,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'Filter opportunities',
                    style: Theme.of(context).textTheme.titleLarge
                        ?.copyWith(fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 18),
                  TextField(
                    controller: countryController,
                    onChanged: (value) => country = value,
                    decoration: const InputDecoration(
                      labelText: 'Country',
                      prefixIcon: Icon(Icons.public_rounded),
                    ),
                  ),
                  const SizedBox(height: 14),
                  DropdownButtonFormField<String?>(
                    initialValue: workMode,
                    decoration: const InputDecoration(
                      labelText: 'Work mode',
                      prefixIcon: Icon(Icons.work_outline_rounded),
                    ),
                    items: const [
                      DropdownMenuItem(
                        value: null,
                        child: Text('Any work mode'),
                      ),
                      DropdownMenuItem(value: 'remote', child: Text('Remote')),
                      DropdownMenuItem(value: 'hybrid', child: Text('Hybrid')),
                      DropdownMenuItem(value: 'onsite', child: Text('On-site')),
                    ],
                    onChanged: (value) => setModalState(() => workMode = value),
                  ),
                  const SizedBox(height: 14),
                  DropdownButtonFormField<String?>(
                    initialValue: seniority,
                    decoration: const InputDecoration(
                      labelText: 'Seniority',
                      prefixIcon: Icon(Icons.signal_cellular_alt_rounded),
                    ),
                    items: const [
                      DropdownMenuItem(
                        value: null,
                        child: Text('Any seniority'),
                      ),
                      DropdownMenuItem(value: 'intern', child: Text('Intern')),
                      DropdownMenuItem(value: 'junior', child: Text('Junior')),
                      DropdownMenuItem(value: 'mid', child: Text('Mid-level')),
                      DropdownMenuItem(value: 'senior', child: Text('Senior')),
                      DropdownMenuItem(value: 'lead', child: Text('Lead')),
                    ],
                    onChanged: (value) =>
                        setModalState(() => seniority = value),
                  ),
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Semantic ranking'),
                    subtitle: const Text(
                      'Blend role and skill meaning into the ranking',
                    ),
                    value: semantic,
                    onChanged: (value) => setModalState(() => semantic = value),
                  ),
                  const SizedBox(height: 12),
                  FilledButton(
                    onPressed: () {
                      controller.searchNow(
                        country: country,
                        workMode: workMode,
                        seniority: seniority,
                        semantic: semantic,
                      );
                      Navigator.pop(sheetContext);
                    },
                    child: const Text('Apply filters'),
                  ),
                ],
              ),
            );
          },
        );
      },
    );
    countryController.dispose();
  }
}

class _OpportunityCard extends StatelessWidget {
  const _OpportunityCard({
    required this.opportunity,
    required this.isSaved,
    required this.onTap,
    required this.onSave,
  });

  final Opportunity opportunity;
  final bool isSaved;
  final VoidCallback onTap;
  final VoidCallback onSave;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: '${opportunity.title} at ${opportunity.companyName}',
      child: Card(
        margin: EdgeInsets.zero,
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Text(
                        opportunity.title,
                        style: Theme.of(context).textTheme.titleMedium
                            ?.copyWith(fontWeight: FontWeight.w700),
                      ),
                    ),
                    IconButton(
                      tooltip: isSaved ? 'Remove bookmark' : 'Save opportunity',
                      onPressed: onSave,
                      icon: Icon(
                        isSaved
                            ? Icons.bookmark_rounded
                            : Icons.bookmark_border_rounded,
                      ),
                    ),
                  ],
                ),
                Text(
                  opportunity.companyName,
                  style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                    color: Theme.of(context).colorScheme.primary,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 12,
                  runSpacing: 6,
                  children: [
                    _Metadata(
                      icon: Icons.location_on_outlined,
                      value: opportunity.locationLabel,
                    ),
                    _Metadata(
                      icon: Icons.payments_outlined,
                      value: AppFormatters.salary(
                        minimum: opportunity.salaryMin,
                        maximum: opportunity.salaryMax,
                        currency: opportunity.currency,
                      ),
                    ),
                    _Metadata(
                      icon: Icons.schedule_rounded,
                      value: AppFormatters.relativeDate(opportunity.postedAt),
                    ),
                  ],
                ),
                if (opportunity.skills.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 7,
                    runSpacing: 7,
                    children: opportunity.skills
                        .take(4)
                        .map((skill) => Chip(label: Text(skill)))
                        .toList(),
                  ),
                ],
                if (opportunity.match != null) ...[
                  const SizedBox(height: 12),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: MatchScoreBadge(score: opportunity.match!.score),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Metadata extends StatelessWidget {
  const _Metadata({required this.icon, required this.value});

  final IconData icon;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(
          icon,
          size: 16,
          color: Theme.of(context).colorScheme.onSurfaceVariant,
        ),
        const SizedBox(width: 5),
        ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 190),
          child: Text(
            value,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ),
      ],
    );
  }
}
