import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import 'core/authentication/api_auth_service.dart';
import 'core/authentication/auth_session.dart';
import 'core/authentication/token_storage.dart';
import 'core/configuration/app_settings.dart';
import 'core/networking/api_client.dart';
import 'core/routing/app_router.dart';
import 'core/storage/local_database.dart';
import 'core/synchronization/sync_controller.dart';
import 'core/synchronization/sync_engine.dart';
import 'features/application_workspace/data/application_workspace_repository.dart';
import 'features/application_workspace/presentation/application_workspace_controller.dart';
import 'features/applications/data/application_repository.dart';
import 'features/applications/presentation/application_controller.dart';
import 'features/career_intelligence/data/career_intelligence_repository.dart';
import 'features/career_intelligence/presentation/career_intelligence_controller.dart';
import 'features/career_profile/data/profile_repository.dart';
import 'features/career_profile/presentation/profile_controller.dart';
import 'features/company_intelligence/data/company_intelligence_repository.dart';
import 'features/documents/data/document_repository.dart';
import 'features/documents/presentation/document_controller.dart';
import 'features/followups/data/follow_up_repository.dart';
import 'features/followups/presentation/follow_up_controller.dart';
import 'features/job_matching/data/match_repository.dart';
import 'features/job_preferences/data/preferences_repository.dart';
import 'features/job_preferences/presentation/preferences_controller.dart';
import 'features/notifications/data/notification_repository.dart';
import 'features/notifications/presentation/notification_controller.dart';
import 'features/onboarding/data/onboarding_repository.dart';
import 'features/opportunities/data/opportunity_repository.dart';
import 'features/opportunities/presentation/opportunity_controller.dart';
import 'features/settings/data/settings_repository.dart';
import 'shared/theme/app_theme.dart';
import 'shared/widgets/splash_screen.dart';

Future<void> main() async {
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
  final notificationRepository = NotificationRepository(database: database);
  final workspaceRepository = ApplicationWorkspaceRepository(
    apiClient: apiClient,
    applicationRepository: applicationRepository,
    opportunityRepository: opportunityRepository,
  );
  final careerIntelligenceRepository = CareerIntelligenceRepository(
    apiClient: apiClient,
    profileRepository: profileRepository,
  );

  final opportunityController = OpportunityController(
    repository: opportunityRepository,
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
  final documentController = DocumentController(repository: documentRepository);
  final followUpController = FollowUpController(repository: followUpRepository);
  final workspaceController = ApplicationWorkspaceController(
    repository: workspaceRepository,
  );
  final careerIntelligenceController = CareerIntelligenceController(
    repository: careerIntelligenceRepository,
  );
  final syncEngine = SyncEngine(apiClient: apiClient, database: database);
  final syncController = SyncController(
    syncEngine: syncEngine,
    database: database,
  );
  await syncController.initialize();
  await notificationController.load();

  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider<AppSettings>.value(value: settings),
        ChangeNotifierProvider<AuthSession>.value(value: authSession),
        ChangeNotifierProvider<OpportunityController>.value(
          value: opportunityController,
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
      ],
      child: const JobRadarApp(),
    ),
  );
}

class JobRadarApp extends StatefulWidget {
  const JobRadarApp({super.key});

  @override
  State<JobRadarApp> createState() => _JobRadarAppState();
}

class _JobRadarAppState extends State<JobRadarApp> {
  GoRouter? _router;
  bool _showSplash = true;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _router ??= createAppRouter(context.read<AuthSession>());
  }

  @override
  void dispose() {
    _router?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_showSplash) {
      return MaterialApp(
        title: 'Job Radar',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.light(),
        darkTheme: AppTheme.dark(),
        themeMode: ThemeMode.system,
        home: SplashScreen(
          onFinished: () {
            setState(() {
              _showSplash = false;
            });
          },
        ),
      );
    }

    return MaterialApp.router(
      title: 'Job Radar',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: ThemeMode.system,
      routerConfig: _router!,
    );
  }
}
