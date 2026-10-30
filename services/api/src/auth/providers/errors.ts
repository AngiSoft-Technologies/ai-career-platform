export class AuthProviderError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 401,
  ) {
    super(message);
    this.name = "AuthProviderError";
  }
}
