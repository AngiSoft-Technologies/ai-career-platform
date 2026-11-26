import 'package:flutter/material.dart';

import '../../opportunities/domain/opportunity.dart';
import '../domain/job_match.dart';
import '../domain/match_explanation.dart';
import 'match_explanation_card.dart';

class MatchPanel extends StatelessWidget {
  const MatchPanel({super.key, required this.match, this.opportunity});

  final JobMatch match;
  final Opportunity? opportunity;

  @override
  Widget build(BuildContext context) {
    return MatchExplanationCard(
      explanation: MatchExplanation(match, opportunity),
    );
  }
}
