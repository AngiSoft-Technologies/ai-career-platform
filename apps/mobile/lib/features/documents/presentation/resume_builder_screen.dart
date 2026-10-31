import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:path_provider/path_provider.dart';
import 'package:provider/provider.dart';

import '../../../shared/widgets/app_states.dart';
import '../data/document_repository.dart';
import '../domain/generated_document.dart';
import '../domain/resume_template.dart';

/// Resume / cover letter builder.
///
/// Flow: pick a job → pick a template → the AI drafting agent studies the job
/// role, description, requirements and the user's qualifications → drafts a
/// tailored document → internal ATS agent score is shown → user picks a
/// layout, edits, and exports.
class ResumeBuilderScreen extends StatefulWidget {
  const ResumeBuilderScreen({
    super.key,
    required this.opportunityId,
    required this.opportunityTitle,
    required this.companyName,
    this.applicationId,
  });

  final String opportunityId;
  final String opportunityTitle;
  final String companyName;
  final String? applicationId;

  @override
  State<ResumeBuilderScreen> createState() => _ResumeBuilderScreenState();
}

class _ResumeBuilderScreenState extends State<ResumeBuilderScreen> {
  String _documentType = 'cv';
  ResumeTemplate? _selectedTemplate;
  String _userGuidance = '';
  bool _isGenerating = false;
  GeneratedDocument? _document;
  String? _errorMessage;
  int? _atsScore;
  String? _atsGrade;
  List<String> _atsIssues = const [];

  final _guidanceController = TextEditingController();

  @override
  void dispose() {
    _guidanceController.dispose();
    super.dispose();
  }

  /// The label shown for the currently selected document type.
  String get _typeLabel =>
      _documentType == 'cv' ? 'CV / Resume' : 'Cover letter';

  /// Default template key for the document type.
  String get _defaultTemplateKey =>
      _documentType == 'cv' ? 'ats-classic' : 'professional';

