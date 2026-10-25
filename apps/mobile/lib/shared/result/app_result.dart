sealed class AppResult<T> {
  const AppResult();

  bool get isSuccess => this is AppSuccess<T>;
  bool get isFailure => this is AppFailure<T>;

  T? get valueOrNull => switch (this) {
    AppSuccess<T>(:final value) => value,
    AppFailure<T>() => null,
  };
}

final class AppSuccess<T> extends AppResult<T> {
  const AppSuccess(this.value);

  final T value;
}

final class AppFailure<T> extends AppResult<T> {
  const AppFailure(this.message, {this.cause});

  final String message;
  final Object? cause;
}
