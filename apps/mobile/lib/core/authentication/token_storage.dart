import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Stores the session the API issued.
///
/// Only API-issued tokens live here. Provider sessions and provider cookies
/// are never stored on the device.
class TokenStorage {
  TokenStorage({FlutterSecureStorage? storage})
    : _storage = storage ?? const FlutterSecureStorage();

  static const _tokenKey = 'job_radar_access_token';
  static const _refreshTokenKey = 'job_radar_refresh_token';

  final FlutterSecureStorage _storage;

  Future<String?> readToken() => _storage.read(key: _tokenKey);

  Future<String?> readRefreshToken() => _storage.read(key: _refreshTokenKey);

  Future<void> writeSession({
    required String token,
    required String refreshToken,
  }) async {
    await _storage.write(key: _tokenKey, value: token);
    await _storage.write(key: _refreshTokenKey, value: refreshToken);
  }

  Future<void> deleteToken() => _storage.delete(key: _tokenKey);

  Future<void> clearAll() async {
    await _storage.delete(key: _tokenKey);
    await _storage.delete(key: _refreshTokenKey);
  }
}
