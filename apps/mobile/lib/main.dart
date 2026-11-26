import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import 'core/background/background_tasks.dart';
import 'core/deeplinks/deep_link_service.dart';
import 'core/notifications/push_notifications_service.dart';
import 'core/observability/app_observability.dart';
import 'core/security/biometric_lock_service.dart';
import 'core/updates/app_update_service.dart';

import 'core/authentication/api_auth_service.dart';
import 'core/authentication/auth_session.dart';
import 'core/authentication/token_storage.dart';
import 'core/configuration/app_feature_flags.dart';
import 'core/configuration/app_settings.dart';
import 'core/networking/api_client.dart';
import 'core/observability/analytics.dart';
import 'core/routing/app_router.dart';
import 'core/storage/local_database.dart';
import 'core/synchronization/sync_controller.dart';
import 'core/synchronization/sync_engine.dart';
import 'features/application_workspace/data/application_workspace_repository.dart';
import 'features/application_workspace/presentation/application_workspace_controller.dart';
import 'features/applications/data/application_repository.dart';
import 'features/applications/presentation/application_controller.dart';
import 'features/career_intelligence/data/career_intelligence_repository.dart';
import 'features/company_intelligence/data/company_repository.dart';
import 'features/company_intelligence/presentation/companies_controller.dart';
import 'features/career_intelligence/presentation/career_intelligence_controller.dart';
import 'features/career_profile/data/profile_repository.dart';
import 'features/career_profile/presentation/profile_controller.dart';
import 'features/company_intelligence/data/company_intelligence_repository.dart';
import 'features/documents/data/document_repository.dart';
import 'features/documents/presentation/document_controller.dart';
import 'features/documents/presentation/template_controller.dart';
import 'features/followups/data/follow_up_repository.dart';
import 'features/followups/presentation/follow_up_controller.dart';
import 'features/job_matching/data/match_repository.dart';
import 'features/job_preferences/data/preferences_repository.dart';
import 'features/job_preferences/presentation/preferences_controller.dart';
import 'features/notifications/data/notification_repository.dart';
import 'features/notifications/presentation/notification_controller.dart';
import 'features/onboarding/data/onboarding_repository.dart';
import 'features/onboarding/presentation/resume_onboarding_controller.dart';
import 'features/opportunities/data/opportunity_repository.dart';
import 'features/opportunities/presentation/opportunity_controller.dart';
import 'features/settings/data/settings_repository.dart';
import 'shared/theme/app_theme.dart';
import 'shared/widgets/app_background.dart';
import 'shared/widgets/app_states.dart';
import 'shared/widgets/splash_screen.dart';

