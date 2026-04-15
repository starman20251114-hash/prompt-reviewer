export class LLMConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LLMConfigurationError";
  }
}

export class LLMAuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LLMAuthenticationError";
  }
}
