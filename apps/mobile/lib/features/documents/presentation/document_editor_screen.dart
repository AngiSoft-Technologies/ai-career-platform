import 'dart:async';
import 'dart:convert';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../shared/widgets/app_background.dart';
import '../domain/generated_document.dart';
import '../domain/resume_editor.dart';
import 'document_controller.dart';

/// The mobile resume / cover-letter builder.
///
/// It mirrors the web builder's feature set: contact, editable sections,
/// add/reorder/delete, exact 21-template catalogue, 18 fonts, six accents,
/// per-side millimetre margins, printable preview, autosave, undo/redo and
/// one-click in-place AI improvement.
class DocumentEditorScreen extends StatefulWidget {
  const DocumentEditorScreen({super.key, required this.document});

  final GeneratedDocument document;

  @override
  State<DocumentEditorScreen> createState() => _DocumentEditorScreenState();
}

class _Snapshot {
  _Snapshot(this.document, this.title, this.template);

  final ResumeDocument document;
  final String title;
  final String template;
}

class _DocumentEditorScreenState extends State<DocumentEditorScreen> {
  int _tab = 0;
  String? _activeSectionId;
  bool _dirty = false;
  bool _saving = false;
  bool _improving = false;
  String? _improvementError;
  DateTime? _savedAt;
  Timer? _saveTimer;

  late ResumeDocument _editor;
  late String _title;
  late String _template;

  final List<_Snapshot> _past = <_Snapshot>[];
  final List<_Snapshot> _future = <_Snapshot>[];

  @override
  void initState() {
    super.initState();
    _editor = ResumeDocument.fromJson(
      widget.document.resumeData,
      fallbackKind: widget.document.type,
      fallbackContent: widget.document.content,
    );
    _title = widget.document.title;
    _template = widget.document.template ?? defaultResumeTemplateKeyMobile;
    if (_editor.sections.isNotEmpty) {
      _activeSectionId = _editor.sections.first.id;
    }
  }

  @override
  void dispose() {
    _saveTimer?.cancel();
    super.dispose();
  }

  void _commit({ResumeDocument? document, String? title, String? template}) {
    _past.add(_Snapshot(_editor, _title, _template));
    if (_past.length > 50) {
      _past.removeAt(0);
    }
    _future.clear();
    setState(() {
      _editor = document ?? _editor;
      _title = title ?? _title;
      _template = template ?? _template;
      _dirty = true;
    });
    _scheduleSave();
  }

  void _undo() {
    if (_past.isEmpty) return;
    final previous = _past.removeLast();
    _future.add(_Snapshot(_editor, _title, _template));
    setState(() {
      _editor = previous.document;
      _title = previous.title;
      _template = previous.template;
      _dirty = true;
    });
    _scheduleSave();
  }

  void _redo() {
    if (_future.isEmpty) return;
    final next = _future.removeLast();
    _past.add(_Snapshot(_editor, _title, _template));
    setState(() {
      _editor = next.document;
      _title = next.title;
      _template = next.template;
      _dirty = true;
    });
    _scheduleSave();
  }

  void _scheduleSave() {
    _saveTimer?.cancel();
    _saveTimer = Timer(const Duration(milliseconds: 1100), _save);
  }

  Future<void> _save() async {
    if (!_dirty) return;
    setState(() => _saving = true);
    try {
      final updated = await context.read<DocumentController>().updateDocument(
        widget.document.id,
        title: _title,
        templateKey: _template,
        resumeData: _editor.toJson(),
      );
      if (!mounted) return;
      setState(() {
        _saving = false;
        _dirty = false;
        _savedAt = DateTime.now();
      });
      if (updated != null) {
        // Keep the local controller list aligned with the structured row.
        context.read<DocumentController>().refresh(updated);
      }
    } catch (error) {
      if (!mounted) return;
      setState(() => _saving = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not save the document: $error')),
      );
    }
  }

