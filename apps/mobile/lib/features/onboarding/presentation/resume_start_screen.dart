import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../../shared/widgets/app_states.dart';
import 'resume_onboarding_controller.dart';

/// The first screen a candidate sees after signing up or signing in for the
/// first time: pick one of three ways to get a resume.
///
/// The flow mirrors the web onboarding — upload an existing file, import a
/// LinkedIn profile, or build one from scratch — and always ends on the
/// matching-preferences screen so location-first matching has data to work
/// with.
class ResumeStartScreen extends StatelessWidget {
  const ResumeStartScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Build your resume')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
          children: [
            Text('Three ways to start', style: theme.textTheme.headlineSmall),
            const SizedBox(height: 8),
            Text(
              'We structure everything into an ATS-ready document and check it '
              'for you — nothing here is manual.',
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 24),
            _StartOption(
              icon: Icons.upload_file_rounded,
              title: 'Upload your resume',
              body: 'PDF, DOCX or a photo of a printed resume.',
              points: const [
                'Extracted and structured automatically',
                'ATS-checked the moment it is built',
              ],
              onTap: () => context.push('/resume/upload'),
            ),
            const SizedBox(height: 16),
            _StartOption(
              icon: Icons.link_rounded,
              title: 'Import from LinkedIn',
              body: 'Sign in and we convert your profile into a resume.',
              points: const [
                'Experience, education and skills',
                'Or paste a public profile URL instead',
              ],
              onTap: () => context.push('/resume/linkedin'),
            ),
            const SizedBox(height: 16),
            _StartOption(
              icon: Icons.edit_note_rounded,
              title: 'Build it manually',
              body: 'Answer a few questions and we draft the rest.',
              points: const ['Guided steps', 'You control every word'],
              onTap: () => context.push('/resume/manual'),
            ),
            const SizedBox(height: 24),
            TextButton(
              onPressed: () => context.go('/home/opportunities'),
              child: const Text('Skip for now'),
            ),
          ],
        ),
      ),
    );
  }
}

