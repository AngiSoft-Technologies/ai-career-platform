import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../features/application_workspace/presentation/application_workspace_screen.dart';
import '../../features/applications/presentation/application_list_screen.dart';
import '../../features/career_profile/presentation/profile_screen.dart';
import '../../features/documents/presentation/document_list_screen.dart';
import '../../features/documents/presentation/document_viewer_screen.dart';
import '../../features/job_preferences/presentation/preferences_screen.dart';
import '../../features/notifications/presentation/notification_screen.dart';
import '../../features/onboarding/presentation/onboarding_screen.dart';
import '../../features/opportunities/presentation/opportunity_detail_screen.dart';
import '../../features/opportunities/presentation/opportunity_list_screen.dart';
import '../../features/settings/presentation/settings_screen.dart';
import '../authentication/auth_session.dart';
import 'app_shell.dart';

GoRouter createAppRouter(AuthSession authSession) {
  return GoRouter(
    initialLocation: '/home/opportunities',
    refreshListenable: authSession,
    redirect: (context, state) {
      final location = state.matchedLocation;
      final isOnboarding = location == '/onboarding';
      if (!authSession.isSignedIn) {
        return isOnboarding ? null : '/onboarding';
      }
      if (isOnboarding) return '/home/opportunities';
      return null;
    },
    routes: [
      GoRoute(path: '/', redirect: (_, _) => '/home/opportunities'),
      GoRoute(
        path: '/onboarding',
        builder: (context, state) => const OnboardingScreen(),
      ),
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) =>
            AppShell(navigationShell: navigationShell),
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/home/opportunities',
                builder: (context, state) => const OpportunityListScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/home/applications',
                builder: (context, state) => const ApplicationListScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/home/documents',
                builder: (context, state) => const DocumentListScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/home/notifications',
                builder: (context, state) => const NotificationScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/home/profile',
                builder: (context, state) => const ProfileScreen(),
              ),
            ],
          ),
        ],
      ),
      GoRoute(
        path: '/opportunities/:id',
        builder: (context, state) =>
            OpportunityDetailScreen(opportunityId: state.pathParameters['id']!),
      ),
      GoRoute(
        path: '/applications/:id/workspace',
        builder: (context, state) => ApplicationWorkspaceScreen(
          applicationId: state.pathParameters['id']!,
        ),
      ),
      GoRoute(
        path: '/documents/:id',
        builder: (context, state) =>
            DocumentViewerScreen(documentId: state.pathParameters['id']!),
      ),
      GoRoute(
        path: '/preferences',
        builder: (context, state) => const PreferencesScreen(),
      ),
      GoRoute(
        path: '/settings',
        builder: (context, state) => const SettingsScreen(),
      ),
    ],
    errorBuilder: (context, state) => Scaffold(
      appBar: AppBar(title: const Text('Job Radar')),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.explore_off_outlined, size: 48),
              const SizedBox(height: 16),
              Text(
                'That page could not be found.',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 12),
              FilledButton(
                onPressed: () => context.go('/home/opportunities'),
                child: const Text('Back to opportunities'),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}
