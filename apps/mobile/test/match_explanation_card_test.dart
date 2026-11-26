import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mboqara/features/job_matching/domain/job_match.dart';
import 'package:mboqara/features/job_matching/domain/match_explanation.dart';
import 'package:mboqara/features/job_matching/presentation/match_explanation_card.dart';
import 'package:mboqara/features/opportunities/domain/opportunity.dart';

Opportunity _opportunity() => Opportunity(
  id: 'job-1',
  title: 'Senior Flutter Engineer',
  companyName: 'Acme',
  companySlug: 'acme',
  country: 'Kenya',
  city: 'Nairobi',
  workMode: 'remote',
  seniority: 'Senior',
  employmentType: 'FULL_TIME',
  applyUrl: 'https://example.com/apply',
  applicationMethod: 'EXTERNAL',
  platform: 'Workday',
  skills: const ['Flutter', 'Dart'],
  postedAt: DateTime(2026, 11, 20),
  salaryMin: 200000,
  salaryMax: 300000,
  currency: 'KES',
);

JobMatch _match() => JobMatch(
  score: 82,
  explanation: 'Strong overlap with your Flutter experience.',
  gaps: const ['Go'],
  factors: const MatchFactors(
    skills: 0.9,
    seniority: 0.8,
    location: 0.7,
    role: 0.7,
    freshness: 0.5,
  ),
);

Finder labelled(String prefix) => find.byWidgetPredicate(
  (widget) =>
      widget is Semantics &&
      widget.properties.label?.startsWith(prefix) == true,
);

void main() {
  testWidgets('explanation card exposes labelled contributions and gaps', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: MatchExplanationCard(
              explanation: MatchExplanation(_match(), _opportunity()),
              showImproveProfile: false,
            ),
          ),
        ),
      ),
    );

    expect(labelled('Match explanation, 82 percent'), findsOneWidget);
    expect(labelled('Skills contribution 90 percent'), findsOneWidget);
    expect(labelled('Missing skill Go'), findsOneWidget);
    expect(labelled('Confidence: High confidence'), findsOneWidget);
    expect(find.text('Remote role — no commute required.'), findsOneWidget);
  });

  test('fallback explanations cite the posting without a server reason', () {
    final explanation = MatchExplanation(
      const JobMatch(
        score: 40,
        explanation: '',
        gaps: [],
        factors: MatchFactors(),
      ),
      _opportunity(),
    );
    expect(explanation.confidence, 'Low confidence — add more profile detail');
    expect(explanation.remote, 'Remote role — no commute required.');
    expect(explanation.salary, contains('200,000 – 300,000 KES'));
    expect(
      explanation.explanations.map((row) => row.$1),
      contains('Seniority'),
    );
  });
}
