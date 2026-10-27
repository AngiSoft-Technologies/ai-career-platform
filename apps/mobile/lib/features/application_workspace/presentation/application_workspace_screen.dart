import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../../shared/widgets/app_states.dart';
import '../../../shared/widgets/match_score_badge.dart';
import '../../documents/presentation/document_controller.dart';
import '../../followups/presentation/follow_up_controller.dart';
import '../domain/application_workspace.dart';
import 'application_workspace_controller.dart';

class ApplicationWorkspaceScreen extends StatefulWidget {
  const ApplicationWorkspaceScreen({super.key, required this.applicationId});

  final String applicationId;

  @override
  State<ApplicationWorkspaceScreen> createState() =>
      _ApplicationWorkspaceScreenState();
}

class _ApplicationWorkspaceScreenState
    extends State<ApplicationWorkspaceScreen> {
  bool _isGenerating = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<ApplicationWorkspaceController>().load(widget.applicationId);
    });
  }

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<ApplicationWorkspaceController>();
    return Scaffold(
      appBar: AppBar(title: const Text('Application workspace')),
      body: switch (controller.state) {
        WorkspaceLoadState.idle || WorkspaceLoadState.loading =>
          const LoadingState(label: 'Preparing your workspace…'),
        WorkspaceLoadState.error => ErrorState(
          message: controller.errorMessage ?? 'Unable to load the workspace',
          onRetry: () => controller.load(widget.applicationId),
        ),
        WorkspaceLoadState.ready => _content(context, controller.workspace!),
      },
    );
  }

  Widget _content(BuildContext context, ApplicationWorkspace workspace) {
    final opportunity = workspace.opportunity;
    final match = workspace.match ?? opportunity?.match;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
      children: [
        Text(
          opportunity?.title ?? 'Application workspace',
          style: Theme.of(context).textTheme.headlineSmall
              ?.copyWith(fontWeight: FontWeight.w800),
        ),
        if (opportunity != null) ...[
          const SizedBox(height: 4),
          Text(
            opportunity.companyName,
            style: Theme.of(context).textTheme.titleMedium
                ?.copyWith(color: Theme.of(context).colorScheme.primary),
          ),
        ],
        const SizedBox(height: 18),
        if (match != null)
          SectionCard(
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Match summary',
                        style: Theme.of(context).textTheme.titleMedium
                            ?.copyWith(fontWeight: FontWeight.w700),
                      ),
                      const SizedBox(height: 8),
                      Text(match.explanation),
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                MatchScoreBadge(score: match.score),
              ],
            ),
          ),
        if (match != null) const SizedBox(height: 14),
        SectionCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Required documents',
                style: Theme.of(context).textTheme.titleMedium
                    ?.copyWith(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 10),
              if (workspace.requiredDocuments.isEmpty)
                const Text('No document requirements were detected.')
              else
                for (final document in workspace.requiredDocuments)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Row(
                      children: [
                        const Icon(Icons.description_outlined, size: 19),
                        const SizedBox(width: 9),
                        Expanded(child: Text(document)),
                      ],
                    ),
                  ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: FilledButton.icon(
                      onPressed: _isGenerating
                          ? null
                          : () => _generate(workspace, 'cv'),
                      icon: const Icon(Icons.badge_outlined),
                      label: const Text('Generate CV'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _isGenerating
                          ? null
                          : () => _generate(workspace, 'cover_letter'),
                      icon: const Icon(Icons.edit_note_rounded),
                      label: const Text('Cover letter'),
                    ),
                  ),
                ],
              ),
              if (_isGenerating) ...[
                const SizedBox(height: 12),
                const LinearProgressIndicator(),
              ],
            ],
          ),
        ),
        const SizedBox(height: 14),
        SectionCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Detected form fields',
                style: Theme.of(context).textTheme.titleMedium
                    ?.copyWith(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 10),
              if (workspace.fields.isEmpty)
                const Text('No fields were detected yet.')
              else
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: workspace.fields
                      .map((field) => Chip(label: Text(_fieldLabel(field))))
                      .toList(),
                ),
              const SizedBox(height: 18),
              Text(
                'Questions to prepare for',
                style: Theme.of(context).textTheme.titleMedium
                    ?.copyWith(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 10),
              if (workspace.questions.isEmpty)
                const Text('No questions were detected yet.')
              else
                for (final question in workspace.questions)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Icon(Icons.help_outline_rounded, size: 19),
                        const SizedBox(width: 9),
                        Expanded(child: Text(question)),
                      ],
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
                'Application instructions',
                style: Theme.of(context).textTheme.titleMedium
                    ?.copyWith(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 10),
              Text(workspace.instructions),
              const SizedBox(height: 16),
              FilledButton.tonalIcon(
                onPressed: workspace.applicationUrl.isEmpty
                    ? null
                    : () => context.push(
                        '/applications/${widget.applicationId}/apply',
                      ),
                icon: Icon(
                  workspace.method == 'email'
                      ? Icons.mark_email_read_outlined
                      : Icons.play_circle_outline,
                ),
                label: Text(
                  workspace.method == 'email'
                      ? 'Prepare application email'
                      : 'Start guided application',
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        OutlinedButton.icon(
          onPressed: () => _scheduleFollowUp(workspace),
          icon: const Icon(Icons.notifications_active_outlined),
          label: const Text('Schedule follow-up'),
        ),
      ],
    );
  }

  Future<void> _generate(ApplicationWorkspace workspace, String type) async {
    setState(() => _isGenerating = true);
    final document = await context.read<DocumentController>().generate(
      opportunityId: workspace.opportunityId,
      applicationId: widget.applicationId,
      type: type,
    );
    if (!mounted) return;
    setState(() => _isGenerating = false);
    if (document == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not generate the document.')),
      );
      return;
    }
    context.push('/documents/${document.id}');
  }

  Future<void> _scheduleFollowUp(ApplicationWorkspace workspace) async {
    final now = DateTime.now();
    final date = await showDatePicker(
      context: context,
      initialDate: now.add(const Duration(days: 7)),
      firstDate: now,
      lastDate: now.add(const Duration(days: 365)),
    );
    if (date == null || !mounted) return;
    final noteController = TextEditingController();
    final note = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Follow-up note'),
        content: TextField(
          controller: noteController,
          autofocus: true,
          maxLines: 3,
          decoration: const InputDecoration(
            labelText: 'What should you follow up about?',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, noteController.text.trim()),
            child: const Text('Schedule'),
          ),
        ],
      ),
    );
    noteController.dispose();
    if (note == null || !mounted) return;
    final dueAt = DateTime(date.year, date.month, date.day, 9);
    final success = await context.read<FollowUpController>().schedule(
      applicationId: widget.applicationId,
      dueAt: dueAt,
      note: note,
    );
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          success
              ? 'Follow-up scheduled.'
              : 'Could not schedule the follow-up.',
        ),
      ),
    );
  }

  String _fieldLabel(String value) {
    return value
        .split('_')
        .map(
          (part) => part.isEmpty
              ? part
              : '${part[0].toUpperCase()}${part.substring(1)}',
        )
        .join(' ');
  }
}
