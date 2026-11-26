import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../../core/authentication/api_auth_service.dart';
import '../../../core/authentication/auth_session.dart';
import '../../../shared/widgets/brand_mark.dart';
import '../../../shared/widgets/app_background.dart';

/// Step-up verification for long-lived sessions.
///
/// The API asks for this once the last verification is older than its
/// interval. TOTP is the fast path; the emailed magic link comes back through
/// the same deep link the social sign-in uses, so it needs no extra plumbing.
class VerificationScreen extends StatefulWidget {
  const VerificationScreen({super.key});

  @override
  State<VerificationScreen> createState() => _VerificationScreenState();
}

class _VerificationScreenState extends State<VerificationScreen> {
  final _codeController = TextEditingController();
  String? _selected;
  bool _busy = false;
  bool _linkSent = false;
  String? _error;
  StreamSubscription<Uri>? _linkSub;
  bool _bioAvailable = false;
  bool _bioEnrolled = false;
  List<String> _bioLabels = const [];

  @override
  void initState() {
    super.initState();
    final auth = context.read<AuthSession>();
    unawaited(auth.loadVerificationMethods());
    unawaited(_loadBiometrics(auth));
    _listenForEmailLink(auth);
  }

  Future<void> _loadBiometrics(AuthSession auth) async {
    final available = await auth.biometricsAvailable;
    if (!mounted) return;
    if (!available) {
      setState(() => _bioAvailable = false);
      return;
    }
    final enrolled = await auth.hasBiometricEnrollment();
    final labels = await auth.biometricLabels;
    if (!mounted) return;
    setState(() {
      _bioAvailable = true;
      _bioEnrolled = enrolled;
      _bioLabels = labels;
    });
  }

  String get _bioName {
    if (_bioLabels.isEmpty) return 'biometrics';
    return _bioLabels.join(' or ');
  }