Future<void> main() async {
  await AppObservability.run(() async {
    WidgetsFlutterBinding.ensureInitialized();

    final settings = await AppSettings.load();
    final database = await LocalDatabase.open();
    final tokenStorage = TokenStorage();
    final authService = ApiAuthService(settings: settings);
    final apiClient = ApiClient(
      settings: settings,
      tokenStorage: tokenStorage,
      authService: authService,
    );
    final authSession = AuthSession(
      authService: authService,
      tokenStorage: tokenStorage,
      apiClient: apiClient,
      settings: settings,
    );
    await authSession.restore();

    final pushNotifications = PushNotificationsService(apiClient: apiClient);
    final deepLinks = DeepLinkService();
    final biometricLock = BiometricLockService();
    final appUpdateService = AppUpdateService(apiClient: apiClient);
    apiClient.onRequest = (method, path, status, elapsed) {
      if (status >= 400 || elapsed.inMilliseconds > 2000) {
        AppObservability.breadcrumb(
          'api',
          data: {
            'method': method,
            'path': path,
            'status': status,
            'ms': elapsed.inMilliseconds,
          },
        );
      }
    };

    final flagsStore = AppFeatureFlagsStore(apiClient);
    final flags = await flagsStore.refresh();
    Analytics.configure(consent: false, apiClient: apiClient);

    await deepLinks.initialize();
    await pushNotifications.initialize();
    // Push transport only; backend DB remains source of truth. Permission is
    // requested only for an authenticated session, never on a cold first run.
    if (authSession.isSignedIn) {
      unawaited(pushNotifications.requestPermissionAndRegister());
    }
    await BackgroundTasks.initialize();

    // A revoked session is a global event: unregister this device, purge
    // user-scoped caches and stop background work before returning to
    // onboarding. A shared-device sign-out must not leave a searchable cache.
    final sessionMessage = ValueNotifier<String?>(null);
    late final SyncController syncController;
    authSession.onSessionRevoked = () {
      sessionMessage.value = 'Your session was ended. Please sign in again.';
      AppObservability.breadcrumb('session_revoked');
    };
    authSession.onSignedOut = () async {
      await pushNotifications.unregister();
      await BackgroundTasks.cancel();
      await syncController.clearLocalData();
      await Analytics.flush();
      await AppObservability.clearIdentity();
    };

    final opportunityRepository = OpportunityRepository(
      apiClient: apiClient,
      database: database,
    );
    final profileRepository = ProfileRepository(
      apiClient: apiClient,
      database: database,
    );
    final preferencesRepository = PreferencesRepository(
      apiClient: apiClient,
      database: database,
    );
    final applicationRepository = ApplicationRepository(
      apiClient: apiClient,
      database: database,
    );
    final documentRepository = DocumentRepository(
      apiClient: apiClient,
      database: database,
    );
    final followUpRepository = FollowUpRepository(
      apiClient: apiClient,
      database: database,
    );
    final notificationRepository = NotificationRepository(
      apiClient: apiClient,
      database: database,
    );
    final workspaceRepository = ApplicationWorkspaceRepository(
      apiClient: apiClient,
      applicationRepository: applicationRepository,
      opportunityRepository: opportunityRepository,
    );
    final careerIntelligenceRepository = CareerIntelligenceRepository(
      apiClient: apiClient,
      profileRepository: profileRepository,
    );
    final companyRepository = CompanyRepository(
      apiClient: apiClient,
      database: database,
    );

    final opportunityController = OpportunityController(
      repository: opportunityRepository,
    );
    final companiesController = CompaniesController(
      repository: companyRepository,
    );
    final profileController = ProfileController(repository: profileRepository);
    final preferencesController = PreferencesController(
      repository: preferencesRepository,
    );
    final notificationController = NotificationController(
      repository: notificationRepository,
    );
    final applicationController = ApplicationController(
      repository: applicationRepository,
      notificationRepository: notificationRepository,
      onNotificationChanged: () {
        unawaited(notificationController.refreshBadge());
      },
    );
    final documentController = DocumentController(
      repository: documentRepository,
    );
    final followUpController = FollowUpController(
      repository: followUpRepository,
    );
    final workspaceController = ApplicationWorkspaceController(
      repository: workspaceRepository,
    );
    final careerIntelligenceController = CareerIntelligenceController(
      repository: careerIntelligenceRepository,
    );
    final syncEngine = SyncEngine(apiClient: apiClient, database: database);
    syncController = SyncController(syncEngine: syncEngine, database: database);
    // A cold start on a signed-out device is the normal first-run path: the
    // notification load and the sync initialisation both talk to the API,
    // and both used to run unguarded here. A 401 from a device with no
    // session escaped main() as an unhandled exception and took the app
    // down before its first frame — a fresh install opened, hung for a few
    // seconds, and silently returned to the launcher. Nothing that runs
    // before runApp gets to decide whether the app lives.
    try {
      await syncController.initialize();
      await notificationController.load();
      if (authSession.isAuthenticated) {
        final privacy = await apiClient.get<Map<String, dynamic>>(
          '/me/privacy',
        );
        Analytics.setConsent(privacy['allowAnalytics'] == true);
        await BackgroundTasks.registerIfPossible();
      }
    } catch (error) {
      debugPrint('Startup sync skipped: $error');
    }

    runApp(
      MultiProvider(
        providers: [
          ChangeNotifierProvider<AppSettings>.value(value: settings),
          ChangeNotifierProvider<AuthSession>.value(value: authSession),
          Provider<PushNotificationsService>.value(value: pushNotifications),
          Provider<DeepLinkService>.value(value: deepLinks),
          Provider<BiometricLockService>.value(value: biometricLock),
          Provider<AppUpdateService>.value(value: appUpdateService),
          ChangeNotifierProvider<OpportunityController>.value(
            value: opportunityController,
          ),
          ChangeNotifierProvider<CompaniesController>.value(
            value: companiesController,
          ),
          ChangeNotifierProvider<ProfileController>.value(
            value: profileController,
          ),
          ChangeNotifierProvider<PreferencesController>.value(
            value: preferencesController,
          ),
          ChangeNotifierProvider<ApplicationController>.value(
            value: applicationController,
          ),
          ChangeNotifierProvider<DocumentController>.value(
            value: documentController,
          ),
          ChangeNotifierProvider<TemplateController>.value(
            value: TemplateController(repository: documentRepository),
          ),
          ChangeNotifierProvider<ResumeOnboardingController>.value(
            value: ResumeOnboardingController(repository: documentRepository),
          ),
          ChangeNotifierProvider<FollowUpController>.value(
            value: followUpController,
          ),
          ChangeNotifierProvider<NotificationController>.value(
            value: notificationController,
          ),
          ChangeNotifierProvider<ApplicationWorkspaceController>.value(
            value: workspaceController,
          ),
          ChangeNotifierProvider<CareerIntelligenceController>.value(
            value: careerIntelligenceController,
          ),
          ChangeNotifierProvider<SyncController>.value(value: syncController),
          Provider<ApiClient>.value(value: apiClient),
          Provider<TokenStorage>.value(value: tokenStorage),
          Provider<ApiAuthService>.value(value: authService),
          Provider<LocalDatabase>.value(value: database),
          Provider<OnboardingRepository>.value(
            value: OnboardingRepository(authService: authService),
          ),
          Provider<SettingsRepository>.value(
            value: SettingsRepository(settings: settings),
          ),
          Provider<MatchRepository>.value(
            value: MatchRepository(apiClient: apiClient),
          ),
          Provider<CompanyIntelligenceRepository>.value(
            value: const CompanyIntelligenceRepository(),
          ),
          Provider<AppFeatureFlagsStore>.value(value: flagsStore),
          Provider<ValueNotifier<String?>>.value(value: sessionMessage),
        ],
        child: JobRadarApp(initialFlags: flags),
      ),
    );
  });
}

