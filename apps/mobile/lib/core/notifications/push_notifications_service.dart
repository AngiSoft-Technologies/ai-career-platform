import 'dart:async';
import 'dart:io';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../firebase_options.dart';
import '../deeplinks/deep_link_service.dart';
import '../networking/api_client.dart';
import '../observability/app_observability.dart';

/// Background FCM handler. Must be a top-level entry-point.
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  try {
    if (Firebase.apps.isEmpty) {
      await Firebase.initializeApp(
        options: DefaultFirebaseOptions.currentPlatform,
      );
    }
  } catch (e) {
    debugPrint('Background Firebase init failed: $e');
  }
  // Backend is source of truth; background message is delivery signal only.
  debugPrint('FCM background message: ${message.messageId}');
}

/// Push transport only. Notification content/state is owned by the backend DB.
///
/// The backend is the notification authority and this service is one of
/// several possible transports (FCM, HMS, APNs, Samsung). Devices are
/// registered with a stable per-install id and provider name so a user can
/// have several devices and no provider becomes a data lock-in.
class PushNotificationsService {
  PushNotificationsService({
    required ApiClient apiClient,
    String? deviceId,
    this.appVersion = '1.0.0',
    this.locale = 'en',
  }) : _apiClient = apiClient,
       _deviceIdOverride = deviceId;

  final ApiClient _apiClient;
  final String? _deviceIdOverride;
  final String appVersion;
  final String locale;
  static const _deviceIdKey = 'mboqara.device_id';
  static const _pushEnabledKey = 'push_enabled';
  static const _quietStartKey = 'quiet_hours_start';
  static const _quietEndKey = 'quiet_hours_end';

  final FlutterLocalNotificationsPlugin _local =
      FlutterLocalNotificationsPlugin();
  final StreamController<String> _tapController =
      StreamController<String>.broadcast();
  final StreamController<void> _refreshController =
      StreamController<void>.broadcast();

  bool _initialized = false;
  bool _firebaseReady = false;
  bool _tapsReplaying = false;
  String? _pendingTap;
  String? _token;
  String _provider = 'fcm';

  Stream<String> get taps => _tapController.stream;
  Stream<void> get refreshSignals => _refreshController.stream;
  bool get isReady => _firebaseReady;
  String? get token => _token;
  String get provider => _provider;

  Future<void> initialize() async {
    if (_initialized) return;
    _initialized = true;
    await _initLocalNotifications();
    await _initFirebase();
  }

  /// Called after the router has a tap listener attached. A tap that arrived
  /// on a cold start is queued until now.
  void startReplay() {
    if (_tapsReplaying) return;
    _tapsReplaying = true;
    final pending = _pendingTap;
    _pendingTap = null;
    if (pending != null) _tapController.add(pending);
  }

  Future<void> _initLocalNotifications() async {
    const android = AndroidInitializationSettings('@mipmap/ic_launcher');
    const ios = DarwinInitializationSettings(
      requestAlertPermission: false,
      requestBadgePermission: false,
      requestSoundPermission: false,
    );
    await _local.initialize(
      const InitializationSettings(android: android, iOS: ios),
      onDidReceiveNotificationResponse: (response) {
        final payload = response.payload;
        if (payload != null && payload.isNotEmpty) _emitTap(payload);
      },
    );

    const channel = AndroidNotificationChannel(
      'mboqara_high',
      'MboQara alerts',
      description:
          'Matches, applications, reminders, and updates from your backend.',
      importance: Importance.high,
    );
    await _local
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >()
        ?.createNotificationChannel(channel);
  }

  Future<void> _initFirebase() async {
    try {
      _provider = _detectProvider();
      if (_provider == 'hms') {
        // HMS adapter requires huawei_push/agconnect setup. An external HMS
        // token can still be registered through registerExternalToken().
        debugPrint(
          'HMS push adapter is not bundled; use registerExternalToken.',
        );
        _firebaseReady = false;
        return;
      }
      if (Firebase.apps.isEmpty) {
        await Firebase.initializeApp(
          options: DefaultFirebaseOptions.currentPlatform,
        );
      }
      _firebaseReady = true;
    } catch (e) {
      debugPrint(
        'Firebase unavailable (add google-services.json / '
        'GoogleService-Info.plist): $e',
      );
      _firebaseReady = false;
      return;
    }

    try {
      FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
      FirebaseMessaging.onMessage.listen(_handleForegroundMessage);
      FirebaseMessaging.onMessageOpenedApp.listen(_handleMessageTap);
      FirebaseMessaging.instance.onTokenRefresh.listen((token) {
        _token = token;
        unawaited(_registerToken(token));
      });

      final initial = await FirebaseMessaging.instance.getInitialMessage();
      if (initial != null) _handleMessageTap(initial);

      await FirebaseMessaging.instance
          .setForegroundNotificationPresentationOptions(
            alert: false,
            badge: true,
            sound: true,
          );
    } catch (e, st) {
      AppObservability.capture(e, st);
    }
  }

