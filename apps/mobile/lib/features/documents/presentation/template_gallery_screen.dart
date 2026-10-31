import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../../shared/widgets/app_states.dart';
import '../domain/resume_template.dart';
import 'template_controller.dart';

/// Gallery of resume / cover letter templates served by the API.
///
/// The user picks a layout before the AI drafting agent generates a tailored
/// CV or cover letter for a selected job. The chosen template is popped back
/// to the caller.
class TemplateGalleryScreen extends StatefulWidget {
  const TemplateGalleryScreen({
    super.key,
    required this.documentType, // 'cv' | 'cover_letter'
  });

  final String documentType;

  @override
  State<TemplateGalleryScreen> createState() => _TemplateGalleryScreenState();
}

class _TemplateGalleryScreenState extends State<TemplateGalleryScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<TemplateController>().load();
    });
  }

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<TemplateController>();
    final isCoverLetter = widget.documentType == 'cover_letter';

    return Scaffold(
      appBar: AppBar(
        title: Text(
          isCoverLetter ? 'Cover letter templates' : 'Resume templates',
        ),
        centerTitle: false,
      ),
      body: switch (controller.state) {
        TemplateLoadState.idle || TemplateLoadState.loading =>
          const LoadingState(label: 'Loading templates…'),
        TemplateLoadState.error => ErrorState(
          message: controller.errorMessage ?? 'Unable to load templates',
          onRetry: controller.load,
        ),
        TemplateLoadState.ready => _buildList(controller, isCoverLetter),
      },
    );
  }

  Widget _buildList(TemplateController controller, bool isCoverLetter) {
    final items = isCoverLetter
        ? controller.coverLetterTemplates
              .map(
                (t) => _TemplateItem(
                  key: t.key,
                  label: t.label,
                  subtitle: t.tone.toUpperCase(),
                  description: t.description,
                  accent: 0xFF1F2937,
                  sortOrder: t.sortOrder,
                ),
              )
              .toList()
        : controller.resumeTemplates
              .map(
                (t) => _TemplateItem(
                  key: t.key,
                  label: t.label,
                  subtitle:
                      '${t.category.toUpperCase()} ${t.atsSafe ? '• ATS-safe' : ''}',
                  description: t.description,
                  accent: t.accentColor,
                  sortOrder: t.sortOrder,
                ),
              )
              .toList();

    if (items.isEmpty) {
      return const EmptyState(
        title: 'No templates available',
        message: 'The template catalogue is empty right now.',
        icon: Icons.layers_outlined,
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
      itemCount: items.length,
      separatorBuilder: (_, _) => const SizedBox(height: 12),
      itemBuilder: (context, index) {
        final template = items[index];
        return _TemplateCard(
          template: template,
          onTap: () {
            context.pop(
              ResumeTemplate(
                key: template.key,
                label: template.label,
                category: isCoverLetter ? 'cover_letter' : 'resume',
                description: template.description,
                atsSafe: true,
                accent: '#${template.accent.toRadixString(16).padLeft(6, '0')}',
                sortOrder: template.sortOrder,
              ),
            );
          },
        );
      },
    );
  }
}

class _TemplateItem {
  const _TemplateItem({
    required this.key,
    required this.label,
    required this.subtitle,
    required this.description,
    required this.accent,
    required this.sortOrder,
  });

  final String key;
  final String label;
  final String subtitle;
  final String description;
  final int accent;
  final int sortOrder;
}

class _TemplateCard extends StatelessWidget {
  const _TemplateCard({required this.template, required this.onTap});

  final _TemplateItem template;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Card(
      margin: EdgeInsets.zero,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: Color(template.accent).withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(
                  Icons.description_outlined,
                  color: Color(template.accent),
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      template.label,
                      style: Theme.of(context).textTheme.titleMedium
                          ?.copyWith(fontWeight: FontWeight.w700),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      template.subtitle,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: scheme.onSurfaceVariant,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      template.description,
                      style: Theme.of(context).textTheme.bodyMedium
                          ?.copyWith(color: scheme.onSurfaceVariant),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right_rounded),
            ],
          ),
        ),
      ),
    );
  }
}
