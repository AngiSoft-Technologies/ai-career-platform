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

  Future<T> get<T>(String path, {Map<String, String>? query}) {
    return _request('GET', path, query: query) as Future<T>;
  }

  Future<T> post<T>(String path, {Map<String, dynamic>? body}) {
    return _request('POST', path, body: body) as Future<T>;
  }

  Future<dynamic> put(String path, {Map<String, dynamic>? body}) {
    return _request('PUT', path, body: body);
  }

  Future<dynamic> patch(String path, {Map<String, dynamic>? body}) {
    return _request('PATCH', path, body: body);
  }

  Future<dynamic> delete(String path) => _request('DELETE', path);

  Future<dynamic> _request(
    String method,
    String path, {
    Map<String, String>? query,
    Map<String, dynamic>? body,
  }) async {
    final response = await _send(method, _settings.baseUrl, path, query, body);
    if (response.statusCode == 401) {
      final refreshed = await _tryRefreshToken();
      if (refreshed) {
        final retryResponse = await _send(
          method,
          _settings.baseUrl,
          path,
          query,
          body,
        );
        final decoded = _decode(retryResponse.body);
        if (retryResponse.statusCode < 200 || retryResponse.statusCode >= 300) {
          throw _buildException(retryResponse);
        }
        return decoded;
      }
    }
    final decoded = _decode(response.body);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw _buildException(response);
    }
    return decoded;
  }

  /// Refreshes the session through the API.
  ///
  /// The API rotates the refresh token on every use, so the rotated pair is
  /// persisted before the request is retried.
  Future<bool> _tryRefreshToken() async {
    final refreshToken = await _tokenStorage.readRefreshToken();
    if (refreshToken == null || refreshToken.isEmpty) return false;
    try {
      final session = await _authService.refresh(refreshToken);
      if (session.token.isEmpty) return false;
      await _tokenStorage.writeSession(
        token: session.token,
        refreshToken: session.refreshToken,
      );
      return true;
    } on AuthException {
      await _tokenStorage.clearAll();
      return false;
    }
  }

  Future<http.Response> _send(
    String method,
    String baseUrl,
    String path,
    Map<String, String>? query,
    Map<String, dynamic>? body,
  ) async {
    final token = await _tokenStorage.readToken();
    final headers = <String, String>{
      'Accept': 'application/json',
      if (body != null) 'Content-Type': 'application/json',
      if (token != null && token.isNotEmpty) 'Authorization': 'Bearer $token',
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
        message: 'Unable to reach the Job Radar service',
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
        message: 'Unable to reach the Job Radar service',
        cause: error,
      );
    }
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
    );
  }

  static const _timeout = Duration(seconds: 20);
}
