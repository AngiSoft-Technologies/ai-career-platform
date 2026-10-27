import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class TokenStorage {
  TokenStorage({FlutterSecureStorage? storage})
    : _storage = storage ?? const FlutterSecureStorage();

  static const _tokenKey = 'job_radar_neon_auth_jwt';
  static const _cookieKey = 'job_radar_neon_auth_cookie';
  final FlutterSecureStorage _storage;

  Future<String?> readToken() => _storage.read(key: _tokenKey);

  Future<void> writeToken(String token) =>
      _storage.write(key: _tokenKey, value: token);

  Future<void> deleteToken() => _storage.delete(key: _tokenKey);

  Future<String?> readCookie() => _storage.read(key: _cookieKey);

  Future<void> writeCookie(String cookie) =>
      _storage.write(key: _cookieKey, value: cookie);

  Future<void> deleteCookie() => _storage.delete(key: _cookieKey);

  Future<void> clearAll() async {
    await _storage.delete(key: _tokenKey);
    await _storage.delete(key: _cookieKey);
  }
}
