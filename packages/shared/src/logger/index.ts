export const LOG_LEVELS = ['debug', 'info', 'warning', 'error', 'fatal'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export type LogContext = Record<string, unknown>;

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context: LogContext;
}

export type LogWriter = (entry: LogEntry) => void;
export type Clock = () => string;

export interface Logger {
  log: (level: LogLevel, message: string, context?: LogContext) => void;
  debug: (message: string, context?: LogContext) => void;
  info: (message: string, context?: LogContext) => void;
  warning: (message: string, context?: LogContext) => void;
  error: (message: string, context?: LogContext) => void;
  fatal: (message: string, context?: LogContext) => void;
  withContext: (context: LogContext) => Logger;
}

export interface CreateLoggerOptions {
  baseContext?: LogContext;
  writer?: LogWriter;
  now?: Clock;
}

function defaultWriter(entry: LogEntry): void {
  process.stdout.write(`${JSON.stringify(entry)}\n`);
}

function defaultNow(): string {
  return new Date().toISOString();
}

export function createLogger(options: CreateLoggerOptions = {}): Logger {
  const baseContext = options.baseContext ?? {};
  const writer = options.writer ?? defaultWriter;
  const now = options.now ?? defaultNow;

  const write = (level: LogLevel, message: string, context: LogContext = {}): void => {
    writer({
      timestamp: now(),
      level,
      message,
      context: { ...baseContext, ...context },
    });
  };

  return {
    log: write,
    debug: (message, context) => {
      write('debug', message, context);
    },
    info: (message, context) => {
      write('info', message, context);
    },
    warning: (message, context) => {
      write('warning', message, context);
    },
    error: (message, context) => {
      write('error', message, context);
    },
    fatal: (message, context) => {
      write('fatal', message, context);
    },
    withContext: (context) =>
      createLogger({
        baseContext: { ...baseContext, ...context },
        writer,
        now,
      }),
  };
}
