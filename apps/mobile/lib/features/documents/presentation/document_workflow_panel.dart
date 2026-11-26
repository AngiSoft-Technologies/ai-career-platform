import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';

import '../../../shared/formatting/app_formatters.dart';
import '../../../shared/widgets/app_states.dart';
import '../domain/generated_document.dart';
import '../domain/resume_template.dart';
import 'document_controller.dart';

/// Export, ATS verdict, template and application-trace actions for a document.
class DocumentWorkflowPanel extends StatefulWidget {
  const DocumentWorkflowPanel({super.key, required this.document});

  final GeneratedDocument document;

  @override
  State<DocumentWorkflowPanel> createState() => _DocumentWorkflowPanelState();
}

class _DocumentWorkflowPanelState extends State<DocumentWorkflowPanel> {
  late Future<Map<String, dynamic>?> _ats;
  bool _sharing = false;

  @override
  void initState() {
    super.initState();
    _ats = context.read<DocumentController>().latestAtsReport(
      widget.document.id,
    );
  }

  Future<void> _rerunAts() async {
    final report = await context.read<DocumentController>().runAtsCheck(
      widget.document.id,
    );
    setState(() => _ats = Future.value(report));
  }

  Future<void> _share(String format) async {
    setState(() => _sharing = true);
    try {
      final bytes = await context.read<DocumentController>().exportDocument(
        widget.document.id,
        format,
      );
      final name =
          '${widget.document.title.replaceAll(RegExp(r'[^\w-]+'), '_')}.$format';
      final mime = switch (format) {
        'pdf' => 'application/pdf',
        'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'pptx' => 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        _ => 'image/png',
      };
      await Share.shareXFiles(
        [XFile.fromData(Uint8List.fromList(bytes), name: name, mimeType: mime)],
        subject: widget.document.title,
        text: 'Generated with MboQara',
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Export failed: $error')));
    } finally {
      if (mounted) setState(() => _sharing = false);
    }
  }

  Future<void> _pickTemplate() async {
    final template = await context.push<ResumeTemplate>(
      '/builder/template-gallery',
      extra: {'documentType': widget.document.type},
    );
    if (template == null || !mounted) return;
    final updated = await context.read<DocumentController>().updateDocument(
      widget.document.id,
      templateKey: template.key,
    );
    if (updated != null && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Template changed to ${template.label}.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionCard(
          child: Semantics(
            label: 'Export document',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Export & share',
                  style: Theme.of(context).textTheme.titleMedium
                      ?.copyWith(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 8,
                  children: [
                    for (final format in ['pdf', 'docx', 'pptx', 'png'])
                      OutlinedButton.icon(
                        onPressed: _sharing ? null : () => _share(format),
                        icon: Icon(
                          format == 'pdf'
                              ? Icons.picture_as_pdf_outlined
                              : Icons.ios_share_outlined,
                        ),
                        label: Text(format.toUpperCase()),
                      ),
                  ],
                ),
                const SizedBox(height: 8),
                TextButton.icon(
                  onPressed: _pickTemplate,
                  icon: const Icon(Icons.design_services_outlined),
                  label: const Text('Change template'),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 14),
        FutureBuilder<Map<String, dynamic>?>(
          future: _ats,
          builder: (context, snapshot) {
            final report = snapshot.data;
            final score = report?['score'];
            return SectionCard(
              child: Semantics(
                label: 'ATS report',
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            'ATS check',
                            style: Theme.of(context).textTheme.titleMedium
                                ?.copyWith(fontWeight: FontWeight.w700),
                          ),
                        ),
                        if (score is num)
                          Semantics(
                            label: 'ATS score ${score.round()} percent',
                            child: Chip(label: Text('${score.round()}/100')),
                          ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    if (snapshot.connectionState == ConnectionState.waiting)
                      const LinearProgressIndicator()
                    else if (report == null)
                      Text(
                        'No ATS report yet. Run a check to see keyword and format issues.',
                        style: Theme.of(context).textTheme.bodyMedium,
                      )
                    else
                      for (final issue in _issues(report))
                        Padding(
                          padding: const EdgeInsets.only(bottom: 6),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Icon(
                                Icons.rule_outlined,
                                size: 16,
                                color: scheme.primary,
                              ),
                              const SizedBox(width: 8),
                              Expanded(child: Text(issue)),
                            ],
                          ),
                        ),
                    const SizedBox(height: 8),
                    OutlinedButton.icon(
                      onPressed: _rerunAts,
                      icon: const Icon(Icons.fact_check_outlined),
                      label: const Text('Run ATS check'),
                    ),
                  ],
                ),
              ),
            );
          },
        ),
        if (widget.document.usedInApplications.isNotEmpty ||
            widget.document.applicationId != null) ...[
          const SizedBox(height: 14),
          SectionCard(
            child: Semantics(
              label: 'Used in applications',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Used in applications',
                    style: Theme.of(context).textTheme.titleMedium
                        ?.copyWith(fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 8),
                  for (final id in <String>{
                    if (widget.document.applicationId != null)
                      widget.document.applicationId!,
                    ...widget.document.usedInApplications,
                  })
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: const Icon(Icons.track_changes_outlined),
                      title: Text('Application $id'),
                      subtitle: Text(
                        'Attached on ${AppFormatters.date(widget.document.updatedAt)}',
                      ),
                    ),
                ],
              ),
            ),
          ),
        ],
      ],
    );
  }

  List<String> _issues(Map<String, dynamic> report) {
    final value =
        report['issues'] ?? report['suggestions'] ?? report['findings'];
    if (value is! List) {
      final summary = report['summary']?.toString();
      return summary == null || summary.isEmpty ? const [] : [summary];
    }
    return value
        .map(
          (item) => item is Map
              ? (item['message'] ?? item['detail'] ?? item['title'])
                        ?.toString() ??
                    ''
              : item.toString(),
        )
        .where((item) => item.isNotEmpty)
        .toList();
  }
}
