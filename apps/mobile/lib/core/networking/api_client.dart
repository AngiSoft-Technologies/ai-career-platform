import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import '../configuration/app_settings.dart';
import '../authentication/token_storage.dart';
import 'api_exception.dart';

class ApiClient {
  ApiClient({
    required AppSettings settings,
    required TokenStorage tokenStorage,
    http.Client? client,
  }) : _settings = settings,
       _tokenStorage = tokenStorage,
       _client = client ?? http.Client();

  final AppSettings _settings;
  final TokenStorage _tokenStorage;
  final http.Client _client;
  String? _configuredBaseUrl;
  String? _activeBaseUrl;

  Future<dynamic> get(String path, {Map<String, String>? query}) {
    return _request('GET', path, query: query);
  }

  Future<dynamic> post(String path, {Map<String, dynamic>? body}) {
    return _request('POST', path, body: body);
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
    final baseUrl = _resolveBaseUrl();
    var response = await _send(method, baseUrl, path, query, body);
    final alternate = _alternateBaseUrl(baseUrl);
    if (response.statusCode == 404 && alternate != null) {
      response = await _send(method, alternate, path, query, body);
      if (response.statusCode != 404) _activeBaseUrl = alternate;
    }
    final decoded = _decode(response.body);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      final error = decoded is Map ? decoded['error'] : null;
      final code = decoded is Map ? decoded['code'] : null;
      throw ApiException(
        statusCode: response.statusCode,
        message: error is String && error.isNotEmpty
            ? error
            : 'Request failed with status ${response.statusCode}',
        code: code is String ? code : null,
      );
    }
    return decoded;
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

  String _resolveBaseUrl() {
    if (_configuredBaseUrl != _settings.baseUrl) {
      _configuredBaseUrl = _settings.baseUrl;
      _activeBaseUrl = null;
    }
    return _activeBaseUrl ?? _settings.baseUrl;
  }

  String? _alternateBaseUrl(String baseUrl) {
    final uri = Uri.tryParse(baseUrl);
    if (uri == null || uri.host != 'job-radar-api-angisoft.fly.dev') {
      return null;
    }
    if (!uri.path.endsWith('/v1')) return null;
    final path = '${uri.path.substring(0, uri.path.length - 3)}/api/v1';
    return uri.replace(path: path).toString().replaceAll(RegExp(r'/$'), '');
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

  static const _timeout = Duration(seconds: 20);
}
