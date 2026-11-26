import '../../../shared/formatting/app_formatters.dart';
import '../../opportunities/domain/opportunity.dart';
import 'job_match.dart';

/// Turns the ranking engine's numbers into reasons a candidate can check.
/// Every explanation cites either a server reason or a field on the posting;
/// nothing here invents a fact about the candidate.
class MatchExplanation {
  const MatchExplanation(this.match, this.opportunity);

  final JobMatch match;
  final Opportunity? opportunity;

  List<FactorContribution> get factors => match.factors.contributions;

  List<String> get missingSkills => match.gaps;

  String get confidence {
    final explicit = match.confidence;
    if (explicit != null && explicit.isNotEmpty) return explicit;
    final scoredFactors = factors.where((factor) => factor.value > 0).length;
    if (scoredFactors >= 4 && match.score >= 70) return 'High confidence';
    if (scoredFactors >= 2) return 'Moderate confidence';
    return 'Low confidence — add more profile detail';
  }

  String get seniority => match.seniorityReason?.isNotEmpty == true
      ? match.seniorityReason!
      : opportunity == null
      ? 'Add your experience level to see a seniority explanation.'
      : 'Role level: ${opportunity!.seniority}. '
            '${match.factors.seniority > 0 ? 'Your experience is close to this level.' : 'This level is a stretch based on your profile.'}';

  String get location => match.locationReason?.isNotEmpty == true
      ? match.locationReason!
      : opportunity == null
      ? 'Add a preferred location to see a location explanation.'
      : 'Based on ${opportunity!.locationLabel}. '
            '${match.factors.location > 0 ? 'This matches where you want to work.' : 'This is outside your stated location preferences.'}';

  String get remote {
    final explicit = match.remoteReason;
    if (explicit != null && explicit.isNotEmpty) return explicit;
    if (opportunity == null) {
      return 'Add a work-mode preference to see remote fit.';
    }
    final mode = opportunity!.workMode.toLowerCase();
    if (mode == 'remote') {
      return 'Remote role — no commute required.';
    }
    if (mode == 'hybrid') {
      return 'Hybrid role: part on-site in ${opportunity!.locationLabel}.';
    }
    if (mode == 'onsite' || mode == 'on-site') {
      return 'On-site role in ${opportunity!.locationLabel}.';
    }
    return 'Work mode not stated by the employer.';
  }

  String get salary {
    final explicit = match.salaryReason;
    if (explicit != null && explicit.isNotEmpty) return explicit;
    if (opportunity == null) return 'Set a salary expectation in preferences.';
    final formatted = AppFormatters.salary(
      minimum: opportunity!.salaryMin,
      maximum: opportunity!.salaryMax,
      currency: opportunity!.currency,
    );
    if (formatted == 'Salary not disclosed') {
      return 'The employer did not publish a salary range.';
    }
    return 'Advertised range: $formatted. Check it against your preference in job preferences.';
  }

  String get eligibility {
    final explicit = match.eligibilityReason;
    if (explicit != null && explicit.isNotEmpty) return explicit;
    final reasons = opportunity?.eligibilityReasons ?? const <String>[];
    if (reasons.isNotEmpty) return reasons.join(' ');
    if (opportunity == null) {
      return 'Eligibility needs a location and work authorisation.';
    }
    return 'Eligibility: ${opportunity!.eligibilityLabel}. Read the posting before applying.';
  }

  /// Distinct, non-empty explanations shown in the card.
  List<(String, String)> get explanations {
    final rows = <(String, String)>[
      ('Seniority', seniority),
      ('Location', location),
      ('Remote', remote),
      ('Salary', salary),
      ('Eligibility', eligibility),
    ];
    return rows.where((row) => row.$2.trim().isNotEmpty).toList();
  }
}