  Future<void> _generate() async {
    if (_isGenerating) return;
    setState(() {
      _isGenerating = true;
      _errorMessage = null;
      _document = null;
      _atsScore = null;
      _atsGrade = null;
      _atsIssues = const [];
    });

    try {
      final document = await context.read<DocumentRepository>().generateWithAi(
        opportunityId: widget.opportunityId,
        applicationId: widget.applicationId,
        type: _documentType,
        templateKey: _selectedTemplate?.key ?? _defaultTemplateKey,
        userGuidance: _userGuidance.isEmpty ? null : _userGuidance,
      );
      if (!mounted) return;
      setState(() {
        _document = document;
        _isGenerating = false;
      });
      await _validate(document);
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _isGenerating = false;
        _errorMessage = error.toString();
      });
    }
  }

  /// Run the internal ATS agent over the drafted document.
  Future<void> _validate(GeneratedDocument document) async {
    try {
      final report = await context.read<DocumentRepository>().validateDocument(
        content: document.content,
        opportunityId: widget.opportunityId,
      );
      if (!mounted) return;
      setState(() {
        _atsScore = report['score'] as int?;
        _atsGrade = report['grade'] as String?;
        final issues = report['issues'];
        _atsIssues = (issues as List? ?? const [])
            .whereType<Map>()
            .map((item) => item['message'] as String? ?? '')
            .where((message) => message.isNotEmpty)
            .toList();
      });
    } catch (_) {
      // ATS validation is advisory; don't block the builder.
    }
  }

  Future<void> _editContent(String newContent) async {
    if (_document == null) return;
    setState(() => _isGenerating = true);
    try {
      final updated = await context.read<DocumentRepository>().updateDocument(
        id: _document!.id,
        title: _document!.title,
        content: newContent,
      );
      if (!mounted) return;
      setState(() {
        _document = updated;
        _isGenerating = false;
      });
      await _validate(updated);
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _isGenerating = false;
        _errorMessage = error.toString();
      });
    }
  }

  Future<void> _export(String format) async {
    if (_document == null) return;
    setState(() => _isGenerating = true);
    try {
      final bytes = await context.read<DocumentRepository>().exportDocument(
        id: _document!.id,
        format: format,
        template: 'classic',
      );
      if (!mounted) return;
      setState(() => _isGenerating = false);
      await _saveAndShare(bytes, format);
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _isGenerating = false;
        _errorMessage = error.toString();
      });
    }
  }

  Future<void> _saveAndShare(List<int> bytes, String format) async {
    final directory = await getApplicationDocumentsDirectory();
    final safeTitle = _document!.title.replaceAll(RegExp(r'[^a-z0-9]+'), '_');
    final file = File('${directory.path}/${safeTitle}_$format.$format');
    await file.writeAsBytes(bytes);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Exported to ${file.path}'),
        action: SnackBarAction(
          label: 'Dismiss',
          onPressed: () => ScaffoldMessenger.of(context).hideCurrentSnackBar(),
        ),
      ),
    );
  }

  Future<void> _pickTemplate() async {
    final result = await context.push<ResumeTemplate?>(
      '/builder/template-gallery',
    );
    if (result != null && mounted) {
      setState(() => _selectedTemplate = result);
    }
  }

  Widget _buildATSCard() {
    if (_atsScore == null) return const SizedBox.shrink();
    return SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.security_rounded, size: 20),
              const SizedBox(width: 8),
              Text(
                'ATS check',
                style: Theme.of(context).textTheme.titleMedium
                    ?.copyWith(fontWeight: FontWeight.w700),
              ),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 6,
                ),
                decoration: BoxDecoration(
                  color: _atsGrade == 'A' || _atsGrade == 'B'
                      ? Colors.green.withValues(alpha: 0.15)
                      : Colors.orange.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(
                    color: (_atsGrade == 'A' || _atsGrade == 'B')
                        ? Colors.green
                        : Colors.orange,
                  ),
                ),
                child: Text(
                  'Score ${_atsScore} / 100 • $_atsGrade',
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 13,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          if (_atsIssues.isNotEmpty) ...[
            Text(
              'Suggestions',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                fontWeight: FontWeight.w600,
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 8),
            ..._atsIssues
                .take(5)
                .map(
                  (issue) => Padding(
                    padding: const EdgeInsets.only(bottom: 6),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Icon(
                          Icons.lightbulb_outline_rounded,
                          size: 16,
                          color: Colors.amber,
                        ),
                        const SizedBox(width: 8),
                        Expanded(child: Text(issue)),
                      ],
                    ),
                  ),
                ),
          ] else
            Text(
              'No ATS issues detected — the document is ATS-safe.',
              style: Theme.of(context).textTheme.bodyMedium
                  ?.copyWith(color: Colors.green.shade700),
            ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Tailor resume'),
        actions: [
          if (_document != null)
            IconButton(
              tooltip: 'Export',
              onPressed: _isGenerating ? null : () => _showExportMenu(context),
              icon: const Icon(Icons.file_download_outlined),
            ),
        ],
      ),
      body: _isGenerating && _document == null
          ? const LoadingState(label: 'Tailoring your document…')
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
              children: [
                Text(
                  'Build your ${_typeLabel}',
                  style: Theme.of(context).textTheme.headlineSmall
                      ?.copyWith(fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 4),
                Text(
                  '${widget.opportunityTitle} at ${widget.companyName}',
                  style: Theme.of(context).textTheme.titleMedium
                      ?.copyWith(color: scheme.primary),
                ),
                const SizedBox(height: 18),

                // Document type
                SectionCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Document type',
                        style: Theme.of(context).textTheme.titleMedium
                            ?.copyWith(fontWeight: FontWeight.w700),
                      ),
                      const SizedBox(height: 12),
                      ToggleButtons(
                        isSelected: [
                          _documentType == 'cv',
                          _documentType == 'cover_letter',
                        ],
                        onPressed: (index) {
                          setState(() {
                            _documentType = index == 0 ? 'cv' : 'cover_letter';
                            _selectedTemplate = null;
                          });
                        },
                        children: const [
                          Padding(
                            padding: EdgeInsets.symmetric(
                              horizontal: 16,
                              vertical: 12,
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(Icons.badge_outlined, size: 20),
                                SizedBox(width: 8),
                                Text('CV / Resume'),
                              ],
                            ),
                          ),
                          Padding(
                            padding: EdgeInsets.symmetric(
                              horizontal: 16,
                              vertical: 12,
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(Icons.edit_note_rounded, size: 20),
                                SizedBox(width: 8),
                                Text('Cover letter'),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),

                // Template selection
                SectionCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              'Template',
                              style: Theme.of(context).textTheme.titleMedium
                                  ?.copyWith(fontWeight: FontWeight.w700),
                            ),
                          ),
                          TextButton(
                            onPressed: _isGenerating ? null : _pickTemplate,
                            child: const Text('Choose layout'),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      Container(
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: scheme.surfaceContainerHighest.withValues(
                            alpha: 0.4,
                          ),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: scheme.outlineVariant.withValues(alpha: 0.5),
                          ),
                        ),
                        child: Row(
                          children: [
                            Container(
                              width: 36,
                              height: 36,
                              decoration: BoxDecoration(
                                color:
                                    (_selectedTemplate != null
                                            ? Color(
                                                _selectedTemplate!.accentColor,
                                              )
                                            : scheme.primary)
                                        .withValues(alpha: 0.15),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Icon(
                                Icons.description_outlined,
                                color: _selectedTemplate != null
                                    ? Color(_selectedTemplate!.accentColor)
                                    : scheme.primary,
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    _selectedTemplate?.label ??
                                        (_documentType == 'cv'
                                            ? 'ATS Classic'
                                            : 'Professional'),
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    _selectedTemplate != null
                                        ? _selectedTemplate!.description
                                        : 'Default ${_typeLabel} layout',
                                    style: Theme.of(context).textTheme.bodySmall
                                        ?.copyWith(
                                          color: scheme.onSurfaceVariant,
                                        ),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),

                // Guidance
                SectionCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Additional guidance (optional)',
                        style: Theme.of(context).textTheme.titleMedium
                            ?.copyWith(fontWeight: FontWeight.w700),
                      ),
                      const SizedBox(height: 10),
                      TextField(
                        controller: _guidanceController,
                        maxLines: 4,
                        decoration: const InputDecoration(
                          hintText: 'E.g. emphasise my leadership experience, keep it to one page, highlight project outcomes',
                          border: OutlineInputBorder(),
                        ),
                        onChanged: (value) => _userGuidance = value,
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 18),

                // Generate button
                SizedBox(
                  width: double.infinity,
                  height: 52,
                  child: FilledButton.icon(
                    onPressed: _isGenerating ? null : _generate,
                    icon: _isGenerating
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.auto_awesome_rounded),
                    label: Text(
                      _document == null
                          ? 'Generate tailored document'
                          : 'Regenerate',
                    ),
                  ),
                ),

                // Generated document preview
                if (_document != null) ...[
                  const SizedBox(height: 22),
                  Text(
                    'Preview',
                    style: Theme.of(context).textTheme.titleMedium
                        ?.copyWith(fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 10),
                  _buildATSCard(),
                  const SizedBox(height: 14),
                  SectionCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                _document!.title,
                                style: Theme.of(context).textTheme.titleMedium
                                    ?.copyWith(fontWeight: FontWeight.w700),
                              ),
                            ),
                            IconButton(
                              tooltip: 'Edit content',
                              onPressed: _isGenerating
                                  ? null
                                  : () => _editDocumentContent(context),
                              icon: const Icon(Icons.edit_outlined),
                            ),
                          ],
                        ),
                        const SizedBox(height: 10),
                        Text(
                          _document!.content.isNotEmpty
                              ? _document!.content
                              : '(no content)',
                          style: const TextStyle(fontSize: 13, height: 1.5),
                          maxLines: 40,
                          overflow: TextOverflow.visible,
                        ),
                      ],
                    ),
                  ),
                  if (_errorMessage != null) ...[
                    const SizedBox(height: 12),
                    ErrorState(message: _errorMessage!, onRetry: _generate),
                  ],
                ],
              ],
            ),
    );
  }

  Future<void> _editDocumentContent(BuildContext context) async {
    if (_document == null) return;
    final controller = TextEditingController(text: _document!.content);
    final result = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Edit document'),
        content: SizedBox(
          width: double.maxFinite,
          height: 320,
          child: TextField(
            controller: controller,
            maxLines: null,
            expands: true,
            keyboardType: TextInputType.multiline,
            decoration: const InputDecoration(
              border: OutlineInputBorder(),
              hintText: 'Edit the drafted document here…',
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, controller.text.trim()),
            child: const Text('Save'),
          ),
        ],
      ),
    );
    if (result != null && result.isNotEmpty && mounted) {
      await _editContent(result);
    }
  }

  void _showExportMenu(BuildContext context) {
    showModalBottomSheet(
      context: context,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.picture_as_pdf_rounded),
              title: const Text('Export as PDF'),
              onTap: () {
                Navigator.pop(context);
                unawaited(_export('pdf'));
              },
            ),
            ListTile(
              leading: const Icon(Icons.description_rounded),
              title: const Text('Export as DOCX'),
              onTap: () {
                Navigator.pop(context);
                unawaited(_export('docx'));
              },
            ),
            ListTile(
              leading: const Icon(Icons.slideshow),
              title: const Text('Export as PPTX'),
              onTap: () {
                Navigator.pop(context);
                unawaited(_export('pptx'));
              },
            ),
            ListTile(
              leading: const Icon(Icons.image_rounded),
              title: const Text('Export as PNG'),
              onTap: () {
                Navigator.pop(context);
                unawaited(_export('png'));
              },
            ),
          ],
        ),
      ),
    );
  }
}

class SectionCard extends StatelessWidget {
  const SectionCard({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: scheme.outlineVariant.withValues(alpha: 0.65),
        ),
      ),
      child: child,
    );
  }
}
