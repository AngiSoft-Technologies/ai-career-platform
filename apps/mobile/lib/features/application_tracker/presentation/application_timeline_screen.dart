import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';

import '../../../core/notifications/reminder_service.dart';
import '../../../shared/formatting/app_formatters.dart';
import '../../../shared/widgets/app_background.dart';
import '../../../shared/widgets/app_states.dart';
import '../../../shared/widgets/status_chip.dart';
import '../../followups/presentation/follow_up_controller.dart';
import '../domain/application_tracker.dart';
import 'application_timeline_controller.dart';

/// One application's history, interviews, notes, files and next actions.
/// The caller supplies the application id; no router entry is required.
class ApplicationTimelineScreen extends StatefulWidget {
  const ApplicationTimelineScreen({super.key, required this.applicationId});

  final String applicationId;

  @override
  State<ApplicationTimelineScreen> createState() =>
      _ApplicationTimelineScreenState();
}

class _ApplicationTimelineScreenState extends State<ApplicationTimelineScreen> {
  final _reminders = ReminderService();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<ApplicationTimelineController>().load(widget.applicationId);
    });
  }

  Future<void> _exportCalendar(ApplicationTimelineController controller) async {
    final ics = await controller.calendarInvite(widget.applicationId);
    if (ics == null || ics.isEmpty) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Calendar invite is not available offline yet.'),
        ),
      );
      return;
    }
    final file = XFile.fromData(
      Uint8List.fromList(utf8.encode(ics)),
      name: 'application-${widget.applicationId}.ics',
      mimeType: 'text/calendar',
    );
    await Share.shareXFiles(
      [file],
      subject: 'Interview calendar invite',
      text: 'Interview details for application ${widget.applicationId}',
    );
  }

  Future<void> _remind(DateTime when, {String label = 'Follow up'}) async {
    await _reminders.schedule(
      id: widget.applicationId.hashCode ^ when.millisecondsSinceEpoch,
      title: label,
      body: 'Follow up on application ${widget.applicationId}',
      when: when,
      payload: widget.applicationId,
    );
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Reminder set for ${AppFormatters.dateTime(when)}.'),
      ),
    );
  }

  Future<DateTime?> _pickDate(BuildContext context, DateTime initial) async {
    final date = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime.now().subtract(const Duration(days: 1)),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (date == null) return null;
    if (!context.mounted) return null;
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(initial),
    );
    if (time == null) return date;
    return DateTime(date.year, date.month, date.day, time.hour, time.minute);
  }

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<ApplicationTimelineController>();
    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        title: const Text('Application timeline'),
        actions: [
          IconButton(
            tooltip: 'Export calendar invite',

            onPressed: () => _exportCalendar(controller),
            icon: const Icon(Icons.calendar_month_outlined),
          ),
          IconButton(
            tooltip: 'Reload timeline',

            onPressed: () => controller.load(widget.applicationId),
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _addNote(context, controller),
        tooltip: 'Add note',
        child: const Icon(Icons.note_add_outlined),
      ),
      body: AppBackground(
        child: switch (controller.state) {
          ApplicationTimelineState.idle || ApplicationTimelineState.loading =>
            const LoadingState(label: 'Loading application timeline…'),
          ApplicationTimelineState.error => ErrorState(
            message: controller.errorMessage ?? 'Unable to load timeline',
            onRetry: () => controller.load(widget.applicationId),
          ),
          ApplicationTimelineState.ready => _body(context, controller),
        },
      ),
    );
  }

  Widget _body(BuildContext context, ApplicationTimelineController controller) {
    final timeline = controller.timeline;
    return RefreshIndicator(
      onRefresh: () => controller.load(widget.applicationId),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 96),
        children: [
          if (controller.servedFromCache)
            const Padding(
              padding: EdgeInsets.only(bottom: 12),
              child: SectionCard(
                child: Text('Showing cached timeline stored on this device.'),
              ),
            ),
          if (controller.errorMessage != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: SectionCard(
                child: Text(
                  controller.errorMessage!,
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
              ),
            ),
          if (timeline.nextAction != null &&
              timeline.nextAction!.trim().isNotEmpty)
            SectionCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Next action',
                    style: Theme.of(context).textTheme.labelLarge,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    timeline.nextAction!,
                    style: Theme.of(context).textTheme.bodyLarge
                        ?.copyWith(fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 12),
                  FilledButton.icon(
                    onPressed: () => _addNote(context, controller),
                    icon: const Icon(Icons.note_add_outlined),
                    label: const Text('Record it'),
                  ),
                ],
              ),
            ),
          const SizedBox(height: 14),
          _Section(
            title: 'Status history',
            icon: Icons.history_rounded,
            children: timeline.events.isEmpty
                ? const [Text('No status changes recorded yet.')]
                : [
                    for (final event in timeline.events)
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: const Icon(Icons.circle_outlined, size: 16),
                        title: StatusChip(status: event.status),
                        subtitle: Text(
                          '${AppFormatters.dateTime(event.occurredAt)}'
                          '${event.note.isEmpty ? '' : ' · ${event.note}'}',
                        ),
                      ),
                  ],
          ),
          const SizedBox(height: 14),
          _Section(
            title: 'Interviews',
            icon: Icons.event_available_outlined,
            action: TextButton.icon(
              onPressed: () => _scheduleInterview(context, controller),
              icon: const Icon(Icons.add_rounded),
              label: const Text('Schedule'),
            ),
            children: timeline.interviews.isEmpty
                ? const [Text('No interviews scheduled yet.')]
                : [
                    for (final interview in timeline.interviews)
                      SectionCard(
                        color: Theme.of(context).colorScheme.surfaceContainer,
                        child: Semantics(
                          label:
                              '${interview.stage} interview on '
                              '${AppFormatters.dateTime(interview.startsAt)}',
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Expanded(
                                    child: Text(
                                      interview.stage,
                                      style: Theme.of(context)
                                          .textTheme
                                          .titleMedium
                                          ?.copyWith(
                                            fontWeight: FontWeight.w700,
                                          ),
                                    ),
                                  ),
                                  if (interview.isUpcoming)
                                    const Chip(
                                      label: Text('Upcoming'),
                                      visualDensity: VisualDensity.compact,
                                    ),
                                ],
                              ),
                              const SizedBox(height: 8),
                              _InfoRow(
                                icon: Icons.schedule_rounded,
                                text: AppFormatters.dateTime(
                                  interview.startsAt,
                                ),
                              ),
                              if (interview.location.isNotEmpty)
                                _InfoRow(
                                  icon: interview.isRemote
                                      ? Icons.videocam_outlined
                                      : Icons.place_outlined,
                                  text: interview.location,
                                ),
                              if (interview.contact.isNotEmpty)
                                _InfoRow(
                                  icon: Icons.person_outline_rounded,
                                  text: 'Contact: ${interview.contact}',
                                ),
                              if (interview.notes.isNotEmpty)
                                _InfoRow(
                                  icon: Icons.notes_rounded,
                                  text: interview.notes,
                                ),
                              const SizedBox(height: 8),
                              Wrap(
                                spacing: 8,
                                children: [
                                  TextButton.icon(
                                    onPressed: () => _reschedule(
                                      context,
                                      controller,
                                      interview,
                                    ),
                                    icon: const Icon(
                                      Icons.edit_calendar_outlined,
                                    ),
                                    label: const Text('Reschedule'),
                                  ),
                                  TextButton.icon(
                                    onPressed: () => _addToCalendar(interview),
                                    icon: const Icon(
                                      Icons.calendar_today_outlined,
                                    ),
                                    label: const Text('Add to calendar'),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ),
                  ],
          ),
          const SizedBox(height: 14),
          _FollowUpSection(
            applicationId: widget.applicationId,
            onRemind: _remind,
          ),
          const SizedBox(height: 14),
          _Section(
            title: 'Notes',
            icon: Icons.notes_rounded,
            action: TextButton.icon(
              onPressed: () => _addNote(context, controller),
              icon: const Icon(Icons.add_rounded),
              label: const Text('Add note'),
            ),
            children: timeline.notes.isEmpty
                ? const [Text('No notes yet.')]
                : [
                    for (final note in timeline.notes)
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: const Icon(Icons.sticky_note_2_outlined),
                        title: Text(note.body),
                        subtitle: Text(
                          '${AppFormatters.dateTime(note.createdAt)}'
                          '${note.author.isEmpty ? '' : ' · ${note.author}'}',
                        ),
                      ),
                  ],
          ),
          const SizedBox(height: 14),
          _Section(
            title: 'Attachments',
            icon: Icons.attach_file_rounded,
            action: TextButton.icon(
              onPressed: () => _addAttachment(context, controller),
              icon: const Icon(Icons.add_rounded),
              label: const Text('Attach'),
            ),
            children: timeline.attachments.isEmpty
                ? const [Text('No files attached yet.')]
                : [
                    for (final attachment in timeline.attachments)
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: const Icon(Icons.description_outlined),
                        title: Text(attachment.name),
                        subtitle: Text(
                          attachment.mimeType.isEmpty
                              ? 'Attached file'
                              : attachment.mimeType,
                        ),
                        trailing: IconButton(
                          tooltip: 'Open attachment',

                          onPressed: attachment.url.isEmpty
                              ? null
                              : () => Share.share(attachment.url),
                          icon: const Icon(Icons.ios_share_outlined),
                        ),
                      ),
                  ],
          ),
        ],
      ),
    );
  }

  Future<void> _addToCalendar(ApplicationInterview interview) async {
    final ok = await _reminders.addToCalendar(
      title: '${interview.stage} interview',
      description: interview.notes,
      start: interview.startsAt,
      location: interview.location,
    );
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          ok ? 'Interview added to your calendar.' : 'Calendar cancelled.',
        ),
      ),
    );
  }

  Future<void> _scheduleInterview(
    BuildContext context,
    ApplicationTimelineController controller,
  ) async {
    final stage = TextEditingController(text: 'Interview');
    final location = TextEditingController();
    final contact = TextEditingController();
    final result = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (context) => Padding(
        padding: EdgeInsets.fromLTRB(
          20,
          4,
          20,
          MediaQuery.viewInsetsOf(context).bottom + 24,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Schedule an interview',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 16),
            TextField(
              controller: stage,
              decoration: const InputDecoration(labelText: 'Stage'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: location,
              decoration: const InputDecoration(
                labelText: 'Location or meeting link',
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: contact,
              decoration: const InputDecoration(labelText: 'Contact'),
            ),
            const SizedBox(height: 20),
            FilledButton(
              onPressed: () => Navigator.pop(context, <String, dynamic>{
                'stage': stage.text,
                'location': location.text,
                'contact': contact.text,
              }),
              child: const Text('Choose date'),
            ),
          ],
        ),
      ),
    );
    if (result == null) return;
    if (!context.mounted) return;
    final when = await _pickDate(
      context,
      DateTime.now().add(const Duration(days: 2)),
    );
    if (when == null) return;
    await controller.scheduleInterview(
      widget.applicationId,
      stage: (result['stage'] as String).trim().isEmpty
          ? 'Interview'
          : result['stage'] as String,
      startsAt: when,
      location: result['location'] as String? ?? '',
      contact: result['contact'] as String? ?? '',
      isRemote: (result['location'] as String? ?? '').contains('http'),
    );
    await _remind(when, label: 'Interview reminder');
  }

  Future<void> _reschedule(
    BuildContext context,
    ApplicationTimelineController controller,
    ApplicationInterview interview,
  ) async {
    final when = await _pickDate(context, interview.startsAt);
    if (when == null) return;
    await controller.rescheduleInterview(
      widget.applicationId,
      interview,
      startsAt: when,
    );
    await _remind(when, label: 'Rescheduled interview');
  }

  Future<void> _addNote(
    BuildContext context,
    ApplicationTimelineController controller,
  ) async {
    final body = TextEditingController();
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (context) => Padding(
        padding: EdgeInsets.fromLTRB(
          20,
          4,
          20,
          MediaQuery.viewInsetsOf(context).bottom + 24,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('New note', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 16),
            TextField(
              controller: body,
              minLines: 3,
              maxLines: 8,
              autofocus: true,
              decoration: const InputDecoration(
                labelText: 'What happened?',
                alignLabelWithHint: true,
              ),
            ),
            const SizedBox(height: 20),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Save note'),
            ),
          ],
        ),
      ),
    );
    if (saved == true) {
      await controller.addNote(widget.applicationId, body.text);
    }
    body.dispose();
  }

  Future<void> _addAttachment(
    BuildContext context,
    ApplicationTimelineController controller,
  ) async {
    final name = TextEditingController();
    final url = TextEditingController();
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (context) => Padding(
        padding: EdgeInsets.fromLTRB(
          20,
          4,
          20,
          MediaQuery.viewInsetsOf(context).bottom + 24,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Attach a file',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 16),
            TextField(
              controller: name,
              decoration: const InputDecoration(labelText: 'File name'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: url,
              decoration: const InputDecoration(
                labelText: 'File URL',
                hintText: 'https://…',
              ),
            ),
            const SizedBox(height: 20),
            FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Attach'),
            ),
          ],
        ),
      ),
    );
    if (saved == true) {
      await controller.addAttachment(
        widget.applicationId,
        name: name.text,
        url: url.text,
      );
    }
    name.dispose();
    url.dispose();
  }
}

