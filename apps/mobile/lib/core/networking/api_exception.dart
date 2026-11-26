class ApiException implements Exception {
  const ApiException({
    required this.statusCode,
    required this.message,
    this.code,
    this.cause,
    this.serverData,
  });

  final int statusCode;
  final String message;
  final String? code;
  final Object? cause;
  /// Server payload for conflict resolution (409) or validation details.
  final Map<String, dynamic>? serverData;

  bool get isNetworkError => statusCode == 0;
  bool get isNotFound => statusCode == 404;
  bool get isUnauthorized => statusCode == 401;
  bool get isConflict => statusCode == 409;
  bool get isServerError => statusCode >= 500;

  @override
  String toString() => message;
}
