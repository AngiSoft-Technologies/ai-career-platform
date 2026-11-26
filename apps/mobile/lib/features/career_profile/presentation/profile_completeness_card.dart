import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../shared/widgets/app_states.dart';
import '../domain/candidate_profile.dart';

class _Check {
  const _Check({
    required this.label,
    required this.weight,
    required this.done,
    required this.evidence,
    required this.actionLabel,
    required this.route,
  });

  final String label;
  final int weight;
  final bool done;
  final String evidence;
  final String actionLabel;
  final String? route;
}

/// Weighted, local-only profile checklist. The score is computed from the
/// profile already on the device; suggestions cite the missing field so the
/// candidate knows what to change.
class ProfileCompletenessCard extends StatelessWidget {
  const ProfileCompletenessCard({
    super.key,
    required this.profile,
    this.salaryConfigured = false,
    this.documentCount = 0,
    this.onEditProfile,
  });

  final CandidateProfile profile;
  final bool salaryConfigured;
  final int documentCount;
  final VoidCallback? onEditProfile;

  @override
  Widget build(BuildContext context) {
    final checks = _checks();
    final earned = checks
        .where((check) => check.done)
        .fold<int>(0, (sum, check) => sum + check.weight);
    final total = checks.fold<int>(0, (sum, check) => sum + check.weight);
    final score = total == 0 ? 0.0 : earned / total;

    return SectionCard(
      child: Semantics(
        label: 'Profile completeness ${(score * 100).round()} percent',
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Profile strength',
                    style: Theme.of(context).textTheme.titleMedium
                        ?.copyWith(fontWeight: FontWeight.w700),
                  ),
                ),
                Text(
                  '${(score * 100).round()}%',
                  style: Theme.of(context).textTheme.titleMedium
                      ?.copyWith(fontWeight: FontWeight.w800),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Semantics(
              label: 'Profile completeness ${(score * 100).round()} percent',
              child: AppProgressBar(value: score),
            ),
            const SizedBox(height: 6),
            Text(
              score >= 0.8
                  ? 'Strong profile. Keep it current as your experience grows.'
                  : 'Complete the items below to improve your matches.',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 14),
            for (final check in checks)
              _CheckRow(
                check: check,
                onTap: () {
                  if (check.route != null) {
                    context.push(check.route!);
                    return;
                  }
                  onEditProfile?.call();
                },
              ),
          ],
        ),
      ),
    );
  }

  List<_Check> _checks() {
    final summary = profile.summary.trim();
    final skills = profile.skills
        .where((item) => item.trim().isNotEmpty)
        .toList();
    final roles = profile.desiredRoles
        .where((item) => item.trim().isNotEmpty)
        .toList();
    final hasLocation =
        profile.location.trim().isNotEmpty ||
        profile.country.trim().isNotEmpty ||
        profile.preferredLocations.isNotEmpty ||
        profile.preferredCountries.isNotEmpty;
    return [
      _Check(
        label: 'Professional summary',
        weight: 20,
        done: summary.length >= 40,
        evidence: summary.isEmpty
            ? 'No summary yet — AI documents need one.'
            : summary.length < 40
            ? 'Summary is ${summary.length} characters; 40+ works better.'
            : 'Summary gives recruiters a clear picture.',
        actionLabel: 'Edit summary',
        route: null,
      ),
      _Check(
        label: 'Skills',
        weight: 20,
        done: skills.length >= 5,
        evidence: skills.isEmpty
            ? 'Add at least five skills to improve keyword matching.'
            : '${skills.length} skills listed'
                  '${skills.length < 5 ? '; aim for five or more.' : '.'}',
        actionLabel: 'Edit skills',
        route: null,
      ),
      _Check(
        label: 'Target roles',
        weight: 15,
        done: roles.isNotEmpty,
        evidence: roles.isEmpty
            ? 'Add target roles so the feed knows what to rank.'
            : 'Targeting ${roles.take(2).join(', ')}.',
        actionLabel: 'Edit roles',
        route: null,
      ),
      _Check(
        label: 'Location',
        weight: 10,
        done: hasLocation,
        evidence: hasLocation
            ? 'Location preferences are set.'
            : 'Add a city or country to see local eligibility.',
        actionLabel: 'Edit location',
        route: null,
      ),
      _Check(
        label: 'Salary expectation',
        weight: 10,
        done: salaryConfigured,
        evidence: salaryConfigured
            ? 'Minimum salary is set in preferences.'
            : 'Set a minimum salary to filter disclosed ranges.',
        actionLabel: 'Open preferences',
        route: '/preferences',
      ),
      _Check(
        label: 'Experience',
        weight: 10,
        done: profile.yearsExperience > 0,
        evidence: profile.yearsExperience > 0
            ? '${profile.yearsExperience} years of experience recorded.'
            : 'Add your years of experience for seniority matching.',
        actionLabel: 'Edit experience',
        route: null,
      ),
      _Check(
        label: 'Documents',
        weight: 15,
        done: documentCount > 0,
        evidence: documentCount > 0
            ? '$documentCount document${documentCount == 1 ? '' : 's'} ready.'
            : 'Generate a CV or cover letter to apply faster.',
        actionLabel: 'Open documents',
        route: '/home/profile/documents',
      ),
    ];
  }
}

class _CheckRow extends StatelessWidget {
  const _CheckRow({required this.check, required this.onTap});

  final _Check check;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Semantics(
      label:
          '${check.label}: ${check.done ? 'complete' : 'needs attention'}. '
          '${check.evidence}',
      button: true,
      child: ListTile(
        contentPadding: EdgeInsets.zero,
        leading: Icon(
          check.done
              ? Icons.check_circle_rounded
              : Icons.radio_button_unchecked,
          color: check.done ? scheme.primary : scheme.onSurfaceVariant,
        ),
        title: Text(
          '${check.label} · ${check.weight}%',
          style: Theme.of(context).textTheme.bodyMedium
              ?.copyWith(fontWeight: FontWeight.w700),
        ),
        subtitle: Text(check.evidence),
        trailing: TextButton(onPressed: onTap, child: Text(check.actionLabel)),
      ),
    );
  }
}
