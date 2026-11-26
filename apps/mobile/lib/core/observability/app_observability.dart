import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:sentry_flutter/sentry_flutter.dart';

class AppObservability {
  const AppObservability._();

  static const dsn = String.fromEnvironment('SENTRY_DSN');

  static Future<void> run(FutureOr<void> Function() appRunner) async {
    FlutterError.onError = (details) {
      FlutterError.presentError(details);
      Sentry.captureException(details.exception, stackTrace: details.stack);
    };
    PlatformDispatcher.instance.onError = (error, stack) {
      Sentry.captureException(error, stackTrace: stack);
      debugPrint('Unhandled error: $error\n$stack');
      return true;
    };

    if (dsn.isEmpty) {
      await appRunner();
      return;
    }

    await SentryFlutter.init((options) {
      options.dsn = dsn;
      options.tracesSampleRate = 0.2;
      options.sendDefaultPii = false;
      options.enableAutoSessionTracking = true;
    }, appRunner: () async => appRunner());
  }

  static Future<void> capture(Object error, [StackTrace? stackTrace]) async {
    debugPrint('Observed error: $error');
    if (dsn.isNotEmpty) {
      await Sentry.captureException(error, stackTrace: stackTrace);
    }
  }

  static void breadcrumb(String message, {Map<String, Object?>? data}) {
    if (dsn.isNotEmpty) {
      Sentry.addBreadcrumb(Breadcrumb(message: message, data: data));
    }
  }

  /// Identifies the user with a one-way hash. PII is never sent to Sentry.
  static Future<void> identify(String anonymousId) async {
    if (dsn.isEmpty) return;
    await Sentry.configureScope(
      (scope) => scope.setUser(SentryUser(id: anonymousId)),
    );
  }

  static Future<void> clearIdentity() async {
    if (dsn.isEmpty) return;
    await Sentry.configureScope((scope) => scope.setUser(null));
  }

  /// Passed to GoRouter so crashes carry the screen the user was on.
  static final NavigatorObserver routeObserver = _RouteObserver();
}

class _RouteObserver extends NavigatorObserver {
  @override
  void didPush(Route<dynamic> route, Route<dynamic>? previousRoute) {
    AppObservability.breadcrumb('navigate', data: {'to': route.settings.name});
  }

  @override
  void didReplace({Route<dynamic>? newRoute, Route<dynamic>? oldRoute}) {
    AppObservability.breadcrumb(
      'replace',
      data: {'to': newRoute?.settings.name},
    );
  }
}
