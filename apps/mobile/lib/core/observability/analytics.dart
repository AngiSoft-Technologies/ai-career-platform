import 'dart:async';
import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';

import '../networking/api_client.dart';

/// Consent-gated product analytics.
///
/// Events are a allowlisted taxonomy only — never emails, tokens, free-text
/// search terms or document contents. Nothing leaves the device until the
/// user has opted in through `/v1/me/privacy`.
class Analytics {
  Analytics._();

  static const allowedEvents = <String>{
    'search',
    'view_job',
    'save_job',
    'match_view',
    'apply_start',
    'apply_submit',
    'doc_generate',
    'doc_export',
    'followup_set',
    'notification_open',
  };

  static final Map<String, int> _counts = {};
  static final List<Map<String, dynamic>> _queue = [];
  static ApiClient? _client;
  static bool _consent = false;
  static String? _anonUserId;
  static bool _flushing = false;
  static const _maxBatch = 20;

  /// Call once at startup with the consent value from `/v1/me/privacy`.
  static void configure({
    ApiClient? apiClient,
    bool consent = false,
    String? userId,
  }) {
    _client = apiClient;
    _consent = consent;
    if (userId != null && userId.isNotEmpty) {
      _anonUserId = sha256
          .convert(utf8.encode(userId))
          .toString()
          .substring(0, 16);
    }
  }

  static void setConsent(bool value) => _consent = value;

  static bool get consent => _consent;

  static void event(String name, [Map<String, Object?> props = const {}]) {
    _counts[name] = (_counts[name] ?? 0) + 1;
    if (!_consent || !allowedEvents.contains(name)) return;
    _queue.add({
      'event': name,
      'properties': props.map((key, value) => MapEntry(key, value.toString())),
      'consent': true,
    });
    if (_queue.length >= _maxBatch) unawaited(flush());
  }

  /// Sends a best-effort batch. Analytics must never break a user action.
  static Future<void> flush() async {
    final client = _client;
    if (!_consent || client == null || _queue.isEmpty || _flushing) return;
    _flushing = true;
    final batch = List<Map<String, dynamic>>.from(_queue);
    _queue.clear();
    try {
      for (final item in batch) {
        await client.post<void>(
          '/analytics/events',
          body: {...item, if (_anonUserId != null) 'anonymousId': _anonUserId},
        );
      }
    } catch (error) {
      debugPrint('Analytics flush deferred: $error');
      // Keep the unsent batch for the next flush rather than losing it.
      _queue.insertAll(0, batch);
    } finally {
      _flushing = false;
    }
  }

  static Map<String, int> snapshot() => Map.unmodifiable(_counts);
}
