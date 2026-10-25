class ApiException implements Exception {
  const ApiException({
    required this.statusCode,
    required this.message,
    this.code,
    this.cause,
  });

  final int statusCode;
  final String message;
  final String? code;
  final Object? cause;

  bool get isNetworkError => statusCode == 0;
  bool get isNotFound => statusCode == 404;
  bool get isUnauthorized => statusCode == 401;

  @override
  String toString() => message;
}
