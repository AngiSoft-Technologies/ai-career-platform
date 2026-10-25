import '../../../core/configuration/app_settings.dart';
import '../../../core/security/base_url_validator.dart';

class SettingsRepository {
  SettingsRepository({required AppSettings settings}) : _settings = settings;

  final AppSettings _settings;

  String get baseUrl => _settings.baseUrl;
  bool get isDemoMode => _settings.isDemoMode;

  Future<void> setBaseUrl(String value) async {
    final error = BaseUrlValidator.validate(value);
    if (error != null) throw ArgumentError(error);
    await _settings.setBaseUrl(value);
  }

  Future<void> setDemoMode(bool enabled) => _settings.setDemoMode(enabled);
}