class _Section extends StatelessWidget {
  const _Section({
    required this.title,
    required this.icon,
    required this.children,
    this.action,
  });

  final String title;
  final IconData icon;
  final List<Widget> children;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 20),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  title,
                  style: Theme.of(context).textTheme.titleMedium
                      ?.copyWith(fontWeight: FontWeight.w700),
                ),
              ),
              ?action,
            ],
          ),
          const SizedBox(height: 8),
          ...children,
        ],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 16),
          const SizedBox(width: 8),
          Expanded(child: Text(text)),
        ],
      ),
    );
  }
}

/// Follow-up reminders for this application, with snooze and reschedule.
class _FollowUpSection extends StatelessWidget {
  const _FollowUpSection({required this.applicationId, required this.onRemind});

  final String applicationId;
  final Future<void> Function(DateTime, {String label}) onRemind;

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<FollowUpController>();
    final items =
        controller.items
            .where((item) => item.applicationId == applicationId)
            .toList()
          ..sort((a, b) => a.dueAt.compareTo(b.dueAt));
    return _Section(
      title: 'Follow-up reminders',
      icon: Icons.alarm_rounded,
      action: TextButton.icon(
        onPressed: () async {
          final when = await showDatePicker(
            context: context,
            initialDate: DateTime.now().add(const Duration(days: 3)),
            firstDate: DateTime.now(),
            lastDate: DateTime.now().add(const Duration(days: 365)),
          );
          if (when == null) return;
          await controller.schedule(
            applicationId: applicationId,
            dueAt: when,
            note: 'Follow up',
          );
          await onRemind(when);
        },
        icon: const Icon(Icons.add_rounded),
        label: const Text('Schedule'),
      ),
      children: items.isEmpty
          ? const [Text('No follow-up reminders yet.')]
          : [
              for (final item in items)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.alarm_outlined),
                  title: Text(
                    '${item.status} · ${AppFormatters.dateTime(item.dueAt)}',
                  ),
                  subtitle: Text(item.note),
                  trailing: PopupMenuButton<String>(
                    tooltip: 'Reminder actions',
                    onSelected: (value) async {
                      if (value == 'snooze') {
                        final snoozed = DateTime.now().add(
                          const Duration(days: 1),
                        );
                        await controller.schedule(
                          applicationId: applicationId,
                          dueAt: snoozed,
                          note: 'Snoozed follow-up',
                        );
                        await onRemind(snoozed, label: 'Snoozed follow-up');
                      } else if (value == 'reschedule') {
                        final when = await showDatePicker(
                          context: context,
                          initialDate: item.dueAt,
                          firstDate: DateTime.now(),
                          lastDate: DateTime.now().add(
                            const Duration(days: 365),
                          ),
                        );
                        if (when == null) return;
                        await controller.schedule(
                          applicationId: applicationId,
                          dueAt: when,
                          note: item.note,
                        );
                        await onRemind(when, label: 'Rescheduled follow-up');
                      }
                    },
                    itemBuilder: (context) => const [
                      PopupMenuItem(
                        value: 'snooze',
                        child: Text('Snooze 1 day'),
                      ),
                      PopupMenuItem(
                        value: 'reschedule',
                        child: Text('Reschedule'),
                      ),
                    ],
                  ),
                ),
            ],
    );
  }
}
