import 'dart:convert';

import 'package:http/http.dart' as http;

class NeonAuthException implements Exception {
  const NeonAuthException(this.message, {this.statusCode});

  final String message;
  final int? statusCode;

  @override
  String toString() => message;
}

class NeonAuthResult {
  const NeonAuthResult({
    required this.token,
    required this.email,
    required this.name,
  });

  final String token;
  final String email;
  final String name;
}

class NeonAuthService {
  NeonAuthService({http.Client? client}) : _client = client ?? http.Client();

  static const baseUrl =
      'https://ep-mute-glitter-b5uefleh.neonauth.c-7.us-east-2.aws.neon.tech/neondb/auth';
  static const origin = 'https://job-radar-api-angisoft.fly.dev';

  final http.Client _client;

  Future<NeonAuthResult> signIn({
    required String email,
    required String password,
  }) {
    return _authenticate(
      path: '/sign-in/email',
      email: email,
      password: password,
    );
  }

  Future<NeonAuthResult> signUp({
    required String email,
    required String password,
    required String name,
  }) {
    return _authenticate(
      path: '/sign-up/email',
      email: email,
      password: password,
      name: name,
    );
  }

  Future<NeonAuthResult> _authenticate({
    required String path,
    required String email,
    required String password,
    String? name,
  }) async {
    final response = await _client
        .post(
          Uri.parse('$baseUrl$path'),
          headers: const {'Content-Type': 'application/json', 'Origin': origin},
          body: jsonEncode({
            'email': email.trim(),
            'password': password,
            if (name != null && name.trim().isNotEmpty) 'name': name.trim(),
          }),
        )
        .timeout(const Duration(seconds: 20));

    final body = _decode(response.body);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw NeonAuthException(
        _errorMessage(body, fallback: 'Authentication failed'),
        statusCode: response.statusCode,
      );
    }

    final cookie = _sessionCookie(response.headers);
    final sessionToken = await _requestSessionToken(cookie);
    final fallbackToken = _findToken(body);
    final token = sessionToken ?? fallbackToken;
    if (token == null || token.isEmpty) {
      throw const NeonAuthException(
        'The authentication service returned no token',
      );
    }

    final user = body['user'];
    final userMap = user is Map<String, dynamic>
        ? user
        : const <String, dynamic>{};
    return NeonAuthResult(
      token: token,
      email: (userMap['email'] as String?) ?? email.trim(),
      name: (userMap['name'] as String?) ?? name?.trim() ?? '',
    );
  }

  Future<String?> _requestSessionToken(String? cookie) async {
    final headers = <String, String>{'Origin': origin};
    if (cookie != null && cookie.isNotEmpty) headers['Cookie'] = cookie;
    final response = await _client
        .get(Uri.parse('$baseUrl/token'), headers: headers)
        .timeout(const Duration(seconds: 20));
    if (response.statusCode < 200 || response.statusCode >= 300) return null;
    final body = _decode(response.body);
    return _findToken(body);
  }

  Map<String, dynamic> _decode(String value) {
    if (value.isEmpty) return const <String, dynamic>{};
    final decoded = jsonDecode(value);
    if (decoded is Map<String, dynamic>) return decoded;
    return const <String, dynamic>{};
  }

  String? _sessionCookie(Map<String, String> headers) {
    final cookieHeader = headers.entries
        .where((entry) => entry.key.toLowerCase() == 'set-cookie')
        .map((entry) => entry.value)
        .join(',');
    if (cookieHeader.isEmpty) return null;
    final firstCookie = cookieHeader.split(RegExp(r',(?=\s*[^;,=\s]+=)')).first;
    return firstCookie.split(';').first.trim();
  }

  String? _findToken(dynamic value) {
    if (value is String && value.split('.').length >= 3) return value;
    if (value is Map) {
      for (final key in const ['token', 'accessToken', 'access_token', 'jwt']) {
        final candidate = value[key];
        if (candidate is String && candidate.isNotEmpty) return candidate;
      }
      for (final entry in value.entries) {
        final token = _findToken(entry.value);
        if (token != null) return token;
      }
    }
    if (value is List) {
      for (final entry in value) {
        final token = _findToken(entry);
        if (token != null) return token;
      }
    }
    return null;
  }

  String _errorMessage(Map<String, dynamic> body, {required String fallback}) {
    final message = body['message'] ?? body['error'];
    if (message is String && message.trim().isNotEmpty) return message.trim();
    return fallback;
  }
}
