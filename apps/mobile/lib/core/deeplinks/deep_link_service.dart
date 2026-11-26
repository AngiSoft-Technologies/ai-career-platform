import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:flutter/foundation.dart';

/// Single owner of inbound links.
///
/// `app_links` delivers the cold-start link before any listener exists, so
/// the service buffers it until [startReplay] is called from the first frame.
/// The buffer is also used by the router to defer authenticated destinations
/// until sign-in and step-up verification finish.
class DeepLinkService {
  DeepLinkService();
  final AppLinks _appLinks = AppLinks();
  final StreamController<String> _routes = StreamController<String>.broadcast();
  StreamSubscription<Uri>? _sub;

  String? _pendingRoute;
  bool _replaying = false;

  Stream<String> get routes => _routes.stream;
  String? get pendingRoute => _pendingRoute;

  Future<void> initialize() async {
    try {
      final initial = await _appLinks.getInitialLink();
      if (initial != null) _emit(initial);
    } catch (e) {
      debugPrint('Deep link initial error: $e');
    }
    _sub = _appLinks.uriLinkStream.listen(
      _emit,
      onError: (e) {
        debugPrint('Deep link stream error: $e');
      },
    );
  }

  /// Called once the router has subscribers. Replays a link that arrived
  /// before `runApp` instead of dropping it.
  void startReplay() {
    if (_replaying) return;
    _replaying = true;
    final pending = _pendingRoute;
    _pendingRoute = null;
    if (pending != null && pending.isNotEmpty) _routes.add(pending);
  }

  /// Router hook: remembers where the user was trying to go so it can be
  /// restored after sign-in / resume onboarding / verification.
  void rememberRoute(String route) {
    final normalized = resolveRoute(route);
    if (normalized == null) return;
    if (_isAuthGate(normalized)) return;
    _pendingRoute = normalized;
  }

  String? consumePendingRoute() {
    final route = _pendingRoute;
    _pendingRoute = null;
    return route;
  }

  /// Routes that must work while signed out. Invites are deliberately public
  /// so a newly invited candidate can accept without signing in first.
  static bool isPublicRoute(String route) {
    final path = route.split('?').first;
    return path == '/onboarding' ||
        path == '/verify' ||
        path.startsWith('/invite/') ||
        path.startsWith('/resume');
  }

  static bool _isAuthGate(String route) {
    final path = route.split('?').first;
    return path == '/onboarding' ||
        path == '/verify' ||
        path.startsWith('/resume');
  }

  void _emit(Uri uri) {
    final route = resolve(uri);
    if (route != null) emitRoute(route);
  }

  /// Accepts a link from any source (app_links, push payload, in-app share)
  /// and applies the same allowlist. Unknown destinations are dropped.
  void emitRoute(String route) {
    final normalized = resolveRoute(route);
    if (normalized == null) return;
    _pendingRoute = normalized;
    if (_replaying) _routes.add(normalized);
  }

  static String? resolve(Uri uri) {
    if (uri.scheme == 'mboqara') {
      // mboqara://invite/abc and mboqara:///invite/abc both occur in the wild.
      final path = uri.path.isEmpty ? '/${uri.host}' : uri.path;
      return _normalize(path, uri.queryParameters);
    }
    if (uri.scheme == 'https' && uri.host == 'mboqara.angisoft.co.ke') {
      return _normalize(uri.path, uri.queryParameters);
    }
    return null;
  }

  /// Validates a plain route string (used for push taps and router redirects).
  static String? resolveRoute(String? route) {
    if (route == null || route.isEmpty) return null;
    final uri = Uri.tryParse(route);
    if (uri == null) return null;
    if (uri.isAbsolute &&
        uri.scheme != 'mboqara' &&
        !(uri.scheme == 'https' && uri.host == 'mboqara.angisoft.co.ke')) {
      return null;
    }
    final path = uri.path.isEmpty ? '/${uri.host}' : uri.path;
    return _normalize(
      path.startsWith('/') ? path : '/$path',
      uri.queryParameters,
    );
  }

  static String? _normalize(String path, Map<String, String> query) {
    String? route;
    final clean = path.length > 1 && path.endsWith('/')
        ? path.substring(0, path.length - 1)
        : path;
    // `/share/...` is declared in both App Link manifests as a friendly
    // wrapper. Normalise it to the real detail route instead of leaving the
    // router with an unregistered destination.
    var normalized = clean;
    if (normalized.startsWith('/share/')) {
      final parts = normalized.split('/');
      if (parts.length >= 4) {
        final kind = parts[2];
        final id = parts.sublist(3).join('/');
        switch (kind) {
          case 'opportunity':
          case 'opportunities':
          case 'job':
          case 'o':
            normalized = '/opportunities/$id';
            break;
          case 'company':
          case 'companies':
          case 'c':
            normalized = '/companies/$id';
            break;
          case 'application':
          case 'applications':
          case 'a':
            normalized = '/applications/$id';
            break;
          case 'document':
          case 'documents':
          case 'd':
            normalized = '/documents/$id';
            break;
        }
      }
    }
    if (normalized.startsWith('/invite/')) route = normalized;
    if (normalized.startsWith('/opportunities/')) route = normalized;
    if (normalized.startsWith('/applications/')) route = normalized;
    if (normalized.startsWith('/documents/')) route = normalized;
    if (normalized.startsWith('/companies/')) route = normalized;
    if (clean == '/notifications') route = '/home/notifications';
    if (clean == '/settings') route = '/settings';
    if (clean == '/profile') route = '/home/profile';
    if (clean == '/saved-searches') route = '/saved-searches';
    if (clean.isEmpty || clean == '/') route = '/home/opportunities';
    if (route == null) return null;
    // Query parameters carry share context (source, search id, application
    // id). Dropping them used to make shared links land on a generic screen.
    if (query.isEmpty) return route;
    final encoded = query.entries
        .map(
          (entry) =>
              '${Uri.encodeQueryComponent(entry.key)}='
              '${Uri.encodeQueryComponent(entry.value)}',
        )
        .join('&');
    return '$route?$encoded';
  }

  void dispose() {
    _sub?.cancel();
    _routes.close();
  }
}
