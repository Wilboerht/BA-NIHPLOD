type LogArgs = unknown[];

export const logger = {
  debug: (...args: LogArgs) => console.debug(...args),
  info: (...args: LogArgs) => console.info(...args),
  warn: (...args: LogArgs) => console.warn(...args),
  error: (...args: LogArgs) => console.error(...args),
};
