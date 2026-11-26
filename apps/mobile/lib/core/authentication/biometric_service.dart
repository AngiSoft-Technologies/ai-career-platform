import 'dart:math';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:local_auth/local_auth.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Device biometric unlock (fingerprint, Face ID, whatever the device offers).
///
/// The API never sees a biometric template. What it sees is an HMAC proof:
/// enrolment returns a secret once, this service seals it in the platform
/// keystore, and each step-up signs a server-issued challenge after the user
/// passes the local biometric prompt.
class BiometricService {
  BiometricService({
    LocalAuthentication? auth,
    FlutterSecureStorage? storage,
    SharedPreferences? preferences,
  }) : _auth = auth ?? LocalAuthentication(),
       _storage = storage ?? const FlutterSecureStorage(),
       _preferences = preferences;

  final LocalAuthentication _auth;
  final FlutterSecureStorage _storage;
  SharedPreferences? _preferences;

  static const _deviceIdKey = 'mboqara.device_id';

  Future<SharedPreferences> _prefs() async =>
      _preferences ??= await SharedPreferences.getInstance();

  /// True when the device can actually run a biometric prompt.
  Future<bool> isAvailable() async {
    try {
      if (!await _auth.isDeviceSupported()) return false;
      if (await _auth.canCheckBiometrics) return true;
      return (await _auth.getAvailableBiometrics()).isNotEmpty;
    } catch (_) {
      return false;
    }
  }

  /// Human-readable names of the enrolled modalities, e.g. "fingerprint".
  Future<List<String>> availableLabels() async {
    try {
      final types = await _auth.getAvailableBiometrics();
      return types
          .map((type) => switch (type) {
            BiometricType.face => 'face',
            BiometricType.fingerprint => 'fingerprint',
            BiometricType.iris => 'iris',
            BiometricType.strong => 'biometric',
            BiometricType.weak => 'biometric',
          })
          .toSet()
          .toList();
    } catch (_) {
      return const [];
    }
  }

  /// Stable per-install id the API uses as the method destination.
  Future<String> deviceId() async {
    final prefs = await _prefs();
    var id = prefs.getString(_deviceIdKey);
    if (id == null || id.isEmpty) {
      final random = Random.secure();
      final suffix = List.generate(
        16,
        (_) => random.nextInt(256).toRadixString(16).padLeft(2, '0'),
      ).join();
      id = 'dev_$suffix';
      await prefs.setString(_deviceIdKey, id);
    }
    return id;
  }

  /// Runs the system prompt. Returns false when the user cancels or fails.
  Future<bool> authenticate({required String reason}) async {
    try {
      return await _auth.authenticate(
        localizedReason: reason,
        biometricOnly: true,
        persistAcrossBackgrounding: true,
      );
    } catch (_) {
      return false;
    }
  }

  String _secretKey(String deviceId) => 'mboqara_biometric_secret_$deviceId';

  Future<String?> readSecret(String deviceId) =>
      _storage.read(key: _secretKey(deviceId));

  Future<void> writeSecret(String deviceId, String secret) =>
      _storage.write(key: _secretKey(deviceId), value: secret);

  Future<void> deleteSecret(String deviceId) =>
      _storage.delete(key: _secretKey(deviceId));
}
