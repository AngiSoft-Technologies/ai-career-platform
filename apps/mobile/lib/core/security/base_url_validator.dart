class BaseUrlValidator {
  const BaseUrlValidator._();

  static String? validate(String value) {
    final trimmed = value.trim();
    if (trimmed.isEmpty) return 'Enter a base URL';
    final uri = Uri.tryParse(trimmed);
    if (uri == null || !uri.hasScheme || uri.host.isEmpty) {
      return 'Enter a valid URL';
    }
    final isLocal = uri.host == 'localhost' || uri.host == '127.0.0.1';
    if (uri.scheme != 'https' && !(uri.scheme == 'http' && isLocal)) {
      return 'Use HTTPS unless the server is local';
    }
    if (uri.hasQuery || uri.hasFragment) {
      return 'The base URL cannot contain a query or fragment';
    }
    return null;
  }
}
