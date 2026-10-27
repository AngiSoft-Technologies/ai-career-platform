import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../../../shared/widgets/app_states.dart';
import '../../applications/presentation/application_controller.dart';
import '../domain/application_analysis.dart';
import '../domain/application_workspace.dart';
import 'application_workspace_controller.dart';

class ApplicationApplyScreen extends StatefulWidget {
  const ApplicationApplyScreen({super.key, required this.applicationId});

  final String applicationId;

  @override
  State<ApplicationApplyScreen> createState() => _ApplicationApplyScreenState();
}

class _ApplicationApplyScreenState extends State<ApplicationApplyScreen> {
  ApplicationWorkspace? _workspace;
  ApplicationAnalysis? _analysis;
  String? _error;
  bool _loading = true;
  bool _analyzing = false;
  bool _analysisFailed = false;
  bool _changingStatus = false;
  bool _confirmSubmission = false;
  int _webProgress = 0;
  List<bool> _checks = List.filled(4, false);
  Map<String, String> _answers = {};
  List<Map<String, dynamic>> _liveFields = const [];
  List<String> _liveQuestions = const [];
  String? _livePageTitle;
  bool _readingPage = false;
  String _subjectDraft = '';
  String _messageDraft = '';
  late final WebViewController _webController;

  String get _progressKey => 'application-guide:${widget.applicationId}';

  @override
  void initState() {
    super.initState();
    _webController = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(
        NavigationDelegate(
          onProgress: (progress) {
            if (mounted) setState(() => _webProgress = progress);
          },
          onPageFinished: (_) => _readCurrentPage(announce: false),
          onWebResourceError: (error) {
            if (error.isForMainFrame ?? true) {
              if (mounted) {
                setState(
                  () => _error = 'The employer page could not be loaded.',
                );
              }
            }
          },
          onNavigationRequest: (request) {
            final uri = Uri.tryParse(request.url);
            if (uri == null) return NavigationDecision.prevent;
            if (uri.scheme == 'http' || uri.scheme == 'https') {
              return NavigationDecision.navigate;
            }
            if (uri.scheme == 'mailto' || uri.scheme == 'tel') {
              launchUrl(uri, mode: LaunchMode.externalApplication);
            }
            return NavigationDecision.prevent;
          },
        ),
      );
    WidgetsBinding.instance.addPostFrameCallback((_) => _prepare());
  }

