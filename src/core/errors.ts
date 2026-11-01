export class AppError extends Error {
  readonly code: string | number;
  readonly details?: unknown;

  constructor(code: string | number, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.details = details;
  }
}

export class ParseError extends AppError {
  constructor(message: string, details?: unknown) {
    super("PARSE_ERROR", message, details);
    this.name = "ParseError";
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super("VALIDATION_ERROR", message, details);
    this.name = "ValidationError";
  }
}

export class ReconciliationError extends AppError {
  constructor(message: string, details?: unknown) {
    super("RECONCILIATION_ERROR", message, details);
    this.name = "ReconciliationError";
  }
}

export class LlmError extends AppError {
  constructor(message: string, details?: unknown) {
    super("LLM_ERROR", message, details);
    this.name = "LlmError";
  }
}

export class A2AError extends AppError {
  declare readonly code: number;

  constructor(code: number, message: string, details?: unknown) {
    super(code, message, details);
    this.name = "A2AError";
  }
}