  Future<void> _verifyBiometric() async {
    final auth = context.read<AuthSession>();
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await auth.verifyWithBiometric();
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = _message(error);
      });
    }
  }

  Future<void> _setupBiometric() async {
    final auth = context.read<AuthSession>();
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final enrolled = await auth.enrollBiometric();
      if (!mounted) return;
      if (!enrolled) {
        setState(() {
          _busy = false;
          _error = 'Biometric setup was cancelled.';
        });
        return;
      }
      // Enrolment proves the device once; the step-up itself still needs a
      // fresh challenge, so continue straight into verification.
      await auth.verifyWithBiometric();
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = _message(error);
      });
    }
  }

  @override
  void dispose() {
    _linkSub?.cancel();
    _codeController.dispose();
    super.dispose();
  }

  bool _isAuthCallback(Uri uri) =>
      uri.scheme == kAuthCallbackScheme && uri.host == 'auth';

  Future<void> _listenForEmailLink(AuthSession auth) async {
    final appLinks = AppLinks();

    // The link may already have arrived if the app was backgrounded.
    final initial = await appLinks.getInitialLink();
    if (initial != null && _isAuthCallback(initial)) {
      await _completeLink(auth, initial);
      return;
    }
    final latest = await appLinks.getLatestLink();
    if (latest != null && _isAuthCallback(latest)) {
      await _completeLink(auth, latest);
      return;
    }

    _linkSub = appLinks.uriLinkStream
        .where(_isAuthCallback)
        .listen((uri) => unawaited(_completeLink(auth, uri)));
  }

  Future<void> _completeLink(AuthSession auth, Uri uri) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await auth.completeEmailVerification(uri);
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = _message(error);
      });
    }
  }

  Future<void> _verifyTotp() async {
    final auth = context.read<AuthSession>();
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await auth.verifyWithTotp(_codeController.text.trim());
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = _message(error);
      });
    }
  }

  Future<void> _sendEmailLink() async {
    final auth = context.read<AuthSession>();
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final sent = await auth.sendEmailVerification();
      if (!mounted) return;
      setState(() {
        _busy = false;
        _linkSent = sent;
        if (!sent) _error = 'The email could not be sent right now. Try again.';
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = _message(error);
      });
    }
  }

  String _message(Object error) {
    final text = error.toString();
    return text.startsWith('Exception: ') ? text.substring(11) : text;
  }

  String _methodTitle(String method) {
    switch (method) {
      case 'totp':
        return 'Authenticator app';
      case 'email_link':
        return 'Email link';
      case 'email_otp':
        return 'Email code';
      case 'passkey':
        return 'Passkey';
      case 'biometric':
        return 'This device';
      default:
        return method;
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final auth = context.watch<AuthSession>();
    final methods = auth.verificationMethods;

    // The tapped method wins; otherwise the account default, then the first.
    final preferred = methods.firstWhere(
      (m) => m['isDefault'] == true,
      orElse: () => methods.isNotEmpty ? methods.first : const {},
    );
    final selected = (_selected != null &&
            methods.any((m) => m['method'] == _selected))
        ? _selected!
        : (preferred['method'] as String?) ?? 'email_link';

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: AppBackground(child: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 460),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Center(
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        color: scheme.primaryContainer,
                        borderRadius: BorderRadius.circular(22),
                      ),
                      child: const Padding(
                        padding: EdgeInsets.all(14),
                        child: BrandMark(size: 44),
                      ),
                    ),
                  ),
                  const SizedBox(height: 24),
                  Text(
                    'Verify it is you',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.headlineSmall,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Your session is long-lived, so we check in once in a while. Pick a method and continue.',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.bodyMedium
                        ?.copyWith(color: scheme.onSurfaceVariant),
                  ),
                  const SizedBox(height: 24),

                  if (_bioAvailable) ...[
                    _BioCard(
                      name: _bioName,
                      enrolled: _bioEnrolled,
                      busy: _busy,
                      onVerify: _verifyBiometric,
                      onSetup: _setupBiometric,
                    ),
                    const SizedBox(height: 16),
                  ],

                  if (methods.isEmpty)
                    Text(
                      'No verification methods are enrolled yet. Sign out and back in, or add an authenticator app on the web app.',
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.bodyMedium
                          ?.copyWith(color: scheme.onSurfaceVariant),
                    )
                  else ...[
                    ...methods.map(
                      (method) => Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: _MethodTile(
                          title: _methodTitle(method['method'] as String? ?? ''),
                          destination: method['destination'] as String? ?? '',
                          isDefault: method['isDefault'] == true,
                          selected: selected == method['method'],
                          onTap: () => setState(() {
                            _selected = method['method'] as String;
                            _error = null;
                            _linkSent = false;
                          }),
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    if (selected == 'totp') ...[
                      TextField(
                        controller: _codeController,
                        keyboardType: TextInputType.number,
                        maxLength: 6,
                        decoration: const InputDecoration(
                          labelText: '6-digit code',
                          prefixIcon: Icon(Icons.pin_outlined),
                        ),
                        onSubmitted: (_) => _verifyTotp(),
                      ),
                      const SizedBox(height: 12),
                      FilledButton(
                        onPressed: _busy ||
                                _codeController.text.trim().length != 6
                            ? null
                            : _verifyTotp,
                        child: _busy
                            ? const SizedBox(
                                width: 22,
                                height: 22,
                                child: CircularProgressIndicator(strokeWidth: 2),
                              )
                            : const Text('Verify'),
                      ),
                    ] else if (selected == 'email_link') ...[
                      if (_linkSent)
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: scheme.surfaceContainerHighest,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Text(
                            'Link sent. Open it on this device — it signs you straight back in.',
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                        )
                      else
                        Text(
                          'We will email a single-use link. Opening it on this device signs you back in automatically.',
                          style: Theme.of(context).textTheme.bodySmall
                              ?.copyWith(color: scheme.onSurfaceVariant),
                        ),
                      const SizedBox(height: 12),
                      FilledButton.tonal(
                        onPressed: _busy ? null : _sendEmailLink,
                        child: Text(_linkSent ? 'Send again' : 'Email me a link'),
                      ),
                    ] else if (selected == 'biometric') ...[
                      if (_bioEnrolled)
                        FilledButton.icon(
                          onPressed: _busy ? null : _verifyBiometric,
                          icon: const Icon(Icons.fingerprint),
                          label: Text('Unlock with $_bioName'),
                        )
                      else
                        FilledButton.tonalIcon(
                          onPressed: _busy ? null : _setupBiometric,
                          icon: const Icon(Icons.fingerprint),
                          label: const Text('Set up this device'),
                        ),
                    ] else
                      Text(
                        'That method is not available yet. Choose another one above.',
                        style: Theme.of(context).textTheme.bodySmall
                            ?.copyWith(color: scheme.onSurfaceVariant),
                      ),
                  ],

                  if (_error != null) ...[
                    const SizedBox(height: 14),
                    Semantics(
                      liveRegion: true,
                      child: Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: scheme.errorContainer,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Row(
                          children: [
                            Icon(
                              Icons.error_outline_rounded,
                              color: scheme.onErrorContainer,
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Text(
                                _error!,
                                style: TextStyle(color: scheme.onErrorContainer),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                  const SizedBox(height: 16),
                  TextButton(
                    onPressed: () => context.go('/onboarding'),
                    child: const Text('Sign out and start over'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    ));
  }
}

class _MethodTile extends StatelessWidget {
  const _MethodTile({
    required this.title,
    required this.destination,
    required this.isDefault,
    required this.selected,
    required this.onTap,
  });

  final String title;
  final String destination;
  final bool isDefault;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: selected
              ? scheme.primaryContainer.withValues(alpha: 0.5)
              : scheme.surfaceContainerHighest.withValues(alpha: 0.4),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: selected ? scheme.primary : scheme.outlineVariant,
          ),
        ),
        child: Row(
          children: [
            Icon(
              switch (title) {
                'Authenticator app' => Icons.pin_outlined,
                'This device' => Icons.fingerprint,
                _ => Icons.mail_outline_rounded,
              },
              size: 18,
              color: scheme.primary,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: Theme.of(context).textTheme.bodyMedium),
                  Text(
                    destination,
                    style: Theme.of(context).textTheme.bodySmall
                        ?.copyWith(color: scheme.onSurfaceVariant),
                  ),
                ],
              ),
            ),
            if (isDefault)
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 8,
                  vertical: 2,
                ),
                decoration: BoxDecoration(
                  color: scheme.primaryContainer,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  'default',
                  style: Theme.of(context).textTheme.labelSmall
                      ?.copyWith(color: scheme.onPrimaryContainer),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _BioCard extends StatelessWidget {
  const _BioCard({
    required this.name,
    required this.enrolled,
    required this.busy,
    required this.onVerify,
    required this.onSetup,
  });

  final String name;
  final bool enrolled;
  final bool busy;
  final VoidCallback onVerify;
  final VoidCallback onSetup;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest.withValues(alpha: 0.4),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: scheme.outlineVariant),
      ),
      child: Row(
        children: [
          Icon(Icons.fingerprint, color: scheme.primary),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('This device', style: Theme.of(context).textTheme.bodyMedium),
                Text(
                  enrolled
                      ? 'Unlock with $name — fastest way to verify'
                      : 'Set up $name unlock on this device',
                  style: Theme.of(context).textTheme.bodySmall
                      ?.copyWith(color: scheme.onSurfaceVariant),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          enrolled
              ? FilledButton.tonalIcon(
                  onPressed: busy ? null : onVerify,
                  icon: const Icon(Icons.fingerprint, size: 18),
                  label: const Text('Unlock'),
                )
              : FilledButton.tonalIcon(
                  onPressed: busy ? null : onSetup,
                  icon: const Icon(Icons.fingerprint, size: 18),
                  label: const Text('Set up'),
                ),
        ],
      ),
    );
  }
}
