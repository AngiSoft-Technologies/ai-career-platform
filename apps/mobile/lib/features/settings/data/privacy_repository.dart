import 'dart:convert';
import 'dart:typed_data';

import 'package:share_plus/share_plus.dart';

import '../../../core/networking/api_client.dart';

class PrivacySettings {
  const PrivacySettings({
    this.allowAnalytics = true,
    this.personalisation = true,
    this.screenshotProtection = false,
  });

  final bool allowAnalytics;
  final bool personalisation;
  final bool screenshotProtection;

  factory PrivacySettings.fromJson(Map<String, dynamic> json) =>
      PrivacySettings(
        allowAnalytics: json['allowAnalytics'] != false,
        personalisation: json['personalisation'] != false,
        screenshotProtection: json['screenshotProtection'] == true,
      );

  Map<String, dynamic> toJson() => {
    'allowAnalytics': allowAnalytics,
    'personalisation': personalisation,
    'screenshotProtection': screenshotProtection,
  };

  PrivacySettings copyWith({
    bool? allowAnalytics,
    bool? personalisation,
    bool? screenshotProtection,
  }) => PrivacySettings(
    allowAnalytics: allowAnalytics ?? this.allowAnalytics,
    personalisation: personalisation ?? this.personalisation,
    screenshotProtection: screenshotProtection ?? this.screenshotProtection,
  );
}

class TrustedDevice {
  const TrustedDevice({
    required this.id,
    this.label = '',
    this.lastActiveAt,
    this.current = false,
  });

  final String id;
  final String label;
  final DateTime? lastActiveAt;
  final bool current;

  factory TrustedDevice.fromJson(Map<String, dynamic> json) => TrustedDevice(
    id: json['id']?.toString() ?? '',
    label:
        (json['label'] ?? json['name'] ?? json['platform'])?.toString() ?? '',
    lastActiveAt: DateTime.tryParse(json['lastActiveAt'] as String? ?? ''),
    current: json['current'] == true,
  );
}

class PrivacyRepository {
  const PrivacyRepository({required ApiClient apiClient}) : _api = apiClient;

  final ApiClient _api;

  Future<PrivacySettings> load() async {
    final response = await _api.get('/v1/me/privacy');
    return PrivacySettings.fromJson(_map(response));
  }

  Future<PrivacySettings> update(PrivacySettings settings) async {
    final response = await _api.put('/v1/me/privacy', body: settings.toJson());
    if (response == null) return settings;
    return PrivacySettings.fromJson(_map(response));
  }

  /// Downloads the account export as a JSON file that the caller shares.
  Future<XFile> exportData() async {
    final response = await _api.get('/v1/me/export');
    final text = response is String
        ? response
        : const JsonEncoder.withIndent('  ').convert(response);
    return XFile.fromData(
      Uint8List.fromList(utf8.encode(text)),
      name: 'mboqara-data-export.json',
      mimeType: 'application/json',
    );
  }

  Future<void> deleteAccount() => _api.delete('/v1/me');

  Future<List<TrustedDevice>> devices() async {
    final response = await _api.get('/v1/me/devices');
    final dynamic raw = response is Map
        ? (response['devices'] ?? response['items'])
        : response;
    if (raw is! List) return const [];
    return raw
        .whereType<Map>()
        .map((item) => TrustedDevice.fromJson(Map<String, dynamic>.from(item)))
        .toList();
  }

  Map<String, dynamic> _map(dynamic response) {
    if (response is Map && response['privacy'] is Map) {
      return Map<String, dynamic>.from(response['privacy'] as Map);
    }
    if (response is Map) return Map<String, dynamic>.from(response);
    return const <String, dynamic>{};
  }
}
