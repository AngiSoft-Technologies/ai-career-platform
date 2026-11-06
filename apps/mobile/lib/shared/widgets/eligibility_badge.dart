import 'package:flutter/material.dart';

/// Whether a candidate can hold this role, in one glance.
///
/// The pipeline answers this for every posting — read from what the page
/// itself says about location and work authorisation, not guessed from
/// the country it happens to name — and it is the difference between a
/// feed a candidate can act on and a catalogue they scroll past.
class EligibilityBadge extends StatelessWidget {
  const EligibilityBadge({super.key, required this.eligibility});

  final String? eligibility;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final color = switch (eligibility) {
      'eligible' => scheme.primary,
      'unlikely' => scheme.tertiary,
      'ineligible' => scheme.error,
      _ => scheme.onSurfaceVariant,
    };
    final label = switch (eligibility) {
      'eligible' => 'You can hold this',
      'unlikely' => 'Relocation likely',
      'ineligible' => 'Not open to you',
      _ => 'Not stated',
    };

    return Semantics(
      label: 'Eligibility: $label',
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(
          label,
          style: Theme.of(context).textTheme.labelLarge
              ?.copyWith(color: color, fontWeight: FontWeight.w700),
        ),
      ),
    );
  }
}