class _StartOption extends StatelessWidget {
  const _StartOption({
    required this.icon,
    required this.title,
    required this.body,
    required this.points,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String body;
  final List<String> points;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  CircleAvatar(
                    backgroundColor: theme.colorScheme.primaryContainer,
                    foregroundColor: theme.colorScheme.onPrimaryContainer,
                    child: Icon(icon),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(title, style: theme.textTheme.titleMedium),
                  ),
                  const Icon(Icons.chevron_right_rounded),
                ],
              ),
              const SizedBox(height: 10),
              Text(
                body,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 10),
              for (final point in points)
                Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: Row(
                    children: [
                      Icon(
                        Icons.check_circle_outline_rounded,
                        size: 16,
                        color: theme.colorScheme.primary,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(point, style: theme.textTheme.bodySmall),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Routes to the right onboarding path so the router has a single entry point.
class ResumePathScreen extends StatelessWidget {
  const ResumePathScreen({super.key, required this.path});

  /// One of `upload`, `linkedin` or `manual`.
  final String path;

  @override
  Widget build(BuildContext context) {
    switch (path) {
      case 'upload':
        return const ResumeUploadScreen();
      case 'linkedin':
        return const ResumeLinkedInScreen();
      case 'manual':
        return const ResumeManualScreen();
      default:
        return const ErrorState(message: 'That path is not available.');
    }
  }
}

/// Upload a file; the resume builder agent extracts and structures it.
class ResumeUploadScreen extends StatefulWidget {
  const ResumeUploadScreen({super.key});

  @override
  State<ResumeUploadScreen> createState() => _ResumeUploadScreenState();
}

class _ResumeUploadScreenState extends State<ResumeUploadScreen> {
  PlatformFile? _file;
  Uint8List? _bytes;
  int? _size;
  String? _error;

  Future<void> _pick() async {
    setState(() => _error = null);
    try {
      final picked = await FilePicker.pickFiles(
        type: FileType.custom,
        allowedExtensions: const ['pdf', 'docx', 'png', 'jpg', 'jpeg', 'webp'],
      );
      if (picked.isEmpty) return;
      final file = picked.first;
      final bytes = await file.readAsBytes();
      final size = await file.length();
      if (!mounted) return;
      setState(() {
        _file = file;
        _bytes = bytes;
        _size = size ?? bytes.length;
      });
    } catch (error) {
      setState(() => _error = 'That file could not be read.');
    }
  }

  Future<void> _import() async {
    final file = _file;
    final bytes = _bytes;
    if (file == null || bytes == null) return;

    final controller = context.read<ResumeOnboardingController>();
    await controller.importFile(
      filename: file.name,
      contentType: contentTypeFor(file),
      bytes: bytes,
    );
    if (!mounted) return;
    if (controller.document != null) {
      context.pushReplacement('/onboarding/preferences');
      return;
    }
    setState(() => _error = controller.errorMessage);
  }

  /// file_picker no longer reports a mime type, so map the extension instead.
  String contentTypeFor(PlatformFile file) {
    switch (file.extension?.toLowerCase()) {
      case 'pdf':
        return 'application/pdf';
      case 'docx':
        return 'application/vnd.openxmlformats-officedocument'
            '.wordprocessingml.document';
      case 'png':
        return 'image/png';
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'webp':
        return 'image/webp';
      default:
        return 'application/octet-stream';
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final file = _file;
    final size = _size ?? 0;
    return Scaffold(
      appBar: AppBar(title: const Text('Upload resume')),
      body: FormScaffold(
        description:
            'Pick a PDF, DOCX or a photo of your resume. We read the text and '
            'rebuild it as a clean, ATS-ready document.',
        busy: context.watch<ResumeOnboardingController>().isWorking,
        errorMessage: _error,
        actions: [
          FilledButton.icon(
            onPressed: _pick,
            icon: const Icon(Icons.folder_open_rounded),
            label: Text(file == null ? 'Choose file' : 'Choose another file'),
          ),
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: file == null ? null : _import,
            icon: const Icon(Icons.auto_awesome_rounded),
            label: const Text('Extract & build resume'),
          ),
        ],
        header: file == null
            ? null
            : Card(
                color: theme.colorScheme.surfaceContainerHighest,
                child: ListTile(
                  leading: const Icon(Icons.description_outlined),
                  title: Text(file.name),
                  subtitle: Text('${(size / 1024).toStringAsFixed(0)} KB'),
                ),
              ),
      ),
    );
  }
}

/// Imports a public LinkedIn profile URL.
class ResumeLinkedInScreen extends StatefulWidget {
  const ResumeLinkedInScreen({super.key});

  @override
  State<ResumeLinkedInScreen> createState() => _ResumeLinkedInScreenState();
}

class _ResumeLinkedInScreenState extends State<ResumeLinkedInScreen> {
  final _url = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _url.dispose();
    super.dispose();
  }

  Future<void> _import() async {
    final url = _url.text.trim();
    if (url.isEmpty) {
      setState(() => _error = 'Paste your profile URL.');
      return;
    }
    final controller = context.read<ResumeOnboardingController>();
    await controller.importProfile(url);
    if (!mounted) return;
    if (controller.document != null) {
      context.pushReplacement('/onboarding/preferences');
      return;
    }
    setState(() => _error = controller.errorMessage);
  }

  @override
  Widget build(BuildContext context) {
    final busy = context.watch<ResumeOnboardingController>().isWorking;
    return Scaffold(
      appBar: AppBar(title: const Text('Import from LinkedIn')),
      body: FormScaffold(
        description:
            'LinkedIn sign-in runs on the web app. On your phone, paste your '
            'public profile URL and we read it.',
        busy: busy,
        errorMessage: _error,
        actions: [
          TextField(
            controller: _url,
            keyboardType: TextInputType.url,
            decoration: const InputDecoration(
              labelText: 'Profile URL',
              hintText: 'https://www.linkedin.com/in/your-name',
            ),
          ),
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: busy ? null : _import,
            icon: const Icon(Icons.download_rounded),
            label: const Text('Import profile'),
          ),
        ],
      ),
    );
  }
}

/// A deliberately small manual form: the resume builder agent fills the rest.
class ResumeManualScreen extends StatefulWidget {
  const ResumeManualScreen({super.key});

  @override
  State<ResumeManualScreen> createState() => _ResumeManualScreenState();
}

class _ResumeManualScreenState extends State<ResumeManualScreen> {
  final _fields = <TextEditingController>[];
  String? _error;

  @override
  void initState() {
    super.initState();
    for (var i = 0; i < 10; i++) {
      _fields.add(TextEditingController());
    }
  }

  @override
  void dispose() {
    for (final controller in _fields) {
      controller.dispose();
    }
    super.dispose();
  }

  static List<String> _split(String value) => value
      .split(',')
      .map((item) => item.trim())
      .where((item) => item.isNotEmpty)
      .toList();

  Future<void> _save() async {
    final fullName = _fields[0].text.trim();
    if (fullName.isEmpty) {
      setState(() => _error = 'Your name is required.');
      return;
    }
    final controller = context.read<ResumeOnboardingController>();
    await controller.saveManual(<String, dynamic>{
      'fullName': fullName,
      'headline': _fields[1].text.trim(),
      'location': _fields[2].text.trim(),
      'country': _fields[3].text.trim(),
      'email': _fields[4].text.trim(),
      'phone': _fields[5].text.trim(),
      'linkedin': _fields[6].text.trim(),
      'summary': _fields[7].text.trim(),
      'skills': _split(_fields[8].text),
      'desiredRoles': _split(_fields[9].text),
      'seniority': 'junior',
      'yearsExperience': 0,
      'experiences': const [],
      'education': const [],
      'projects': const [],
    });
    if (!mounted) return;
    if (controller.document != null) {
      context.pushReplacement('/onboarding/preferences');
      return;
    }
    setState(() => _error = controller.errorMessage);
  }

  @override
  Widget build(BuildContext context) {
    final busy = context.watch<ResumeOnboardingController>().isWorking;
    const labels = [
      'Full name',
      'Headline',
      'City',
      'Country',
      'Email',
      'Phone',
      'LinkedIn URL',
      'Summary',
      'Skills (comma separated)',
      'Target roles (comma separated)',
    ];
    const hints = [
      'Jane Doe',
      'Backend Engineer · Payments',
      'Nairobi',
      'Kenya',
      'jane@example.com',
      '+254 7XX XXX XXX',
      'linkedin.com/in/janedoe',
      'Two or three sentences about what you do best.',
      'TypeScript, Postgres, AWS',
      'Backend Engineer, Platform Engineer',
    ];

    return Scaffold(
      appBar: AppBar(title: const Text('Build your resume')),
      body: FormScaffold(
        description:
            'Answer the basics. We turn them into a full ATS-ready resume.',
        busy: busy,
        errorMessage: _error,
        actions: [
          for (var i = 0; i < _fields.length; i++)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: TextField(
                controller: _fields[i],
                textCapitalization: TextCapitalization.words,
                maxLines: labels[i] == 'Summary' ? 3 : 1,
                keyboardType: i == 4
                    ? TextInputType.emailAddress
                    : i == 5
                    ? TextInputType.phone
                    : TextInputType.text,
                decoration: InputDecoration(
                  labelText: labels[i],
                  hintText: hints[i],
                ),
              ),
            ),
          FilledButton.icon(
            onPressed: busy ? null : _save,
            icon: const Icon(Icons.check_rounded),
            label: const Text('Create resume'),
          ),
        ],
      ),
    );
  }
}

/// Shared scaffolding for the three path screens.
class FormScaffold extends StatelessWidget {
  const FormScaffold({
    super.key,
    required this.description,
    required this.actions,
    this.header,
    this.busy = false,
    this.errorMessage,
  });

  final String description;
  final List<Widget> actions;
  final Widget? header;
  final bool busy;
  final String? errorMessage;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            description,
            style: theme.textTheme.bodyMedium?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
          if (busy) ...[
            const SizedBox(height: 16),
            const LinearProgressIndicator(),
          ],
          if (header != null) ...[const SizedBox(height: 16), header!],
          if (errorMessage != null) ...[
            const SizedBox(height: 16),
            Text(
              errorMessage!,
              style: TextStyle(color: theme.colorScheme.error),
            ),
          ],
          const SizedBox(height: 20),
          ...actions,
        ],
      ),
    );
  }
}
