import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Stores the session the API issued.
///
/// Only API-issued tokens live here. Provider sessions and provider cookies
/// are never stored on the device. Tokens use encrypted SharedPreferences on
/// Android and a Keychain entry that is unavailable until the device has been
/// unlocked at least once on iOS.
class TokenStorage {
  TokenStorage({FlutterSecureStorage? storage})
    : _storage =
          storage ??
          const FlutterSecureStorage(
            aOptions: AndroidOptions(encryptedSharedPreferences: true),
            iOptions: IOSOptions(
              accessibility: KeychainAccessibility.first_unlock_this_device,
            ),
          );

  static const _tokenKey = 'mboqara_access_token';
  static const _refreshTokenKey = 'mboqara_refresh_token';
  static const _expiresAtKey = 'mboqara_access_token_expires_at';
  static const _refreshExpiresAtKey = 'mboqara_refresh_token_expires_at';

  final FlutterSecureStorage _storage;

  Future<String?> readToken() => _storage.read(key: _tokenKey);

  Future<String?> readRefreshToken() => _storage.read(key: _refreshTokenKey);

  Future<DateTime?> readTokenExpiresAt() async {
    final raw = await _storage.read(key: _expiresAtKey);
    if (raw == null || raw.isEmpty) return null;
    return DateTime.tryParse(raw);
  }

  Future<DateTime?> readRefreshTokenExpiresAt() async {
    final raw = await _storage.read(key: _refreshExpiresAtKey);
    if (raw == null || raw.isEmpty) return null;
    return DateTime.tryParse(raw);
  }

  Future<void> writeSession({
    required String token,
    required String refreshToken,
    DateTime? expiresAt,
    DateTime? refreshExpiresAt,
  }) async {
    await _storage.write(key: _tokenKey, value: token);
    await _storage.write(key: _refreshTokenKey, value: refreshToken);
    if (expiresAt != null) {
      await _storage.write(
        key: _expiresAtKey,
        value: expiresAt.toIso8601String(),
      );
    }
    if (refreshExpiresAt != null) {
      await _storage.write(
        key: _refreshExpiresAtKey,
        value: refreshExpiresAt.toIso8601String(),
      );
    }
  }

  Future<void> deleteToken() => _storage.delete(key: _tokenKey);

  Future<void> clearAll() async {
    await _storage.delete(key: _tokenKey);
    await _storage.delete(key: _refreshTokenKey);
    await _storage.delete(key: _expiresAtKey);
    await _storage.delete(key: _refreshExpiresAtKey);
  }
}