  Future<void> _improve() async {
    if (_improving) return;
    setState(() {
      _improving = true;
      _improvementError = null;
    });
    try {
      await _save();
      if (!mounted) return;
      final controller = context.read<DocumentController>();
      final job = await controller.improveInPlace(
        widget.document,
        _editor.toJson(),
      );
      final result = await _pollImprovement(controller, job.id);
      if (!mounted) return;
      if (result == null) {
        setState(() {
          _improving = false;
          _improvementError = 'AI improvement timed out.';
        });
        return;
      }
      final improved = ResumeDocument.fromJson(result);
      _commit(document: improved);
      setState(() => _improving = false);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Document improved in place. Undo is available.'),
        ),
      );
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _improving = false;
        _improvementError = error.toString();
      });
    }
  }

  Future<Map<String, dynamic>?> _pollImprovement(
    DocumentController controller,
    String improvementId,
  ) async {
    for (var attempt = 0; attempt < 80; attempt += 1) {
      final job = await controller.improvementStatus(
        documentId: widget.document.id,
        improvementId: improvementId,
      );
      if (job.status == 'success') return job.resumeData;
      if (job.status == 'failed') {
        throw Exception(job.error ?? 'AI improvement failed');
      }
      await Future<void>.delayed(const Duration(milliseconds: 1500));
    }
    return null;
  }

  ResumeSection? get _activeSection => _editor.sections
      .where((section) => section.id == _activeSectionId)
      .firstOrNull;

  void _addSection(String type) {
    final section = ResumeSection(
      id: 'section-$type-${DateTime.now().microsecondsSinceEpoch}',
      type: type,
      title: resumeSectionCatalogue.firstWhere((row) => row.type == type).label,
      entries: type == 'summary' || type == 'skills'
          ? [ResumeEntry(id: resumeEntryId())]
          : <ResumeEntry>[],
    );
    setState(() {
      _editor = _editor.copyWith(sections: [..._editor.sections, section]);
      _activeSectionId = section.id;
    });
    _commit(document: _editor);
  }

  void _removeSection(String id) {
    setState(() {
      _editor = _editor.copyWith(
        sections: _editor.sections
            .where((section) => section.id != id)
            .toList(),
      );
      if (_activeSectionId == id) _activeSectionId = null;
    });
    _commit(document: _editor);
  }

  void _moveSection(String id, int direction) {
    final sections = [..._editor.sections];
    final index = sections.indexWhere((section) => section.id == id);
    final target = index + direction;
    if (index < 0 || target < 0 || target >= sections.length) return;
    final moved = sections.removeAt(index);
    sections.insert(target, moved);
    setState(() {
      _editor = _editor.copyWith(sections: sections);
    });
    _commit(document: _editor);
  }

  void _addEntry(ResumeSection section) {
    final entries = [...section.entries, ResumeEntry(id: resumeEntryId())];
    _patchSection(section.copyWith(entries: entries), scope: section.id);
  }

  void _addEntryAtTop(ResumeSection section) {
    final entries = [ResumeEntry(id: resumeEntryId()), ...section.entries];
    _patchSection(section.copyWith(entries: entries), scope: section.id);
  }

  void _removeEntry(ResumeSection section, String entryId) {
    _patchSection(
      section.copyWith(
        entries: section.entries.where((entry) => entry.id != entryId).toList(),
      ),
      scope: section.id,
    );
  }

  void _moveEntry(ResumeSection section, String entryId, int direction) {
    final entries = [...section.entries];
    final index = entries.indexWhere((entry) => entry.id == entryId);
    final target = index + direction;
    if (index < 0 || target < 0 || target >= entries.length) return;
    final moved = entries.removeAt(index);
    entries.insert(target, moved);
    _patchSection(section.copyWith(entries: entries), scope: section.id);
  }

  void _patchSection(ResumeSection section, {required String scope}) {
    setState(() {
      _editor = _editor.copyWith(
        sections: _editor.sections
            .map((item) => item.id == section.id ? section : item)
            .toList(),
      );
    });
    _commit(document: _editor);
  }

  void _patchEntry(ResumeSection section, ResumeEntry entry) {
    _patchSection(
      section.copyWith(
        entries: section.entries
            .map((item) => item.id == entry.id ? entry : item)
            .toList(),
      ),
      scope: section.id,
    );
  }

  void _patchDesign(ResumeDesign design) {
    setState(() {
      _editor = _editor.copyWith(design: design);
    });
    _commit(document: _editor);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final controller = context.watch<DocumentController>();
    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        title: Text(_editor.isLetter ? 'Cover letter' : 'Resume'),
        actions: [
          IconButton(
            tooltip: 'Undo',
            onPressed: _past.isEmpty ? null : _undo,
            icon: const Icon(Icons.undo_rounded),
          ),
          IconButton(
            tooltip: 'Redo',
            onPressed: _future.isEmpty ? null : _redo,
            icon: const Icon(Icons.redo_rounded),
          ),
          IconButton(
            tooltip: 'Improve with AI',
            onPressed: _improving ? null : _improve,
            icon: _improving
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.auto_awesome),
          ),
          IconButton(
            tooltip: 'Save now',
            onPressed: _saving || controller.isGenerating ? null : _save,
            icon: const Icon(Icons.save_rounded),
          ),
        ],
      ),
      body: AppBackground(
        child: SafeArea(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
            children: [
              _buildHeader(theme),
              const SizedBox(height: 14),
              _buildModeTabs(theme),
              const SizedBox(height: 14),
              if (_tab == 0) ..._buildContentTab(theme),
              if (_tab == 1) _buildDesignPanel(theme),
              if (_tab == 2) _buildPreview(theme),
            ],
          ),
        ),
      ),
    );
  }

  List<Widget> _buildContentTab(ThemeData theme) {
    if (_editor.isLetter) return _buildCoverLetterTab(theme);
    return [
      if (_improvementError != null) ...[
        Text(_improvementError!, style: theme.textTheme.bodySmall),
        const SizedBox(height: 8),
      ],
      _sectionCard(
        theme,
        title: 'Sections',
        child: Column(
          children: [
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final entry in resumeSectionCatalogue)
                  OutlinedButton.icon(
                    onPressed: () => _addSection(entry.type),
                    icon: const Icon(Icons.add, size: 16),
                    label: Text(entry.label),
                  ),
              ],
            ),
            const Divider(height: 24),
            _buttonLike(
              theme,
              label: 'Contact details',
              selected: _activeSectionId == null,
              onTap: () => setState(() => _activeSectionId = null),
            ),
            const SizedBox(height: 8),
            for (var index = 0; index < _editor.sections.length; index += 1)
              _builderSectionRow(theme, _editor.sections[index], index),
          ],
        ),
      ),
      const SizedBox(height: 14),
      if (_activeSection != null)
        ..._buildSectionEditor(theme, _activeSection!),
      if (_activeSection == null) ..._buildContactEditor(theme),
    ];
  }

  Widget _builderSectionRow(ThemeData theme, ResumeSection section, int index) {
    final label = resumeSectionCatalogue
        .firstWhere(
          (row) => row.type == section.type,
          orElse: () =>
              (type: 'custom', label: 'Custom section', entryLabel: 'entry'),
        )
        .label;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        border: Border.all(color: theme.dividerColor),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: [
          Expanded(
            child: ListTile(
              dense: true,
              selected: _activeSectionId == section.id,
              title: Text(
                section.title.isEmpty || section.type == 'custom'
                    ? label
                    : section.title,
              ),
              subtitle: Text('${section.entries.length} entries'),
              onTap: () => setState(() => _activeSectionId = section.id),
            ),
          ),
          IconButton(
            tooltip: 'Move up',
            onPressed: index == 0 ? null : () => _moveSection(section.id, -1),
            icon: const Icon(Icons.arrow_upward, size: 18),
          ),
          IconButton(
            tooltip: 'Move down',
            onPressed: index == _editor.sections.length - 1
                ? null
                : () => _moveSection(section.id, 1),
            icon: const Icon(Icons.arrow_downward, size: 18),
          ),
          IconButton(
            tooltip: 'Delete section',
            onPressed: () => _removeSection(section.id),
            icon: const Icon(Icons.delete_outline, size: 18),
          ),
        ],
      ),
    );
  }

  List<Widget> _buildSectionEditor(ThemeData theme, ResumeSection section) {
    final definition = resumeSectionCatalogue.firstWhere(
      (row) => row.type == section.type,
      orElse: () =>
          (type: 'custom', label: 'Custom section', entryLabel: 'entry'),
    );
    final isSingle = section.type == 'summary' || section.type == 'skills';

    return [
      _sectionCard(
        theme,
        title: definition.label,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            TextFormField(
              initialValue: section.title,
              decoration: const InputDecoration(labelText: 'Section title'),
              onChanged: (value) => _patchSection(
                section.copyWith(title: value),
                scope: section.id,
              ),
            ),
            const SizedBox(height: 12),
            if (isSingle)
              _entryForm(
                theme,
                section,
                section.entries.isNotEmpty
                    ? section.entries.first
                    : ResumeEntry(id: resumeEntryId()),
              )
            else ...[
              if (section.type == 'experience')
                OutlinedButton.icon(
                  onPressed: () => _addEntryAtTop(section),
                  icon: const Icon(Icons.add, size: 16),
                  label: const Text('Add experience at the top'),
                ),
              const SizedBox(height: 8),
              for (final entry in section.entries) ...[
                _entryCard(theme, section, entry),
                const SizedBox(height: 8),
              ],
              OutlinedButton.icon(
                onPressed: () => _addEntry(section),
                icon: const Icon(Icons.add, size: 16),
                label: Text('Add ${definition.entryLabel}'),
              ),
            ],
          ],
        ),
      ),
      const SizedBox(height: 14),
    ];
  }

  Widget _entryCard(ThemeData theme, ResumeSection section, ResumeEntry entry) {
    return Container(
      decoration: BoxDecoration(
        border: Border.all(color: theme.dividerColor),
        borderRadius: BorderRadius.circular(12),
      ),
      padding: const EdgeInsets.all(12),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  '${definitionEntryLabel(section)} ${section.entries.indexOf(entry) + 1}',
                ),
              ),
              IconButton(
                tooltip: 'Move up',
                onPressed: section.entries.indexOf(entry) == 0
                    ? null
                    : () => _moveEntry(section, entry.id, -1),
                icon: const Icon(Icons.arrow_upward, size: 18),
              ),
              IconButton(
                tooltip: 'Move down',
                onPressed:
                    section.entries.indexOf(entry) == section.entries.length - 1
                    ? null
                    : () => _moveEntry(section, entry.id, 1),
                icon: const Icon(Icons.arrow_downward, size: 18),
              ),
              IconButton(
                tooltip: 'Delete',
                onPressed: () => _removeEntry(section, entry.id),
                icon: const Icon(Icons.delete_outline, size: 18),
              ),
            ],
          ),
          _entryForm(theme, section, entry),
        ],
      ),
    );
  }

  Widget _entryForm(ThemeData theme, ResumeSection section, ResumeEntry entry) {
    String readValue(String field) {
      switch (field) {
        case 'designation':
        case 'degree':
        case 'project_title':
        case 'cause':
        case 'honor':
        case 'award':
        case 'language':
        case 'certification':
        case 'referee':
        case 'heading':
        case 'title':
          return entry.title;
        case 'company':
        case 'institute':
        case 'organisation':
        case 'publisher':
        case 'organization':
        case 'issuer':
        case 'awarded_by':
        case 'authority':
        case 'designation_secondary':
        case 'subheading':
          return entry.organisation;
        case 'url':
          return entry.url;
        case 'date':
          return entry.date;
        case 'details':
        case 'proficiency':
        case 'summary':
        case 'skills':
          return entry.summary;
        default:
          return entry.title;
      }
    }

    void writeValue(String field, String value) {
      ResumeEntry next = entry.copyWith(title: value);
      switch (field) {
        case 'company':
        case 'institute':
        case 'organisation':
        case 'publisher':
        case 'organization':
        case 'issuer':
        case 'awarded_by':
        case 'authority':
        case 'designation_secondary':
        case 'subheading':
          next = entry.copyWith(organisation: value);
          break;
        case 'url':
          next = entry.copyWith(url: value);
          break;
        case 'date':
          next = entry.copyWith(date: value);
          break;
        case 'details':
        case 'proficiency':
        case 'summary':
        case 'skills':
          next = entry.copyWith(summary: value);
          break;
      }
      _patchEntry(section, next);
    }

    return Column(
      children: [
        for (final field in resumeEntryFields(sectionType: section.type))
          _textField(
            theme,
            field.label,
            readValue(field.field),
            (value) => writeValue(field.field, value),
            maxLines: field.long ? 6 : 1,
          ),
      ],
    );
  }

  List<Widget> _buildContactEditor(ThemeData theme) {
    final contact = _editor.contact;
    void patch(ResumeContact next) {
      _commit(document: _editor.copyWith(contact: next));
    }

    return [
      _sectionCard(
        theme,
        title: 'Contact details',
        child: Column(
          children: [
            _textField(
              theme,
              'First name',
              contact.fullName,
              (value) => patch(contact.copyWith(fullName: value)),
            ),
            _textField(
              theme,
              'Last name',
              contact.lastName,
              (value) => patch(contact.copyWith(lastName: value)),
            ),
            _textField(
              theme,
              'Headline',
              contact.headline,
              (value) => patch(contact.copyWith(headline: value)),
            ),
            _textField(
              theme,
              'Email',
              contact.email,
              (value) => patch(contact.copyWith(email: value)),
              keyboardType: TextInputType.emailAddress,
            ),
            _textField(
              theme,
              'Phone',
              contact.phone,
              (value) => patch(contact.copyWith(phone: value)),
              keyboardType: TextInputType.phone,
            ),
            _textField(
              theme,
              'Website',
              contact.website,
              (value) => patch(contact.copyWith(website: value)),
            ),
            _textField(
              theme,
              'Address',
              contact.location,
              (value) => patch(contact.copyWith(location: value)),
            ),
            _textField(
              theme,
              'LinkedIn',
              contact.linkedin,
              (value) => patch(contact.copyWith(linkedin: value)),
            ),
          ],
        ),
      ),
      const SizedBox(height: 14),
    ];
  }

  List<Widget> _buildCoverLetterTab(ThemeData theme) {
    final letter = _editor.coverLetter;
    void patch(CoverLetter next) =>
        _commit(document: _editor.copyWith(coverLetter: next));

    return [
      _sectionCard(
        theme,
        title: 'Cover letter',
        child: Column(
          children: [
            _textField(
              theme,
              'Recipient name',
              letter.recipientName,
              (value) => patch(letter.copyWith(recipientName: value)),
            ),
            _textField(
              theme,
              'Recipient company',
              letter.recipientCompany,
              (value) => patch(letter.copyWith(recipientCompany: value)),
            ),
            _textField(
              theme,
              'Recipient address',
              letter.recipientAddress,
              (value) => patch(letter.copyWith(recipientAddress: value)),
            ),
            _textField(
              theme,
              'Subject',
              letter.subject,
              (value) => patch(letter.copyWith(subject: value)),
            ),
            _textField(
              theme,
              'Greeting',
              letter.greeting,
              (value) => patch(letter.copyWith(greeting: value)),
            ),
            _textField(
              theme,
              'Body',
              letter.body,
              (value) => patch(letter.copyWith(body: value)),
              maxLines: 12,
            ),
            _textField(
              theme,
              'Sign-off',
              letter.signoff,
              (value) => patch(letter.copyWith(signoff: value)),
            ),
          ],
        ),
      ),
      const SizedBox(height: 14),
    ];
  }

  Widget _buildDesignPanel(ThemeData theme) {
    final design = _editor.design;
    return _sectionCard(
      theme,
      title: 'Design',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Template · ${resumeTemplateCatalogue.length}'),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final template in resumeTemplateCatalogue)
                ChoiceChip(
                  label: Text(template.label),
                  selected: _template == template.key,
                  onSelected: template.locked
                      ? null
                      : (_) => _commit(template: template.key),
                ),
            ],
          ),
          const SizedBox(height: 16),
          DropdownButtonFormField<String>(
            initialValue: resumeFonts.any((font) => font.key == design.font)
                ? design.font
                : 'lora',
            decoration: const InputDecoration(labelText: 'Font'),
            items: [
              for (final font in resumeFonts)
                DropdownMenuItem(value: font.key, child: Text(font.label)),
            ],
            onChanged: (value) => _patchDesign(design.copyWith(font: value)),
          ),
          const SizedBox(height: 16),
          Text('Accent colour'),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            children: [
              for (final colour in resumeAccentColours)
                _colorSwatch(
                  colour,
                  design.accentColor,
                  () => _patchDesign(design.copyWith(accentColor: colour)),
                ),
            ],
          ),
          const SizedBox(height: 16),
          Text('Text colour'),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            children: [
              for (final colour in resumeTextColours)
                _colorSwatch(
                  colour,
                  design.textColor,
                  () => _patchDesign(design.copyWith(textColor: colour)),
                ),
            ],
          ),
          const SizedBox(height: 16),
          Text('Text size'),
          const SizedBox(height: 4),
          SegmentedButton<String>(
            segments: [
              for (final size in resumeTextSizes)
                ButtonSegment(value: size.key, label: Text(size.label)),
            ],
            selected: {design.textSize},
            onSelectionChanged: (value) =>
                _patchDesign(design.copyWith(textSize: value.first)),
          ),
          const SizedBox(height: 16),
          Text('Page size'),
          const SizedBox(height: 4),
          SegmentedButton<String>(
            segments: [
              for (final size in resumePageSizes)
                ButtonSegment(value: size.key, label: Text(size.label)),
            ],
            selected: {design.pageSize},
            onSelectionChanged: (value) =>
                _patchDesign(design.copyWith(pageSize: value.first)),
          ),
          const SizedBox(height: 16),
          Text('Margins (mm)'),
          const SizedBox(height: 8),
          Column(
            children: [
              for (final edge in ['top', 'right', 'bottom', 'left'])
                _marginField(theme, design, edge),
            ],
          ),
          const SizedBox(height: 16),
          Text('Photo'),
          const SizedBox(height: 4),
          Text(
            design.photoUrl == null
                ? 'No photo added'
                : 'Photo added. Photo templates will show it beside your name.',
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            children: [
              OutlinedButton.icon(
                onPressed: _pickPhoto,
                icon: const Icon(Icons.photo_outlined, size: 16),
                label: Text(
                  design.photoUrl == null ? 'Add photo' : 'Replace photo',
                ),
              ),
              if (design.photoUrl != null)
                OutlinedButton.icon(
                  onPressed: () => _patchDesign(design.clearPhoto()),
                  icon: const Icon(Icons.delete_outline, size: 16),
                  label: const Text('Remove photo'),
                ),
            ],
          ),
        ],
      ),
    );
  }

  Future<void> _pickPhoto() async {
    try {
      final result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: const ['png', 'jpg', 'jpeg', 'webp'],
        withData: true,
      );
      if (result == null || result.files.isEmpty) return;
      final file = result.files.first;
      final bytes = file.bytes;
      if (bytes == null) return;
      final extension = (file.extension ?? 'jpeg').toLowerCase();
      final mime = extension == 'png'
          ? 'image/png'
          : extension == 'webp'
          ? 'image/webp'
          : 'image/jpeg';
      final dataUrl = 'data:$mime;base64,${base64Encode(bytes)}';
      if (!mounted) return;
      _patchDesign(_editor.design.copyWith(photoUrl: dataUrl));
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('That photo could not be added.')),
      );
    }
  }

  Widget _marginField(ThemeData theme, ResumeDesign design, String edge) {
    final value = switch (edge) {
      'top' => design.margins.top,
      'right' => design.margins.right,
      'bottom' => design.margins.bottom,
      _ => design.margins.left,
    };
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          SizedBox(width: 74, child: Text(edge.toUpperCase())),
          Expanded(
            child: Slider(
              min: 0,
              max: 30,
              divisions: 30,
              value: value.toDouble(),
              label: value.toString(),
              onChanged: (next) {
                final margins = design.margins;
                final updated = switch (edge) {
                  'top' => margins.copyWith(top: next.toInt()),
                  'right' => margins.copyWith(right: next.toInt()),
                  'bottom' => margins.copyWith(bottom: next.toInt()),
                  _ => margins.copyWith(left: next.toInt()),
                };
                _patchDesign(design.copyWith(margins: updated));
              },
            ),
          ),
          SizedBox(width: 36, child: Text('$value')),
        ],
      ),
    );
  }

  Widget _buildPreview(ThemeData theme) {
    final contact = _editor.contact;
    final sections = _editor.sections;
    return _sectionCard(
      theme,
      title: 'Printable preview',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '${contact.fullName} ${contact.lastName}'.trim(),
            style: theme.textTheme.headlineSmall,
          ),
          if (contact.headline.isNotEmpty) Text(contact.headline),
          if (contact.email.isNotEmpty) Text(contact.email),
          if (contact.phone.isNotEmpty) Text(contact.phone),
          if (contact.location.isNotEmpty) Text(contact.location),
          if (_editor.isLetter) ...[
            if (_editor.coverLetter.subject.isNotEmpty)
              Text(_editor.coverLetter.subject),
            if (_editor.coverLetter.greeting.isNotEmpty)
              Text(_editor.coverLetter.greeting),
            Text(_editor.coverLetter.body),
            if (_editor.coverLetter.signoff.isNotEmpty)
              Text(_editor.coverLetter.signoff),
          ] else
            for (final section in sections) ...[
              const Divider(height: 24),
              Text(section.title, style: theme.textTheme.titleMedium),
              for (final entry in section.entries) ...[
                if (entry.title.isNotEmpty) Text(entry.title),
                if (entry.organisation.isNotEmpty) Text(entry.organisation),
                if (entry.date.isNotEmpty) Text(entry.date),
                if (entry.summary.isNotEmpty) Text(entry.summary),
                for (final bullet in entry.bullets) Text('• $bullet'),
              ],
            ],
          const SizedBox(height: 12),
          Text(
            'Page ${designPageSizeLabel(_editor.design.pageSize)} · '
            'Margins ${_editor.design.margins.top}/${_editor.design.margins.right}/'
            '${_editor.design.margins.bottom}/${_editor.design.margins.left} mm · '
            'Template $_template',
            style: theme.textTheme.bodySmall,
          ),
        ],
      ),
    );
  }

  Widget _buildHeader(ThemeData theme) {
    return _sectionCard(
      theme,
      title: 'Document',
      child: Column(
        children: [
          TextFormField(
            initialValue: _title,
            decoration: const InputDecoration(labelText: 'Title'),
            onChanged: (value) {
              _commit(title: value);
            },
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Chip(
                label: Text(
                  _saving
                      ? 'Saving…'
                      : _dirty
                      ? 'Unsaved changes'
                      : _savedAt == null
                      ? 'Saved'
                      : 'Saved at ${TimeOfDay.fromDateTime(_savedAt!).format(context)}',
                ),
              ),
              const Spacer(),
              Text(_template, style: theme.textTheme.bodySmall),
            ],
          ),
          if (_improvementError != null) ...[
            const SizedBox(height: 8),
            Text(_improvementError!, style: theme.textTheme.bodySmall),
          ],
        ],
      ),
    );
  }

  Widget _buildModeTabs(ThemeData theme) {
    return SegmentedButton<int>(
      segments: const [
        ButtonSegment(value: 0, label: Text('Edit'), icon: Icon(Icons.edit)),
        ButtonSegment(
          value: 1,
          label: Text('Design'),
          icon: Icon(Icons.palette),
        ),
        ButtonSegment(
          value: 2,
          label: Text('Preview'),
          icon: Icon(Icons.visibility),
        ),
      ],
      selected: {_tab},
      onSelectionChanged: (value) => setState(() => _tab = value.first),
    );
  }

  Widget _sectionCard(
    ThemeData theme, {
    required String title,
    required Widget child,
  }) {
    return Container(
      decoration: BoxDecoration(
        border: Border.all(color: theme.dividerColor),
        borderRadius: BorderRadius.circular(14),
      ),
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: theme.textTheme.titleMedium),
          const SizedBox(height: 10),
          child,
        ],
      ),
    );
  }

  Widget _buttonLike(
    ThemeData theme, {
    required String label,
    required bool selected,
    required VoidCallback onTap,
  }) {
    return SizedBox(
      width: double.infinity,
      child: OutlinedButton(
        style: OutlinedButton.styleFrom(
          backgroundColor: selected ? theme.colorScheme.primaryContainer : null,
        ),
        onPressed: onTap,
        child: Text(label),
      ),
    );
  }

  Widget _textField(
    ThemeData theme,
    String label,
    String value,
    ValueChanged<String> onChanged, {
    TextInputType? keyboardType,
    int maxLines = 1,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: TextFormField(
        initialValue: value,
        keyboardType: keyboardType,
        maxLines: maxLines,
        decoration: InputDecoration(labelText: label),
        onChanged: onChanged,
      ),
    );
  }

  Widget _colorSwatch(String colour, String current, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 34,
        height: 34,
        decoration: BoxDecoration(
          color: Color(int.parse(colour.replaceFirst('#', '0xFF'))),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: colour == current ? Colors.orange : Colors.transparent,
            width: 2,
          ),
        ),
      ),
    );
  }
}

/// Mobile fallback key kept in sync with the web default.
const String defaultResumeTemplateKeyMobile = 'zen';

String designPageSizeLabel(String key) => key == 'a4' ? 'A4' : 'Letter';

String definitionEntryLabel(ResumeSection section) => resumeSectionCatalogue
    .firstWhere(
      (row) => row.type == section.type,
      orElse: () =>
          (type: 'custom', label: 'Custom section', entryLabel: 'entry'),
    )
    .entryLabel;
