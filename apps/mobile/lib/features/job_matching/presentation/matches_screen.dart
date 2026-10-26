import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../../shared/formatting/app_formatters.dart';
import '../../../shared/widgets/app_states.dart';
import '../../../shared/widgets/match_score_badge.dart';
import '../../opportunities/domain/opportunity.dart';
import '../data/match_repository.dart';

class MatchesScreen extends StatefulWidget {
  const MatchesScreen({super.key});

  @override
  State<MatchesScreen> createState() => _MatchesScreenState();
}

class _MatchesScreenState extends State<MatchesScreen> {
  late Future<List<Opportunity>> _matches;

  @override
  void initState() {
    super.initState();
    _matches = context.read<MatchRepository>().listMatches();
  }

  Future<void> _refresh() {
    final request = context.read<MatchRepository>().listMatches();
    setState(() => _matches = request);
    return request.then((_) {});
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Your matches'),
        actions: [
          IconButton(
            tooltip: 'Refresh matches',
            onPressed: _refresh,
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: FutureBuilder<List<Opportunity>>(
        future: _matches,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting &&
              !snapshot.hasData) {
            return const LoadingState(label: 'Finding roles that fit…');
          }
          if (snapshot.hasError && !snapshot.hasData) {
            return ErrorState(
              message: 'Could not load your matches. Check your connection and try again.',
              onRetry: _refresh,
            );
          }
          final items = snapshot.data ?? const <Opportunity>[];
          if (items.isEmpty) {
            return const EmptyState(
              title: 'No matches yet',
              message: 'Add skills, experience and role preferences to your profile, then check again.',
              icon: Icons.auto_awesome_outlined,
            );
          }
          return RefreshIndicator(
            onRefresh: _refresh,
            child: ListView.separated(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 28),
              itemCount: items.length + 1,
              separatorBuilder: (_, index) => const SizedBox(height: 12),
              itemBuilder: (context, index) {
                if (index == 0) {
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 2),
                    child: Text(
                      'Ranked by your profile and preferences',
                      style: Theme.of(context).textTheme.bodyMedium
                          ?.copyWith(color: colors.onSurfaceVariant),
                    ),
                  );
                }
                final opportunity = items[index - 1];
                return _MatchCard(
                  opportunity: opportunity,
                  onTap: () => context.push('/opportunities/${opportunity.id}'),
                );
              },
            ),
          );
        },
      ),
    );
  }
}

class _MatchCard extends StatelessWidget {
  const _MatchCard({required this.opportunity, required this.onTap});

  final Opportunity opportunity;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final score = opportunity.match?.score ?? 0;
    final location = opportunity.locationLabel;
    final salary = AppFormatters.salary(
      minimum: opportunity.salaryMin,
      maximum: opportunity.salaryMax,
      currency: opportunity.currency,
    );
    return Card(
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
                  CircleAvatar(
                    backgroundColor: colors.primaryContainer,
                    foregroundColor: colors.onPrimaryContainer,
                    child: Text(_initials(opportunity.companyName)),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          opportunity.title,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context).textTheme.titleMedium
                              ?.copyWith(fontWeight: FontWeight.w800),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          '${opportunity.companyName} · $location',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context).textTheme.bodySmall
                              ?.copyWith(color: colors.onSurfaceVariant),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  MatchScoreBadge(score: score),
                ],
              ),
              if (opportunity.match?.explanation.isNotEmpty ?? false) ...[
                const SizedBox(height: 12),
                Text(
                  opportunity.match!.explanation,
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
              ],
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  _MetaChip(
                    icon: Icons.work_outline_rounded,
                    label: opportunity.workMode,
                  ),
                  _MetaChip(icon: Icons.payments_outlined, label: salary),
                  if (opportunity.postedAt != null)
                    _MetaChip(
                      icon: Icons.schedule_rounded,
                      label: AppFormatters.relativeDate(opportunity.postedAt!),
                    ),
                ],
              ),
              Align(
                alignment: Alignment.centerRight,
                child: TextButton.icon(
                  onPressed: onTap,
                  icon: const Icon(Icons.arrow_forward_rounded, size: 18),
                  label: const Text('Review role'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _initials(String value) {
    final parts = value
        .trim()
        .split(RegExp(r'\s+'))
        .where((part) => part.isNotEmpty);
    return parts.take(2).map((part) => part[0].toUpperCase()).join();
  }
}

class _MetaChip extends StatelessWidget {
  const _MetaChip({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Chip(
      avatar: Icon(icon, size: 16),
      label: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis),
      visualDensity: VisualDensity.compact,
    );
  }
}
