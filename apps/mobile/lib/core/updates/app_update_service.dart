import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../networking/api_client.dart';

class AppUpdateInfo {
  const AppUpdateInfo({
    required this.current,
    required this.latest,
    required this.force,
    this.storeUrl,
  });

  final String current;
  final String latest;
  final bool force;
  final String? storeUrl;
}

class AppUpdateService {
  AppUpdateService({
    required ApiClient apiClient,
    String? currentVersion,
    String? androidStoreUrl,
    String? iosStoreUrl,
  }) : _apiClient = apiClient,
       _currentVersion = currentVersion,
       androidStoreUrl = androidStoreUrl ?? 'https://play.google.com/store/apps/details?id=ke.co.angisoft.mboqara',
       iosStoreUrl =
           iosStoreUrl ?? 'https://apps.apple.com/ke/app/mboqara/id6740000000';

  final ApiClient _apiClient;
  final String? _currentVersion;
  final String androidStoreUrl;
  final String iosStoreUrl;

  /// Reads the real package version instead of the hard-coded 1.0.0 that
  /// made every store build look out of date (or up to date) forever.
  Future<String> get currentVersion async {
    final override = _currentVersion;
    if (override != null && override.isNotEmpty) return override;
    final info = await PackageInfo.fromPlatform();
    return info.version;
  }

  Future<AppUpdateInfo?> check() async {
    try {
      final version = await currentVersion;
      // The public client config is the single source of truth for the
      // minimum supported version. Older deployments also expose the same
      // information at /app/version, so try both before giving up.
      Map<String, dynamic>? res;
      try {
        res = await _apiClient.get<Map<String, dynamic>>('/config/client');
      } catch (_) {
        res = await _apiClient.get<Map<String, dynamic>>(
          '/app/version',
          query: {
            'platform': Platform.isIOS ? 'ios' : 'android',
            'current': version,
          },
        );
      }
      final latest =
          res['latest']?.toString() ?? res['minSupportedVersion']?.toString();
      if (latest == null || latest.isEmpty) return null;
      final force =
          res['forceUpdate'] == true ||
          res['force'] == true ||
          res['force_update'] == true;
      final storeUrl =
          res['storeUrl']?.toString() ??
          (Platform.isIOS ? iosStoreUrl : androidStoreUrl);
      if (!_isNewer(latest, version) && !force) return null;
      return AppUpdateInfo(
        current: version,
        latest: latest,
        force: force,
        storeUrl: storeUrl,
      );
    } catch (_) {
      // Update checks are advisory. A remote-config kill switch is enforced
      // separately and must not depend on this endpoint being reachable.
      return null;
    }
  }

  static bool isNewer(String latest, String current) {
    List<int> parts(String value) => value
        .split('+')
        .first
        .split('.')
        .map(
          (piece) => int.tryParse(piece.replaceAll(RegExp(r'[^0-9]'), '')) ?? 0,
        )
        .toList();
    final a = parts(latest);
    final b = parts(current);
    final length = a.length > b.length ? a.length : b.length;
    for (var i = 0; i < length; i++) {
      final x = i < a.length ? a[i] : 0;
      final y = i < b.length ? b[i] : 0;
      if (x != y) return x > y;
    }
    return false;
  }

  bool _isNewer(String latest, String current) => isNewer(latest, current);
}

Future<void> openAppStore(AppUpdateInfo info) async {
  final url = info.storeUrl;
  if (url != null && url.isNotEmpty) {
    await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
  }
}

Future<void> showAppUpdateDialog(
  BuildContext context,
  AppUpdateInfo info,
) async {
  await showDialog<void>(
    context: context,
    barrierDismissible: !info.force,
    builder: (context) => AlertDialog(
      title: Text(info.force ? 'Update required' : 'Update available'),
      content: Text(
        'Version ${info.latest} is available (you have ${info.current}).',
      ),
      actions: [
        if (!info.force)
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Later'),
          ),
        FilledButton(
          onPressed: () {
            Navigator.pop(context);
            unawaited(openAppStore(info));
          },
          child: const Text('Open store'),
        ),
      ],
    ),
  );
}
