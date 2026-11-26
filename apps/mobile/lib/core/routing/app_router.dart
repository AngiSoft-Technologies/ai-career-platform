import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../features/application_workspace/presentation/application_workspace_screen.dart';
import '../../features/application_workspace/presentation/application_apply_screen.dart';
import '../../features/applications/presentation/application_list_screen.dart';
import '../../features/career_profile/presentation/profile_screen.dart';
import '../../features/company_intelligence/presentation/company_detail_screen.dart';
import '../../features/company_intelligence/presentation/company_list_screen.dart';
import '../../features/documents/presentation/document_list_screen.dart';
import '../../features/documents/presentation/document_viewer_screen.dart';
import '../../features/documents/presentation/resume_builder_screen.dart';
import '../../features/documents/presentation/template_gallery_screen.dart';
import '../../features/job_matching/presentation/matches_screen.dart';
import '../../features/job_preferences/presentation/preferences_screen.dart';
import '../../features/notifications/presentation/notification_screen.dart';
import '../../features/onboarding/presentation/onboarding_screen.dart';
import '../../features/onboarding/presentation/resume_start_screen.dart';
import '../../features/opportunities/presentation/opportunity_detail_screen.dart';
import '../../features/opportunities/presentation/opportunity_list_screen.dart';
import '../../features/settings/presentation/settings_screen.dart';
import '../../features/invite/presentation/invite_accept_screen.dart';
import '../../features/verification/presentation/verification_screen.dart';
import '../authentication/auth_session.dart';
import '../deeplinks/deep_link_service.dart';
import '../observability/app_observability.dart';
import 'app_shell.dart';

GoRouter createAppRouter(
  AuthSession authSession, {
  DeepLinkService? deepLinks,
}) {
  return GoRouter(
    initialLocation: '/home/opportunities',
    refreshListenable: authSession,
    observers: [AppObservability.routeObserver],
    redirect: (context, state) {
      final location = state.matchedLocation;
      final fullLocation = state.uri.toString();
      final isSignIn = location == '/onboarding';
      final isResumeFlow =
          location == '/resume' || location.startsWith('/resume/');
      final isPreferences = location == '/onboarding/preferences';
      final isPublic = DeepLinkService.isPublicRoute(location) || isPreferences;

      // Invites, sign-in, verification and resume onboarding must be
      // reachable while signed out. Any other destination is remembered so
      // it can be replayed after authentication instead of being replaced by
      // the generic post-login landing page.
      if (!authSession.isSignedIn) {
        if (isPublic) return null;
        deepLinks?.rememberRoute(fullLocation);
        return isSignIn ? null : '/onboarding';
      }
      if (isSignIn) {
        final deferred = deepLinks?.consumePendingRoute();
        if (deferred != null && deferred.isNotEmpty) return deferred;
        return '/home/opportunities';
      }

      // A long-lived session still re-proves itself on a schedule; the
      // step-up screen is the only place allowed while the flag is up.
      final isVerify = location == '/verify';
      if (authSession.verificationRequired && !isVerify) {
        deepLinks?.rememberRoute(fullLocation);
        return '/verify';
      }

      // First sign-in: the candidate picks a resume path before anything else.
      if (!authSession.resumeOnboarded &&
          !isResumeFlow &&
          !isPreferences &&
          !isVerify) {
        deepLinks?.rememberRoute(fullLocation);
        return '/resume';
      }

      final deferred = deepLinks?.consumePendingRoute();
      if (deferred != null && deferred.isNotEmpty && deferred != fullLocation) {
        return deferred;
      }
      return null;
    },
    routes: [
      GoRoute(path: '/', redirect: (_, _) => '/home/opportunities'),
      GoRoute(
        path: '/home/documents',
        redirect: (_, _) => '/home/profile/documents',
      ),
      GoRoute(
        path: '/onboarding',
        builder: (context, state) => const OnboardingScreen(),
      ),
      GoRoute(
        path: '/verify',
        builder: (context, state) => const VerificationScreen(),
      ),
      GoRoute(
        path: '/resume',
        builder: (context, state) => const ResumeStartScreen(),
      ),
      GoRoute(
        path: '/resume/upload',
        builder: (context, state) => const ResumePathScreen(path: 'upload'),
      ),
      GoRoute(
        path: '/resume/linkedin',
        builder: (context, state) => const ResumePathScreen(path: 'linkedin'),
      ),
      GoRoute(
        path: '/resume/manual',
        builder: (context, state) => const ResumePathScreen(path: 'manual'),
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
                path: '/home/matches',
                builder: (context, state) => const MatchesScreen(),
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
                routes: [
                  GoRoute(
                    path: 'documents',
                    builder: (context, state) => const DocumentListScreen(),
                  ),
                ],
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
        path: '/companies',
        builder: (context, state) => const CompanyListScreen(),
      ),
      GoRoute(
        path: '/companies/:slug',
        builder: (context, state) =>
            CompanyDetailScreen(slug: state.pathParameters['slug']!),
      ),
      GoRoute(
        path: '/applications/:id/workspace',
        builder: (context, state) => ApplicationWorkspaceScreen(
          applicationId: state.pathParameters['id']!,
        ),
      ),
      GoRoute(
        path: '/applications/:id/apply',
        builder: (context, state) =>
            ApplicationApplyScreen(applicationId: state.pathParameters['id']!),
      ),
      GoRoute(
        path: '/documents/:id',
        builder: (context, state) =>
            DocumentViewerScreen(documentId: state.pathParameters['id']!),
      ),
      GoRoute(
        path: '/builder/resume',
        builder: (context, state) => ResumeBuilderScreen(
          opportunityId: state.uri.queryParameters['opportunityId']!,
          opportunityTitle:
              state.uri.queryParameters['opportunityTitle'] ?? 'Untitled role',
          companyName: state.uri.queryParameters['companyName'] ?? 'Company',
          applicationId: state.uri.queryParameters['applicationId'],
        ),
      ),
      GoRoute(
        path: '/builder/template-gallery',
        builder: (context, state) => TemplateGalleryScreen(
          documentType: (state.extra as Map?)?['documentType'] ?? 'cv',
        ),
      ),
      GoRoute(
        path: '/preferences',
        builder: (context, state) => const PreferencesScreen(),
      ),
      GoRoute(
        path: '/onboarding/preferences',
        builder: (context, state) => const PreferencesScreen(),
      ),
      GoRoute(
        path: '/settings',
        builder: (context, state) => const SettingsScreen(),
      ),
      GoRoute(
        path: '/invite/:token',
        builder: (context, state) =>
            InviteAcceptScreen(token: state.pathParameters['token']!),
      ),
    ],
    errorBuilder: (context, state) => Scaffold(
      appBar: AppBar(title: const Text('MboQara')),
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
