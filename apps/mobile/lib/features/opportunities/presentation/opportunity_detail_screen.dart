import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../shared/formatting/app_formatters.dart';
import '../../../shared/widgets/app_states.dart';
import '../../applications/presentation/application_controller.dart';
import '../../company_intelligence/data/company_intelligence_repository.dart';
import '../../company_intelligence/presentation/company_intelligence_card.dart';
import '../../job_matching/data/match_repository.dart';
import '../../job_matching/presentation/match_panel.dart';
import '../domain/opportunity.dart';
import 'opportunity_controller.dart';

class OpportunityDetailScreen extends StatefulWidget {
  const OpportunityDetailScreen({super.key, required this.opportunityId});

  final String opportunityId;

  @override
  State<OpportunityDetailScreen> createState() =>
      _OpportunityDetailScreenState();
}

class _OpportunityDetailScreenState extends State<OpportunityDetailScreen> {
  late Future<Opportunity> _opportunity;
  bool _isAdding = false;

  @override
  void initState() {
    super.initState();
    _opportunity = context.read<OpportunityController>().getOpportunity(
      widget.opportunityId,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Opportunity')),
      body: FutureBuilder<Opportunity>(
        future: _opportunity,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const LoadingState(label: 'Loading opportunity…');
          }
          if (snapshot.hasError) {
            return ErrorState(
              message: snapshot.error.toString(),
              onRetry: () {
                setState(() {
                  _opportunity = context
                      .read<OpportunityController>()
                      .getOpportunity(widget.opportunityId);
                });
              },
            );
          }
          final opportunity = snapshot.data!;
          return _content(context, opportunity);
        },
      ),
    );
  }

  Widget _content(BuildContext context, Opportunity opportunity) {
    final controller = context.watch<OpportunityController>();
    final isSaved = controller.savedIds.contains(opportunity.id);
    final match = context.read<MatchRepository>().matchFor(opportunity);
    final company = context.read<CompanyIntelligenceRepository>().build(
      opportunity,
    );
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Text(
                opportunity.title,
                style: Theme.of(context).textTheme.headlineSmall
                    ?.copyWith(fontWeight: FontWeight.w800),
              ),
            ),
            IconButton.filledTonal(
              tooltip: isSaved ? 'Remove bookmark' : 'Save opportunity',
              onPressed: () => controller.toggleSaved(opportunity),
              icon: Icon(
                isSaved
                    ? Icons.bookmark_rounded
                    : Icons.bookmark_border_rounded,
              ),
            ),
          ],
        ),
        const SizedBox(height: 6),
        Text(
          opportunity.companyName,
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
            color: Theme.of(context).colorScheme.primary,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 18),
        SectionCard(
          child: Column(
            children: [
              _DetailRow(
                icon: Icons.location_on_outlined,
                label: 'Location',
                value: opportunity.locationLabel,
              ),
              _DetailRow(
                icon: Icons.work_outline_rounded,
                label: 'Work mode',
                value: _title(opportunity.workMode),
              ),
              _DetailRow(
                icon: Icons.signal_cellular_alt_rounded,
                label: 'Seniority',
                value: _title(opportunity.seniority),
              ),
              _DetailRow(
                icon: Icons.payments_outlined,
                label: 'Salary',
                value: AppFormatters.salary(
                  minimum: opportunity.salaryMin,
                  maximum: opportunity.salaryMax,
                  currency: opportunity.currency,
                ),
              ),
              _DetailRow(
                icon: Icons.schedule_rounded,
                label: 'Posted',
                value: AppFormatters.relativeDate(opportunity.postedAt),
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        MatchPanel(match: match),
        const SizedBox(height: 14),
        CompanyIntelligenceCard(intelligence: company),
        if (opportunity.skills.isNotEmpty) ...[
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
                  children: opportunity.skills
                      .map((skill) => Chip(label: Text(skill)))
                      .toList(),
                ),
              ],
            ),
          ),
        ],
        if (opportunity.description.trim().isNotEmpty) ...[
          const SizedBox(height: 14),
          SectionCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Role overview',
                  style: Theme.of(context).textTheme.titleMedium
                      ?.copyWith(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 10),
                Text(opportunity.description),
              ],
            ),
          ),
        ],
        const SizedBox(height: 20),
        FilledButton.icon(
          onPressed: _isAdding ? null : () => _addToApplications(opportunity),
          icon: _isAdding
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Icon(Icons.playlist_add_rounded),
          label: const Text('Add to applications'),
        ),
        const SizedBox(height: 10),
        OutlinedButton.icon(
          onPressed: opportunity.applyUrl.isEmpty
              ? null
              : () => _openApplyUrl(opportunity.applyUrl),
          icon: const Icon(Icons.open_in_new_rounded),
          label: const Text('Apply on employer website'),
        ),
      ],
    );
  }

  Future<void> _addToApplications(Opportunity opportunity) async {
    setState(() => _isAdding = true);
    final application = await context.read<ApplicationController>().create(
      opportunity.id,
    );
    if (!mounted) return;
    setState(() => _isAdding = false);
    if (application == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not create the application.')),
      );
      return;
    }
    context.push('/applications/${application.id}/workspace');
  }

  Future<void> _openApplyUrl(String value) async {
    final uri = Uri.tryParse(value);
    if (uri == null) return;
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  String _title(String value) {
    if (value.isEmpty) return 'Not specified';
    return '${value[0].toUpperCase()}${value.substring(1).replaceAll('_', ' ')}';
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({
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
          Expanded(
            child: Text(
              label,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.end,
              style: Theme.of(context).textTheme.bodyMedium
                  ?.copyWith(fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }
}
