import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mboqara/features/settings/presentation/privacy_controller.dart';
import 'package:mboqara/features/settings/presentation/privacy_settings_section.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// The section wraps each control in a labelled [Semantics] widget. Matching
/// the widget (rather than the merged semantics node) avoids ambiguity from
/// Flutter's MergeSemantics while still asserting the accessible label.
Finder labelled(String label) => find.byWidgetPredicate(
  (widget) => widget is Semantics && widget.properties.label == label,
);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() => SharedPreferences.setMockInitialValues(<String, Object>{}));

  Future<PrivacyController> pumpSection(WidgetTester tester) async {
    final controller = PrivacyController();
    await controller.load();
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: PrivacySettingsSection(
              controller: controller,
              onExport: () {},
              onDeleteAccount: () {},
            ),
          ),
        ),
      ),
    );
    return controller;
  }

  testWidgets('privacy toggles update local state without a network client', (
    tester,
  ) async {
    final controller = await pumpSection(tester);

    expect(labelled('Privacy controls'), findsOneWidget);
    expect(controller.settings.allowAnalytics, isTrue);
    expect(controller.settings.personalisation, isTrue);

    await tester.tap(labelled('Share anonymous analytics'));
    await tester.pumpAndSettle();
    expect(controller.settings.allowAnalytics, isFalse);

    await tester.tap(labelled('Personalised recommendations'));
    await tester.pumpAndSettle();
    expect(controller.settings.personalisation, isFalse);

    await tester.tap(labelled('Hide screen previews'));
    await tester.pumpAndSettle();
    expect(controller.settings.screenshotProtection, isTrue);
  });

  testWidgets('background sync toggle is persisted locally', (tester) async {
    final controller = await pumpSection(tester);
    expect(controller.backgroundSync, isTrue);

    await tester.tap(labelled('Background sync'));
    await tester.pumpAndSettle();

    expect(controller.backgroundSync, isFalse);
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getBool('background_sync_enabled'), isFalse);
  });
}
