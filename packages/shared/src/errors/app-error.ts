import { z } from 'zod/v4';

export const SEVERITY = ['fatal', 'error', 'warning', 'info'] as const;
export type Severity = (typeof SEVERITY)[number];

export const AppErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  severity: z.enum(SEVERITY),
  context: z.record(z.string(), z.unknown()).optional(),
  timestamp: z.iso.datetime(),
  cause: z.string().optional(),
});

export type AppErrorDTO = z.infer<typeof AppErrorSchema>;

export class AppError {
  readonly code: string;
  readonly message: string;
  readonly severity: Severity;
  readonly context: Record<string, unknown>;
  readonly timestamp: string;
  readonly cause?: string;

  private constructor(params: {
    code: string;
    message: string;
    severity: Severity;
    context?: Record<string, unknown>;
    cause?: Error;
  }) {
    this.code = params.code;
    this.message = params.message;
    this.severity = params.severity;
    this.context = params.context ?? {};
    this.timestamp = new Date().toISOString();
    this.cause = params.cause?.message;
  }

  static create(
    code: string,
    message: string,
    severity: Severity = 'error',
    context?: Record<string, unknown>,
    cause?: Error,
  ): AppError {
    return new AppError({ code, message, severity, context, cause });
  }

  static fatal(code: string, message: string, context?: Record<string, unknown>): AppError {
    return new AppError({ code, message, severity: 'fatal', context });
  }

  static warning(code: string, message: string, context?: Record<string, unknown>): AppError {
    return new AppError({ code, message, severity: 'warning', context });
  }

  static info(code: string, message: string, context?: Record<string, unknown>): AppError {
    return new AppError({ code, message, severity: 'info', context });
  }

  toDTO(): AppErrorDTO {
    return {
      code: this.code,
      message: this.message,
      severity: this.severity,
      context: this.context,
      timestamp: this.timestamp,
      cause: this.cause,
    };
  }

  static fromDTO(dto: AppErrorDTO): AppError {
    return new AppError({
      code: dto.code,
      message: dto.message,
      severity: dto.severity,
      context: dto.context,
    });
  }

  toString(): string {
    return `[${this.severity.toUpperCase()}] ${this.code}: ${this.message}`;
  }
}
