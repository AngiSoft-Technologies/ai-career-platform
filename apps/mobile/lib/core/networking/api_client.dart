import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import '../authentication/api_auth_service.dart';
import '../authentication/token_storage.dart';
import '../configuration/app_settings.dart';
import 'api_exception.dart';

class ApiClient {
  ApiClient({
    required AppSettings settings,
    required TokenStorage tokenStorage,
    required ApiAuthService authService,
    http.Client? client,
  }) : _settings = settings,
       _tokenStorage = tokenStorage,
       _authService = authService,
       _client = client ?? http.Client();

  final AppSettings _settings;
  final TokenStorage _tokenStorage;
  final ApiAuthService _authService;
  final http.Client _client;

  /// Fired when the API answers VERIFICATION_REQUIRED so the session layer
  /// can route the user to the step-up screen instead of every screen
  /// failing on its own.
  void Function()? onVerificationRequired;

  /// Fired once when a refresh fails with an invalid/revoked token. The
  /// session layer uses this to force a global logout instead of leaving the
  /// UI signed in while every request silently fails.
  void Function()? onUnauthorized;

  /// Optional low-cardinality request instrumentation (method, path, status,
  /// elapsed). The path is a route template, never a URL with query values.
  void Function(String, String, int, Duration)? onRequest;

  /// Single-flight refresh. Parallel 401s used to each rotate the same
  /// refresh token; the second rotation then revoked the whole token family
  /// and logged the user out for no reason.
  Future<bool>? _refreshFuture;

  Future<T> get<T>(String path, {Map<String, String>? query}) {
    return _request('GET', path, query: query) as Future<T>;
  }

  Future<T> post<T>(
    String path, {
    Map<String, dynamic>? body,
    String? idempotencyKey,
  }) {
    return _request('POST', path, body: body, idempotencyKey: idempotencyKey)
        as Future<T>;
  }

  Future<dynamic> put(
    String path, {
    Map<String, dynamic>? body,
    String? idempotencyKey,
  }) {
    return _request('PUT', path, body: body, idempotencyKey: idempotencyKey);
  }

  Future<dynamic> patch(
    String path, {
    Map<String, dynamic>? body,
    String? idempotencyKey,
  }) {
    return _request('PATCH', path, body: body, idempotencyKey: idempotencyKey);
  }

  Future<dynamic> delete(String path, {String? idempotencyKey}) =>
      _request('DELETE', path, idempotencyKey: idempotencyKey);

