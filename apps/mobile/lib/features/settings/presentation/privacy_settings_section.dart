import 'package:flutter/material.dart';

import '../../../shared/formatting/app_formatters.dart';
import '../../../shared/widgets/app_states.dart';
import 'privacy_controller.dart';

/// Privacy, export and account controls. Kept separate from the rest of the
/// settings screen so it can be widget-tested with an injected controller and
/// no network or database.
class PrivacySettingsSection extends StatelessWidget {
  const PrivacySettingsSection({
    super.key,
    required this.controller,
    required this.onExport,
    required this.onDeleteAccount,
    this.exporting = false,
  });

  final PrivacyController controller;
  final VoidCallback onExport;
  final VoidCallback onDeleteAccount;
  final bool exporting;

  Widget _tile(Widget child) =>
      Material(color: Colors.transparent, child: child);

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Semantics(
      container: true,
      label: 'Privacy controls',
      child: SectionCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Privacy',
              style: Theme.of(context).textTheme.titleMedium
                  ?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 8),
            Semantics(
              container: true,
              label: 'Share anonymous analytics',
              child: _tile(
                SwitchListTile.adaptive(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Share anonymous analytics'),
                  subtitle: const Text(
                    'Helps us improve rankings and reliability.',
                  ),
                  value: controller.settings.allowAnalytics,
                  onChanged: (value) => controller.update(
                    controller.settings.copyWith(allowAnalytics: value),
                  ),
                ),
              ),
            ),
            Semantics(
              container: true,
              label: 'Personalised recommendations',
              child: _tile(
                SwitchListTile.adaptive(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Personalised recommendations'),
                  subtitle: const Text(
                    'Use your profile and history to rank roles.',
                  ),
                  value: controller.settings.personalisation,
                  onChanged: (value) => controller.update(
                    controller.settings.copyWith(personalisation: value),
                  ),
                ),
              ),
            ),
            Semantics(
              container: true,
              label: 'Hide screen previews',
              child: _tile(
                SwitchListTile.adaptive(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Hide screen previews'),
                  subtitle: const Text(
                    'Blur the app switcher preview on supported devices.',
                  ),
                  value: controller.settings.screenshotProtection,
                  onChanged: (value) => controller.update(
                    controller.settings.copyWith(screenshotProtection: value),
                  ),
                ),
              ),
            ),
            Semantics(
              container: true,
              label: 'Background sync',
              child: _tile(
                SwitchListTile.adaptive(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Background sync'),
                  subtitle: const Text(
                    'Replay queued changes while the app is in the background.',
                  ),
                  value: controller.backgroundSync,
                  onChanged: controller.setBackgroundSync,
                ),
              ),
            ),
            if (controller.errorMessage != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Text(
                  'Privacy settings could not be saved: '
                  '${controller.errorMessage}',
                  style: TextStyle(color: scheme.error),
                ),
              ),
            if (controller.devices.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(
                'Signed-in devices',
                style: Theme.of(context).textTheme.labelLarge,
              ),
              for (final device in controller.devices)
                Semantics(
                  container: true,
                  label: 'Device ${device.label}',
                  child: _tile(
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: const Icon(Icons.devices_other_outlined),
                      title: Text(
                        '${device.label.isEmpty ? 'Device' : device.label}'
                        '${device.current ? ' (this device)' : ''}',
                      ),
                      subtitle: Text(
                        device.lastActiveAt == null
                            ? 'Last active unknown'
                            : 'Last active '
                                  '${AppFormatters.dateTime(device.lastActiveAt)}',
                      ),
                    ),
                  ),
                ),
            ],
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                OutlinedButton.icon(
                  onPressed: exporting ? null : onExport,
                  icon: const Icon(Icons.download_outlined),
                  label: Text(
                    exporting ? 'Preparing export…' : 'Export my data',
                  ),
                ),
                OutlinedButton.icon(
                  onPressed: onDeleteAccount,
                  icon: Icon(
                    Icons.delete_forever_outlined,
                    color: scheme.error,
                  ),
                  label: Text(
                    'Delete account',
                    style: TextStyle(color: scheme.error),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
