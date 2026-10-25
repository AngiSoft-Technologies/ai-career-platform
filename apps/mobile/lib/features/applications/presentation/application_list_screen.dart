import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../../shared/formatting/app_formatters.dart';
import '../../../shared/widgets/app_states.dart';
import '../../../shared/widgets/status_chip.dart';
import '../../followups/presentation/follow_up_controller.dart';
import '../../followups/presentation/follow_up_section.dart';
import '../../opportunities/presentation/opportunity_controller.dart';
import '../domain/job_application.dart';
import 'application_controller.dart';

class ApplicationListScreen extends StatefulWidget {
  const ApplicationListScreen({super.key});

  @override
  State<ApplicationListScreen> createState() => _ApplicationListScreenState();
}

class _ApplicationListScreenState extends State<ApplicationListScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _refresh());
  }

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<ApplicationController>();
    final followUps = context.watch<FollowUpController>();
    return Scaffold(
      appBar: AppBar(
        title: const Text('Applications'),
        actions: [
          IconButton(
            tooltip: 'Refresh applications',
            onPressed: _refresh,
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: CustomScrollView(
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                child: Text(
                  'Track every application from shortlist to offer.',
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
                ),
              ),
            ),
            if (controller.state == ApplicationLoadState.loading &&
                controller.items.isEmpty)
              const SliverFillRemaining(
                hasScrollBody: false,
                child: LoadingState(label: 'Loading applications…'),
              )
            else if (controller.state == ApplicationLoadState.error &&
                controller.items.isEmpty)
              SliverFillRemaining(
                hasScrollBody: false,
                child: ErrorState(
                  message:
                      controller.errorMessage ?? 'Unable to load applications',
                  onRetry: _refresh,
                ),
              )
            else if (controller.items.isEmpty)
              const SliverFillRemaining(
                hasScrollBody: false,
                child: EmptyState(
                  title: 'No applications yet',
                  message: 'Add a role from the opportunities list to begin.',
                  icon: Icons.assignment_outlined,
                ),
              )
            else
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                sliver: SliverList.separated(
                  itemCount: controller.items.length,
                  separatorBuilder: (_, index) => const SizedBox(height: 12),
                  itemBuilder: (context, index) {
                    final application = controller.items[index];
                    return _ApplicationCard(
                      application: application,
                      onOpen: () => context.push(
                        '/applications/${application.id}/workspace',
                      ),
                      onStatus: () => _showStatusOptions(application),
                    );
                  },
                ),
              ),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                child: Text(
                  'Follow-ups',
                  style: Theme.of(context).textTheme.titleLarge
                      ?.copyWith(fontWeight: FontWeight.w800),
                ),
              ),
            ),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 28),
              sliver: SliverToBoxAdapter(
                child: FollowUpSection(
                  followUps: followUps.items,
                  isLoading: followUps.state == FollowUpLoadState.loading,
                  onMarkDone: (followUp) async {
                    await context.read<FollowUpController>().markDone(followUp);
                  },
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _refresh() async {
    await Future.wait([
      context.read<ApplicationController>().load(),
      context.read<FollowUpController>().load(),
    ]);
  }

  Future<void> _showStatusOptions(JobApplication application) async {
    final transitions = application.availableTransitions;
    if (transitions.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('This application has reached a final state.'),
        ),
      );
      return;
    }
    final selected = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Update application status',
                style: Theme.of(context).textTheme.titleLarge
                    ?.copyWith(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 12),
              for (final transition in transitions)
                ListTile(
                  title: Text(_statusLabel(transition)),
                  trailing: const Icon(Icons.chevron_right_rounded),
                  onTap: () => Navigator.pop(context, transition),
                ),
            ],
          ),
        ),
      ),
    );
    if (selected == null || !mounted) return;
    final success = await context.read<ApplicationController>().updateStatus(
      application,
      status: selected,
    );
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          success
              ? 'Application status updated.'
              : 'Could not update the status.',
        ),
      ),
    );
  }

  String _statusLabel(String value) {
    return value
        .toLowerCase()
        .split('_')
        .map(
          (part) => part.isEmpty
              ? part
              : '${part[0].toUpperCase()}${part.substring(1)}',
        )
        .join(' ');
  }
}

class _ApplicationCard extends StatelessWidget {
  const _ApplicationCard({
    required this.application,
    required this.onOpen,
    required this.onStatus,
  });

  final JobApplication application;
  final VoidCallback onOpen;
  final VoidCallback onStatus;

  @override
  Widget build(BuildContext context) {
    final opportunities = context.watch<OpportunityController>().items;
    for (final opportunity in opportunities) {
      if (opportunity.id == application.opportunityId) {
        final title = opportunity.title;
        final company = opportunity.companyName;
        return _buildCard(context, title, company);
      }
    }
    return _buildCard(
      context,
      'Application',
      'Opportunity ${application.opportunityId}',
    );
  }

  Widget _buildCard(BuildContext context, String title, String company) {
    return Card(
      margin: EdgeInsets.zero,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onOpen,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          title,
                          style: Theme.of(context).textTheme.titleMedium
                              ?.copyWith(fontWeight: FontWeight.w700),
                        ),
                        const SizedBox(height: 3),
                        Text(company),
                      ],
                    ),
                  ),
                  StatusChip(status: application.status),
                ],
              ),
              const SizedBox(height: 12),
              Text(
                'Updated ${AppFormatters.relativeDate(application.updatedAt)} · version ${application.version}',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  TextButton.icon(
                    onPressed: onStatus,
                    icon: const Icon(Icons.sync_alt_rounded),
                    label: const Text('Update status'),
                  ),
                  const Spacer(),
                  TextButton.icon(
                    onPressed: onOpen,
                    icon: const Icon(Icons.open_in_new_rounded),
                    label: const Text('Workspace'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