  Future<dynamic> _request(
    String method,
    String path, {
    Map<String, String>? query,
    Map<String, dynamic>? body,
    String? idempotencyKey,
  }) async {
    final started = DateTime.now();
    http.Response? response;
    try {
      response = await _send(
        method,
        _settings.baseUrl,
        path,
        query,
        body,
        idempotencyKey,
      );
      if (response.statusCode == 401) {
        final refreshed = await refreshToken();
        if (refreshed) {
          response = await _send(
            method,
            _settings.baseUrl,
            path,
            query,
            body,
            idempotencyKey,
          );
        } else {
          onUnauthorized?.call();
        }
      }
      final decoded = _decode(response.body);
      _notifyVerificationRequired(response, decoded);
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw _buildException(response);
      }
      return decoded;
    } finally {
      if (response != null) {
        onRequest?.call(
          method,
          path,
          response.statusCode,
          DateTime.now().difference(started),
        );
      }
    }
  }

  void _notifyVerificationRequired(http.Response response, dynamic decoded) {
    if (response.statusCode != 403) return;
    if (decoded is Map && decoded['code'] == 'VERIFICATION_REQUIRED') {
      onVerificationRequired?.call();
    }
  }

  /// Refreshes the access token at most once for concurrent callers.
  Future<bool> refreshToken() {
    final pending = _refreshFuture;
    if (pending != null) return pending;
    final future = _doRefresh();
    _refreshFuture = future;
    return future.whenComplete(() {
      if (identical(_refreshFuture, future)) _refreshFuture = null;
    });
  }

  Future<bool> _doRefresh() async {
    final refreshToken = await _tokenStorage.readRefreshToken();
    if (refreshToken == null || refreshToken.isEmpty) {
      onUnauthorized?.call();
      return false;
    }
    try {
      final session = await _authService.refresh(refreshToken);
      if (session.token.isEmpty) return false;
      await _tokenStorage.writeSession(
        token: session.token,
        refreshToken: session.refreshToken,
        expiresAt: session.expiresAt,
        refreshExpiresAt: session.refreshExpiresAt,
      );
      return true;
    } on AuthException {
      await _tokenStorage.clearAll();
      onUnauthorized?.call();
      return false;
    } on ApiException catch (error) {
      // A refresh that answers 401 is a session that has ended, not a
      // crash: clear it and let the request retry unauthenticated so the
      // caller sees the ordinary "Unauthorized" for the route it asked
      // for. Without this, an expired refresh token escapes as an
      // unhandled exception from a request nobody was waiting on.
      if (error.isUnauthorized) {
        await _tokenStorage.clearAll();
        onUnauthorized?.call();
      }
      return false;
    }
  }

  Future<http.Response> _send(
    String method,
    String baseUrl,
    String path,
    Map<String, String>? query,
    Map<String, dynamic>? body,
    String? idempotencyKey,
  ) async {
    await _proactivelyRefreshIfNeeded();
    final token = await _tokenStorage.readToken();
    final headers = <String, String>{
      'Accept': 'application/json',
      if (body != null) 'Content-Type': 'application/json',
      if (token != null && token.isNotEmpty) 'Authorization': 'Bearer $token',
      if (idempotencyKey != null && idempotencyKey.isNotEmpty)
        'Idempotency-Key': idempotencyKey,
    };
    final uri = Uri.parse(
      '$baseUrl${_normalizePath(path)}',
    ).replace(queryParameters: query == null || query.isEmpty ? null : query);
    try {
      final encodedBody = body == null ? null : jsonEncode(body);
      switch (method) {
        case 'GET':
          return await _client.get(uri, headers: headers).timeout(_timeout);
        case 'POST':
          return await _client
              .post(uri, headers: headers, body: encodedBody)
              .timeout(_timeout);
        case 'PUT':
          return await _client
              .put(uri, headers: headers, body: encodedBody)
              .timeout(_timeout);
        case 'PATCH':
          return await _client
              .patch(uri, headers: headers, body: encodedBody)
              .timeout(_timeout);
        case 'DELETE':
          return await _client.delete(uri, headers: headers).timeout(_timeout);
        default:
          throw ApiException(
            statusCode: 0,
            message: 'Unsupported HTTP method $method',
          );
      }
    } on ApiException {
      rethrow;
    } on SocketException catch (error) {
      throw ApiException(
        statusCode: 0,
        message: 'Unable to reach the MboQara service',
        cause: error,
      );
    } on TimeoutException {
      throw const ApiException(
        statusCode: 0,
        message: 'The request timed out. Check your connection and try again.',
      );
    } on http.ClientException catch (error) {
      throw ApiException(
        statusCode: 0,
        message: 'Unable to reach the MboQara service',
        cause: error,
      );
    }
  }

  /// Rotates a few seconds before expiry so a normal request never has to
  /// pay the latency of a failed call followed by a refresh.
  Future<void> _proactivelyRefreshIfNeeded() async {
    final expiresAt = await _tokenStorage.readTokenExpiresAt();
    if (expiresAt == null) return;
    if (DateTime.now().add(const Duration(seconds: 30)).isBefore(expiresAt)) {
      return;
    }
    await refreshToken();
  }

  String _normalizePath(String path) {
    final normalized = path.startsWith('/') ? path : '/$path';
    return normalized;
  }

  dynamic _decode(String body) {
    if (body.isEmpty) return null;
    try {
      return jsonDecode(body);
    } on FormatException {
      return body;
    }
  }

  ApiException _buildException(http.Response response) {
    final decoded = _decode(response.body);
    final error = decoded is Map ? decoded['error'] : null;
    final code = decoded is Map ? decoded['code'] : null;
    return ApiException(
      statusCode: response.statusCode,
      message: error is String && error.isNotEmpty
          ? error
          : 'Request failed with status ${response.statusCode}',
      code: code is String ? code : null,
      serverData: decoded is Map ? Map<String, dynamic>.from(decoded) : null,
    );
  }

  static const _timeout = Duration(seconds: 20);
}