class JobRadarApp extends StatefulWidget {
  const JobRadarApp({super.key, required this.initialFlags});

  final AppFeatureFlags initialFlags;

  @override
  State<JobRadarApp> createState() => _JobRadarAppState();
}

class _JobRadarAppState extends State<JobRadarApp> with WidgetsBindingObserver {
  GoRouter? _router;
  bool _showSplash = true;
  bool _updateChecked = false;
  bool _unlocked = false;
  late AppFeatureFlags _flags = widget.initialFlags;
  StreamSubscription<String>? _deepLinkSub;
  StreamSubscription<String>? _pushTapSub;
  StreamSubscription<void>? _pushRefreshSub;
  ValueNotifier<String?>? _sessionMessage;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_router == null) {
      final deepLinks = context.read<DeepLinkService>();
      final push = context.read<PushNotificationsService>();
      _router = createAppRouter(
        context.read<AuthSession>(),
        deepLinks: deepLinks,
      );
      _deepLinkSub = deepLinks.routes.listen(_routeFromLink);
      _pushTapSub = push.taps.listen(_routeFromLink);
      _pushRefreshSub = push.refreshSignals.listen((_) {
        if (!mounted) return;
        context.read<NotificationController>().load();
        context.read<SyncController>().syncNow();
      });
      // Listeners exist now: replay the cold-start link and push tap that
      // arrived before runApp.
      deepLinks.startReplay();
      push.startReplay();
      _sessionMessage = context.read<ValueNotifier<String?>>();
      _sessionMessage?.addListener(_onSessionMessage);
      _maybeCheckUpdate();
      _maybeUnlock();
    }
  }

  void _routeFromLink(String route) {
    if (!mounted || _router == null) return;
    AppObservability.breadcrumb('deep_link', data: {'route': route});
    _router!.go(route);
  }

  void _onSessionMessage() {
    final message = _sessionMessage?.value;
    if (message == null || !mounted) return;
    final messenger = ScaffoldMessenger.maybeOf(context);
    if (messenger == null) return;
    messenger.showSnackBar(SnackBar(content: Text(message)));
    _sessionMessage?.value = null;
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (!mounted) return;
    if (state == AppLifecycleState.paused) {
      unawaited(Analytics.flush());
      return;
    }
    if (state != AppLifecycleState.resumed) return;
    unawaited(
      context.read<AppFeatureFlagsStore>().refresh().then((value) {
        if (mounted) setState(() => _flags = value);
      }),
    );
    unawaited(context.read<SyncController>().syncNow());
    unawaited(Analytics.flush());
  }

  Future<void> _maybeCheckUpdate() async {
    if (_updateChecked || !mounted) return;
    _updateChecked = true;
    final info = await context.read<AppUpdateService>().check();
    if (!mounted || info == null) return;
    await showAppUpdateDialog(context, info);
  }

  Future<void> _maybeUnlock() async {
    final lock = context.read<BiometricLockService>();
    if (_unlocked || !await lock.isEnabled() || !await lock.isSupported()) {
      _unlocked = true;
      return;
    }
    final ok = await lock.authenticate();
    if (!mounted) return;
    setState(() => _unlocked = ok);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _sessionMessage?.removeListener(_onSessionMessage);
    _deepLinkSub?.cancel();
    _pushTapSub?.cancel();
    _pushRefreshSub?.cancel();
    _router?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final settings = context.watch<AppSettings>();
    if (_flags.killSwitch || _flags.maintenanceMode) {
      return MaterialApp(
        title: 'MboQara',
        theme: AppTheme.light(),
        darkTheme: AppTheme.dark(),
        themeMode: settings.themeMode,
        home: Scaffold(
          body: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: SectionCard(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.construction_outlined, size: 44),
                      const SizedBox(height: 12),
                      const Text(
                        'Temporarily unavailable',
                        style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        'We are making improvements. Please try again shortly.',
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 16),
                      FilledButton(
                        onPressed: () async {
                          final store = context.read<AppFeatureFlagsStore>();
                          final next = await store.refresh();
                          if (mounted) setState(() => _flags = next);
                        },
                        child: const Text('Try again'),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      );
    }
    if (_showSplash) {
      return MaterialApp(
        title: 'MboQara',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.light(),
        darkTheme: AppTheme.dark(),
        themeMode: settings.themeMode,
        home: SplashScreen(
          onFinished: () {
            setState(() {
              _showSplash = false;
            });
          },
        ),
      );
    }

    final lock = context.watch<BiometricLockService>();
    return MaterialApp.router(
      title: 'MboQara',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: settings.themeMode,
      routerConfig: _router!,
      builder: (context, child) {
        if (!_unlocked) {
          return Scaffold(
            body: AppBackground(
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 420),
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: SectionCard(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.lock_outline_rounded, size: 42),
                          const SizedBox(height: 12),
                          Text(
                            'MboQara is locked',
                            style: Theme.of(context).textTheme.titleLarge,
                          ),
                          const SizedBox(height: 8),
                          const Text(
                            'Authenticate to continue.',
                            textAlign: TextAlign.center,
                          ),
                          const SizedBox(height: 16),
                          FilledButton.icon(
                            onPressed: () async {
                              final ok = await lock.authenticate();
                              if (mounted) setState(() => _unlocked = ok);
                            },
                            icon: const Icon(Icons.fingerprint_rounded),
                            label: const Text('Unlock'),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          );
        }
        return child ?? const SizedBox.shrink();
      },
    );
  }
}
