import { IS_DEBUG_MODE } from '../constants/env';

type LogFn = (...args: unknown[]) => void;

function devOnly(fn: LogFn): LogFn {
  return (...args: unknown[]) => {
    if (IS_DEBUG_MODE) fn(...args);
  };
}

/** Verbose logs — stripped in production builds via Babel; gated here for dev control. */
export const devLog = devOnly(console.log.bind(console));

/** Diagnostic warnings — kept in production only when IS_DEBUG_MODE is true. */
export const devWarn = devOnly(console.warn.bind(console));

/** Always emitted — use for genuine failures users/operators must see in crash logs. */
export const logError = console.error.bind(console);