  /// Call after an authenticated session is established. Permission is no
  /// longer requested on a cold signed-out start.
  Future<void> requestPermissionAndRegister() async {
    if (!_firebaseReady || !await _pushEnabled()) return;
    try {
      final settings = await FirebaseMessaging.instance.requestPermission(
        alert: true,
        badge: true,
        sound: true,
        provisional: false,
      );
      final status = settings.authorizationStatus;
      if (status == AuthorizationStatus.denied ||
          status == AuthorizationStatus.notDetermined) {
        debugPrint('Push permission not granted: $status');
        return;
      }
      final token = await FirebaseMessaging.instance.getToken();
      if (token == null || token.isEmpty) return;
      _token = token;
      await _registerToken(token);
    } catch (e, st) {
      AppObservability.capture(e, st);
    }
  }

  Future<void> unregister() async {
    final token = _token;
    _token = null;
    if (token == null) return;
    try {
      await _apiClient.delete('/me/devices/${Uri.encodeComponent(token)}');
    } catch (_) {
      // Best-effort; the backend also removes stale devices on rotation.
    }
  }

  Future<void> _registerToken(String token) async {
    if (!await _pushEnabled()) return;
    try {
      await _apiClient.post<void>(
        '/me/devices',
        body: {
          'provider': _provider,
          'token': token,
          'deviceId': await _stableDeviceId(),
          'platform': Platform.isIOS ? 'ios' : 'android',
          'appVersion': appVersion,
          'locale': locale,
          'topics': const ['jobs', 'applications', 'system'],
        },
      );
    } catch (e) {
      debugPrint('Push device registration failed: $e');
    }
  }

  Future<String> _stableDeviceId() async {
    final override = _deviceIdOverride;
    if (override != null && override.isNotEmpty) return override;
    final prefs = await SharedPreferences.getInstance();
    var id = prefs.getString(_deviceIdKey);
    if (id == null || id.isEmpty) {
      id = 'dev_${DateTime.now().microsecondsSinceEpoch.toRadixString(16)}';
      await prefs.setString(_deviceIdKey, id);
    }
    return id;
  }

  Future<bool> _pushEnabled() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_pushEnabledKey) ?? true;
  }

  Future<bool> _inQuietHours() async {
    final prefs = await SharedPreferences.getInstance();
    final start = prefs.getString(_quietStartKey);
    final end = prefs.getString(_quietEndKey);
    if (start == null || end == null) return false;
    final startMinutes = _minutes(start);
    final endMinutes = _minutes(end);
    if (startMinutes == null || endMinutes == null) return false;
    final now = DateTime.now();
    final current = now.hour * 60 + now.minute;
    if (startMinutes == endMinutes) return false;
    if (endMinutes > startMinutes) {
      return current >= startMinutes && current < endMinutes;
    }
    return current >= startMinutes || current < endMinutes;
  }

  int? _minutes(String value) {
    final parts = value.split(':');
    if (parts.length != 2) return null;
    final hour = int.tryParse(parts[0]);
    final minute = int.tryParse(parts[1]);
    if (hour == null || minute == null) return null;
    return hour * 60 + minute;
  }

  Future<void> _handleForegroundMessage(RemoteMessage message) async {
    _refreshController.add(null);
    if (!await _pushEnabled() || await _inQuietHours()) return;
    final notification = message.notification;
    final data = message.data;
    final title = notification?.title ?? data['title']?.toString() ?? 'MboQara';
    final body =
        notification?.body ?? data['body']?.toString() ?? 'You have an update.';
    final route = data['route']?.toString() ?? '/home/notifications';

    await _local.show(
      message.hashCode,
      title,
      body,
      const NotificationDetails(
        android: AndroidNotificationDetails(
          'mboqara_high',
          'MboQara alerts',
          importance: Importance.high,
          priority: Priority.high,
          icon: '@mipmap/ic_launcher',
        ),
        iOS: DarwinNotificationDetails(
          presentAlert: true,
          presentBadge: true,
          presentSound: true,
        ),
      ),
      payload: route,
    );
  }

  void _handleMessageTap(RemoteMessage message) {
    _refreshController.add(null);
    _emitTap(message.data['route']?.toString() ?? '/home/notifications');
  }

  void _emitTap(String route) {
    final normalized = DeepLinkService.resolveRoute(route);
    if (normalized == null) return;
    _pendingTap = normalized;
    if (_tapsReplaying) _tapController.add(normalized);
  }

  String _detectProvider() {
    if (kIsWeb) return 'fcm';
    // FirebaseMessaging returns an FCM token on iOS too (delivered over
    // APNs). A direct APNs token can be registered with
    // registerExternalToken(provider: 'apns') instead.
    // TODO: detect HMS via huawei_hmsavailability once agconnect is bundled.
    return 'fcm';
  }

  /// Registers a token obtained from an external provider SDK (HMS, Samsung,
  /// or a direct APNs relay). The backend never assumes a single vendor.
  Future<void> registerExternalToken({
    required String token,
    required String provider,
  }) async {
    const allowed = ['fcm', 'apns', 'huawei', 'samsung'];
    if (!allowed.contains(provider)) {
      throw ArgumentError.value(
        provider,
        'provider',
        'Unsupported push provider',
      );
    }
    _provider = provider;
    _token = token;
    await _registerToken(token);
  }

  void dispose() {
    _tapController.close();
    _refreshController.close();
  }
}