  Future<void> _prepare() async {
    final applicationController = context.read<ApplicationController>();
    final workspaceController = context.read<ApplicationWorkspaceController>();
    try {
      final preferences = await SharedPreferences.getInstance();
      final saved = preferences.getString(_progressKey);
      if (saved != null) {
        final data = jsonDecode(saved);
        if (data is Map) {
          final checks = data['checks'];
          if (checks is List) {
            _checks = List<bool>.generate(
              4,
              (index) => index < checks.length && checks[index] == true,
            );
          }
          final answers = data['answers'];
          if (answers is Map) {
            _answers = answers.map((key, value) => MapEntry('$key', '$value'));
          }
          _subjectDraft = data['subject'] as String? ?? '';
          _messageDraft = data['message'] as String? ?? '';
        }
      }

      final application = await applicationController.getApplication(
        widget.applicationId,
      );
      final workspace = await workspaceController.getWorkspace(
        widget.applicationId,
      );
      if (!mounted) return;
      setState(() => _workspace = workspace);
      final initialUrl = Uri.tryParse(workspace.applicationUrl);
      if (initialUrl != null &&
          {'http', 'https'}.contains(initialUrl.scheme) &&
          workspace.method != 'email') {
        _webController.loadRequest(initialUrl);
      }

      var current = application;
      if (current.status == 'SHORTLISTED') {
        final moved = await applicationController.updateStatus(
          current,
          status: 'ANALYZED',
        );
        if (moved) {
          current = applicationController.items.firstWhere(
            (item) => item.id == current.id,
          );
        }
      }
      if (current.status == 'ANALYZED') {
        await applicationController.updateStatus(
          current,
          status: 'APPLICATION_PREPARATION',
        );
      }

      if (mounted) {
        setState(() {
          _loading = false;
          _analyzing = true;
        });
      }
      try {
        final analysis = await workspaceController.analyzeApplication(
          widget.applicationId,
        );
        if (!mounted) return;
        setState(() {
          _analysis = analysis;
          _subjectDraft = _subjectDraft.isNotEmpty
              ? _subjectDraft
              : analysis.emailSubject ?? '';
          _messageDraft = _messageDraft.isNotEmpty
              ? _messageDraft
              : analysis.emailBody ?? '';
          if (!(analysis.analysisUrl.startsWith('https://') ||
                  analysis.analysisUrl.startsWith('http://')) &&
              analysis.method != 'email') {
            _error = 'The employer link is not a valid website address.';
          }
        });
      } catch (_) {
        if (mounted) setState(() => _analysisFailed = true);
      } finally {
        if (mounted) setState(() => _analyzing = false);
      }

      await _saveProgress();
      if (mounted) setState(() => _loading = false);
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.toString();
        _loading = false;
      });
    }
  }

  Future<void> _saveProgress() async {
    final preferences = await SharedPreferences.getInstance();
    await preferences.setString(
      _progressKey,
      jsonEncode({
        'checks': _checks,
        'answers': _answers,
        'subject': _subjectDraft,
        'message': _messageDraft,
      }),
    );
  }

  Future<void> _setAnswer(String question, String answer) async {
    _answers[question] = answer;
    await _saveProgress();
  }

  Future<void> _openExternal(String value) async {
    final uri = Uri.tryParse(value);
    if (uri == null || !{'http', 'https'}.contains(uri.scheme)) return;
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  Future<void> _readCurrentPage({bool announce = true}) async {
    if (!mounted || _readingPage) return;
    setState(() => _readingPage = true);
    const script = r'''JSON.stringify({
      title: document.title || '',
      fields: Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select, [role="textbox"]'))
        .filter((el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; })
        .slice(0, 100)
        .map((el) => ({
          label: (el.labels ? Array.from(el.labels).map(label => label.innerText).join(' ').trim() : '') || el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('name') || el.id || 'Unlabelled field',
          type: el.tagName.toLowerCase() === 'textarea' ? 'long answer' : el.tagName.toLowerCase() === 'select' ? 'choice' : (el.type || 'text'),
          required: el.required === true || el.getAttribute('aria-required') === 'true',
          placeholder: el.getAttribute('placeholder') || '',
          options: el.tagName.toLowerCase() === 'select' ? Array.from(el.options).map(option => option.text).filter(Boolean).slice(0, 20) : []
        })),
      questions: Array.from(document.querySelectorAll('label, legend, h1, h2, h3, h4, [role="heading"]'))
        .map(el => (el.innerText || '').trim().replace(/\s+/g, ' '))
        .filter(text => text.length > 12 && text.length < 320 && text.includes('?'))
        .slice(0, 30)
    })''';
    try {
      dynamic result = await _webController.runJavaScriptReturningResult(
        script,
      );
      if (result is String) {
        result = jsonDecode(result);
        if (result is String) result = jsonDecode(result);
      }
      if (result is Map) {
        final fields = result['fields'];
        final questions = result['questions'];
        setState(() {
          _livePageTitle = result['title'] as String?;
          _liveFields = fields is List
              ? fields
                    .whereType<Map>()
                    .map((field) => Map<String, dynamic>.from(field))
                    .toList()
              : const [];
          _liveQuestions = questions is List
              ? questions.whereType<String>().toList()
              : const [];
        });
        if (announce && mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                'Read ${_liveFields.length} visible fields from the employer page.',
              ),
            ),
          );
        }
      }
    } catch (_) {
      if (announce && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'This employer page did not expose readable form fields. You can still follow its steps directly.',
            ),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _readingPage = false);
    }
  }

  String _emailRecipient(ApplicationWorkspace workspace) {
    final detected = _analysis?.emailRecipient;
    if (detected != null && detected.isNotEmpty) return detected;
    final uri = Uri.tryParse(workspace.applicationUrl);
    if (uri?.scheme == 'mailto') return uri!.path;
    return RegExp(r'^[^\s:/?#]+@[^\s:/?#]+\.[^\s:/?#]+$')
            .hasMatch(workspace.applicationUrl)
        ? workspace.applicationUrl
        : '';
  }

  Future<void> _openEmail() async {
    final workspace = _workspace;
    if (workspace == null) return;
    final recipient = _emailRecipient(workspace);
    if (recipient.isEmpty) return;
    final analysis =
        _analysis ??
        const ApplicationAnalysis(
          platform: 'email',
          method: 'email',
          analysisUrl: '',
          fields: [],
          questions: [],
          requiredDocuments: [],
          instructions: [],
          requiresUserInput: [],
        );
    final subject = _subjectDraft.isNotEmpty
        ? _subjectDraft
        : _emailSubject(analysis);
    final body = _messageDraft.isNotEmpty
        ? _messageDraft
        : _emailBody(analysis);
    final uri = Uri(
      scheme: 'mailto',
      path: recipient,
      queryParameters: {'subject': subject, 'body': body},
    );
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  String _emailSubject(ApplicationAnalysis analysis) =>
      analysis.emailSubject ??
      Uri.tryParse(_workspace?.applicationUrl ?? '')
          ?.queryParameters['subject'] ??
      'Application for ${_workspace?.opportunity?.title ?? 'this role'}';

  String _emailBody(ApplicationAnalysis analysis) =>
      analysis.emailBody ??
      Uri.tryParse(_workspace?.applicationUrl ?? '')?.queryParameters['body'] ??
      'Hello,\n\nI am applying for the ${_workspace?.opportunity?.title ?? 'role'} position${_workspace?.opportunity?.companyName.isNotEmpty == true ? ' at ${_workspace!.opportunity!.companyName}' : ''}. I have attached my application documents for your review.\n\nKind regards';

  Future<void> _markReady() async {
    if (!_checks.every((check) => check)) return;
    final controller = context.read<ApplicationController>();
    final application = await controller.getApplication(widget.applicationId);
    if (application.status == 'APPLICATION_PREPARATION') {
      setState(() => _changingStatus = true);
      await controller.updateStatus(application, status: 'READY_TO_APPLY');
      if (mounted) setState(() => _changingStatus = false);
    }
  }

  Future<void> _markSubmitted() async {
    final controller = context.read<ApplicationController>();
    final application = await controller.getApplication(widget.applicationId);
    setState(() => _changingStatus = true);
    final updated = await controller.updateStatus(
      application,
      status: 'APPLIED',
    );
    if (mounted) {
      setState(() {
        _changingStatus = false;
        _confirmSubmission = false;
      });
      if (updated) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Application marked as submitted.')),
        );
      }
    }
  }

  Future<void> _showSteps() async {
    final workspace = _workspace;
    if (workspace == null) return;
    final analysis =
        _analysis ??
        ApplicationAnalysis(
          platform: workspace.platform,
          method: workspace.method,
          analysisUrl: workspace.applicationUrl,
          fields: const [],
          questions: const [],
          requiredDocuments: workspace.requiredDocuments,
          instructions: workspace.instructions.isEmpty
              ? const [
                  'Follow the employer’s instructions and review the form before submitting.',
                ]
              : [workspace.instructions],
          requiresUserInput: const [],
        );
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (sheetContext) => StatefulBuilder(
        builder: (context, setSheetState) => SafeArea(
          child: FractionallySizedBox(
            heightFactor: .86,
            child: ListView(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
              children: [
                Text(
                  'Follow the employer’s steps',
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                const SizedBox(height: 6),
                Text(
                  'Check each item as you complete it. Your progress is saved on this device.',
                ),
                const SizedBox(height: 12),
                for (var index = 0; index < 4; index++)
                  CheckboxListTile(
                    contentPadding: EdgeInsets.zero,
                    value: _checks[index],
                    title: Text(_stepLabels(analysis)[index]),
                    controlAffinity: ListTileControlAffinity.leading,
                    onChanged: (value) {
                      setSheetState(() => _checks[index] = value ?? false);
                      setState(() {});
                      _saveProgress();
                    },
                  ),
                if (analysis.instructions.isNotEmpty) ...[
                  const Divider(height: 28),
                  Text(
                    'Employer instructions',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 8),
                  for (final instruction in analysis.instructions)
                    ListTile(
                      dense: true,
                      leading: const Icon(Icons.info_outline),
                      title: Text(instruction),
                    ),
                ],
                if (analysis.fields.isNotEmpty) ...[
                  const Divider(height: 28),
                  Text(
                    'Fields found on the application page',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 8),
                  for (final field in analysis.fields)
                    ListTile(
                      dense: true,
                      leading: Icon(
                        field['required'] == true
                            ? Icons.star_outline
                            : Icons.text_fields,
                      ),
                      title: Text(
                        '${field['label'] ?? field['key'] ?? 'Application field'}${field['required'] == true ? ' · required' : ''}',
                      ),
                      subtitle: field['suggestedValue'] == null
                          ? const Text('Fill this in on the employer’s form.')
                          : Text(
                              'Profile suggestion: ${field['suggestedValue']}',
                            ),
                    ),
                ],
                if (_liveFields.isNotEmpty) ...[
                  const Divider(height: 28),
                  Text(
                    _livePageTitle?.isNotEmpty == true
                        ? 'Visible fields on ${_livePageTitle!}'
                        : 'Visible fields on this page',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 8),
                  for (final field in _liveFields)
                    ListTile(
                      dense: true,
                      leading: Icon(
                        field['required'] == true
                            ? Icons.star_outline
                            : Icons.text_fields,
                      ),
                      title: Text(
                        '${field['label'] ?? 'Application field'}${field['required'] == true ? ' · required' : ''}',
                      ),
                      subtitle: Text(
                        '${field['type'] ?? 'text'}${(field['placeholder'] as String? ?? '').isNotEmpty ? ' · ${field['placeholder']}' : ''}',
                      ),
                    ),
                ],
                if (_liveQuestions.isNotEmpty) ...[
                  const Divider(height: 28),
                  Text(
                    'Questions visible on this page',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 8),
                  for (final question in _liveQuestions)
                    ListTile(
                      dense: true,
                      leading: const Icon(Icons.help_outline),
                      title: Text(question),
                    ),
                ],
                if (analysis.questions.isNotEmpty) ...[
                  const Divider(height: 28),
                  Text(
                    'Questions to prepare',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 8),
                  for (final item in analysis.questions)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: TextFormField(
                        initialValue:
                            _answers[item['question'] as String? ?? ''],
                        minLines: 2,
                        maxLines: 5,
                        decoration: InputDecoration(
                          labelText: item['question'] as String? ?? 'Question',
                          border: const OutlineInputBorder(),
                        ),
                        onChanged: (value) => _setAnswer(
                          item['question'] as String? ?? '',
                          value,
                        ),
                      ),
                    ),
                ],
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  onPressed: () {
                    Navigator.pop(sheetContext);
                    context.push('/home/profile/documents');
                  },
                  icon: const Icon(Icons.description_outlined),
                  label: const Text('Review or generate application documents'),
                ),
                const SizedBox(height: 8),
                FilledButton(
                  onPressed: () => Navigator.pop(sheetContext),
                  child: const Text('Back to employer page'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  List<String> _stepLabels(ApplicationAnalysis analysis) {
    if (analysis.method == 'email') {
      return const [
        'I verified the recipient and subject line',
        'I prepared and attached the requested documents',
        'I reviewed the message and corrected it in my own words',
        'I checked the recipient and attachments before sending',
      ];
    }
    return const [
      'I checked the role, employer, and application link',
      'I prepared the documents the employer requests',
      'I completed the required fields and application questions',
      'I reviewed the completed form before submitting it',
    ];
  }

  @override
  Widget build(BuildContext context) {
    final analysis = _analysis;
    final workspace = _workspace;
    if (_loading) {
      return const Scaffold(
        body: LoadingState(label: 'Preparing your application guide…'),
      );
    }
    if (workspace == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Guided application')),
        body: ErrorState(
          message: _error ?? 'Could not load this application.',
          onRetry: _prepare,
        ),
      );
    }
    final isEmail = analysis?.method == 'email' || workspace.method == 'email';
    return Scaffold(
      appBar: AppBar(
        title: Text(
          isEmail
              ? 'Email application'
              : 'Apply with ${workspace.opportunity?.companyName ?? 'employer'}',
        ),
        actions: [
          if (!isEmail)
            IconButton(
              tooltip: 'Reload employer page',
              onPressed: () => _webController.reload(),
              icon: const Icon(Icons.refresh),
            ),
          if (!isEmail)
            IconButton(
              tooltip: 'Read visible form fields from this page',
              onPressed: _readingPage ? null : () => _readCurrentPage(),
              icon: _readingPage
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.document_scanner_outlined),
            ),
          if (!isEmail)
            IconButton(
              tooltip: 'Open in browser',
              onPressed: () => _openExternal(
                analysis?.analysisUrl ?? workspace.applicationUrl,
              ),
              icon: const Icon(Icons.open_in_new),
            ),
          IconButton(
            tooltip: 'Review steps and instructions',
            onPressed: _showSteps,
            icon: const Icon(Icons.checklist),
          ),
        ],
      ),
      body: isEmail
          ? _emailBodyView(context, analysis, workspace)
          : Column(
              children: [
                _progressHeader(context, analysis),
                if (_webProgress < 100)
                  LinearProgressIndicator(
                    value: _webProgress == 0 ? null : _webProgress / 100,
                  ),
                Expanded(
                  child: _error != null
                      ? _webViewError(context)
                      : WebViewWidget(controller: _webController),
                ),
                _footerActions(context, analysis),
              ],
            ),
    );
  }

  Widget _progressHeader(BuildContext context, ApplicationAnalysis? analysis) {
    final complete = _checks.where((value) => value).length;
    return Material(
      color: Theme.of(context).colorScheme.surfaceContainerLow,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Your application steps',
                    style: Theme.of(context).textTheme.titleSmall
                        ?.copyWith(fontWeight: FontWeight.w700),
                  ),
                ),
                Text(
                  '$complete of 4 reviewed',
                  style: Theme.of(context).textTheme.labelMedium,
                ),
                const SizedBox(width: 8),
                TextButton(onPressed: _showSteps, child: const Text('Review')),
              ],
            ),
            LinearProgressIndicator(value: complete / 4),
            if (analysis == null && _analysisFailed)
              const Padding(
                padding: EdgeInsets.only(top: 8),
                child: Text(
                  'We could not read the employer’s page. Follow their instructions directly and use Review for the preparation checklist.',
                ),
              )
            else if (_analyzing)
              const Padding(
                padding: EdgeInsets.only(top: 8),
                child: Text(
                  'Reading the employer’s application page for fields and instructions…',
                ),
              )
            else if (analysis?.instructions.isNotEmpty == true)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(
                  analysis!.instructions.first,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _emailBodyView(
    BuildContext context,
    ApplicationAnalysis? analysis,
    ApplicationWorkspace workspace,
  ) {
    final recipient = _emailRecipient(workspace);
    final subject = _emailSubject(
      analysis ??
          const ApplicationAnalysis(
            platform: 'email',
            method: 'email',
            analysisUrl: '',
            fields: [],
            questions: [],
            requiredDocuments: [],
            instructions: [],
            requiresUserInput: [],
          ),
    );
    final body = _emailBody(
      analysis ??
          const ApplicationAnalysis(
            platform: 'email',
            method: 'email',
            analysisUrl: '',
            fields: [],
            questions: [],
            requiredDocuments: [],
            instructions: [],
            requiresUserInput: [],
          ),
    );
    final applications = context
        .watch<ApplicationController>()
        .items
        .where((item) => item.id == widget.applicationId)
        .toList();
    final readyToApply =
        applications.isNotEmpty &&
        applications.first.status == 'READY_TO_APPLY';
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(
          workspace.opportunity?.title ?? 'Application email',
          style: Theme.of(context).textTheme.headlineSmall,
        ),
        const SizedBox(height: 4),
        Text(
          'Review the details and attach the requested files in your email app.',
        ),
        const SizedBox(height: 16),
        TextFormField(
          initialValue: recipient,
          readOnly: true,
          decoration: InputDecoration(
            labelText: 'To',
            helperText: recipient.isEmpty
                ? 'Check the employer listing for the correct recipient.'
                : null,
            border: const OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 12),
        TextFormField(
          initialValue: subject,
          decoration: const InputDecoration(
            labelText: 'Subject',
            border: OutlineInputBorder(),
          ),
          onChanged: (value) {
            _subjectDraft = value;
            _saveProgress();
          },
        ),
        const SizedBox(height: 12),
        TextFormField(
          initialValue: body,
          minLines: 6,
          maxLines: 10,
          decoration: const InputDecoration(
            labelText: 'Suggested message — review before sending',
            border: OutlineInputBorder(),
          ),
          onChanged: (value) {
            _messageDraft = value;
            _saveProgress();
          },
        ),
        const SizedBox(height: 14),
        SectionCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Documents to attach',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 8),
              for (final document
                  in analysis?.requiredDocuments ?? workspace.requiredDocuments)
                ListTile(
                  dense: true,
                  leading: const Icon(Icons.attach_file),
                  title: Text(document),
                ),
              OutlinedButton.icon(
                onPressed: () => context.push('/home/profile/documents'),
                icon: const Icon(Icons.description_outlined),
                label: const Text('Review or generate documents'),
              ),
            ],
          ),
        ),
        if (analysis?.instructions.isNotEmpty == true) ...[
          const SizedBox(height: 14),
          for (final instruction in analysis!.instructions)
            ListTile(
              dense: true,
              leading: const Icon(Icons.info_outline),
              title: Text(instruction),
            ),
        ],
        const SizedBox(height: 12),
        FilledButton.icon(
          onPressed: recipient.isEmpty
              ? null
              : readyToApply
              ? _openEmail
              : _showSteps,
          icon: const Icon(Icons.mail_outline),
          label: Text(
            readyToApply ? 'Open email app' : 'Review steps before sending',
          ),
        ),
        const SizedBox(height: 8),
        _footerActions(context, analysis),
      ],
    );
  }

  Widget _webViewError(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.open_in_browser_outlined, size: 40),
          const SizedBox(height: 12),
          Text(_error!, textAlign: TextAlign.center),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: () => _openExternal(
              _analysis?.analysisUrl ?? _workspace!.applicationUrl,
            ),
            icon: const Icon(Icons.open_in_new),
            label: const Text('Continue in browser'),
          ),
        ],
      ),
    ),
  );

  Widget _footerActions(BuildContext context, ApplicationAnalysis? analysis) {
    final matches = context
        .watch<ApplicationController>()
        .items
        .where((item) => item.id == widget.applicationId)
        .toList();
    final application = matches.isEmpty ? null : matches.first;
    final status = application?.status ?? 'APPLICATION_PREPARATION';
    if (status == 'APPLIED') {
      return SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: OutlinedButton.icon(
            onPressed: null,
            icon: const Icon(Icons.check_circle),
            label: const Text('Submission recorded'),
          ),
        ),
      );
    }
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (status == 'READY_TO_APPLY' && !_confirmSubmission)
              OutlinedButton(
                onPressed: () => setState(() => _confirmSubmission = true),
                child: Text(
                  analysis?.method == 'email'
                      ? 'I sent the email'
                      : 'I submitted on the employer’s page',
                ),
              )
            else if (status == 'READY_TO_APPLY' && _confirmSubmission)
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () =>
                          setState(() => _confirmSubmission = false),
                      child: const Text('Not yet'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: FilledButton(
                      onPressed: _changingStatus ? null : _markSubmitted,
                      child: const Text('Yes, mark applied'),
                    ),
                  ),
                ],
              )
            else
              FilledButton.icon(
                onPressed: _checks.every((value) => value) && !_changingStatus
                    ? _markReady
                    : _showSteps,
                icon: Icon(
                  _checks.every((value) => value)
                      ? Icons.check
                      : Icons.checklist,
                ),
                label: Text(
                  _checks.every((value) => value)
                      ? 'I’m ready to submit'
                      : 'Review steps to continue',
                ),
              ),
          ],
        ),
      ),
    );
  }
}
