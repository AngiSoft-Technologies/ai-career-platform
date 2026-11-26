import 'package:flutter_test/flutter_test.dart';
import 'package:mboqara/features/saved_searches/data/saved_search_repository.dart';
import 'package:mboqara/features/saved_searches/domain/saved_search.dart';
import 'package:mboqara/features/saved_searches/presentation/saved_search_controller.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() => SharedPreferences.setMockInitialValues(<String, Object>{}));

  test('create persists a search locally and queues offline actions', () async {
    final repository = SavedSearchRepository(
      store: InMemorySavedSearchStore(),
      alertStore: InMemoryJobAlertStore(),
    );
    final controller = SavedSearchController(repository: repository);
    await controller.load();

    final created = await controller.create(
      name: 'Remote Flutter roles',
      query: 'Flutter remote',
      cadence: AlertCadence.weekly,
    );

    expect(created, isTrue, reason: controller.errorMessage);
    expect(controller.items, hasLength(1));
    expect(controller.items.single.name, 'Remote Flutter roles');
    expect(controller.items.single.cadence, AlertCadence.weekly);
    expect(controller.recent, contains('Flutter remote'));
    expect(
      repository.queuedActions.map((action) => action.actionType),
      contains('create_saved_search'),
    );
    // Enabling alerts also persists an alert policy.
    expect(controller.alerts, hasLength(1));
    expect(controller.alerts.single.enabled, isTrue);
  });

  test('markSeen clears the new badge and survives a reload', () async {
    final store = InMemorySavedSearchStore();
    final repository = SavedSearchRepository(
      store: store,
      alertStore: InMemoryJobAlertStore(),
    );
    await repository.create(
      SavedSearch(
        id: 'local-1',
        name: 'New roles',
        query: 'engineer',
        newCount: 4,
      ),
    );
    final controller = SavedSearchController(repository: repository);
    await controller.load();
    expect(controller.items.single.newCount, 4);

    final ok = await controller.markSeen('local-1');
    expect(ok, isTrue);
    expect(controller.items.single.newCount, 0);

    await controller.load();
    expect(controller.items.single.newCount, 0);
    expect(
      repository.queuedActions.map((action) => action.actionType),
      contains('mark_search_seen'),
    );
  });

  test('delete removes the search and its alert', () async {
    final repository = SavedSearchRepository(
      store: InMemorySavedSearchStore(),
      alertStore: InMemoryJobAlertStore(),
    );
    final controller = SavedSearchController(repository: repository);
    await controller.load();
    await controller.create(
      name: 'Kenya roles',
      query: 'Kenya',
      alertsEnabled: true,
    );
    expect(controller.alerts, hasLength(1));

    final id = controller.items.single.id;
    await controller.delete(id);

    expect(controller.items, isEmpty);
    expect(controller.alerts, isEmpty);
    expect(
      repository.queuedActions.map((action) => action.actionType),
      contains('delete_saved_search'),
    );
  });
}
