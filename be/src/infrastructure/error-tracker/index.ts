export type { IErrorTracker, ErrorContext } from "./error-tracker.interface";
export { extractErrorContext } from "./error-tracker.interface";
export { ConsoleTracker } from "./console-tracker";

import type { IErrorTracker } from "./error-tracker.interface";
import { ConsoleTracker } from "./console-tracker";

/**
 * Error tracker singleton.
 * Swap implementation bằng cách gọi setErrorTracker() trong server.ts.
 *
 * @example
 * // Trong server.ts khi tích hợp Sentry:
 * import { setErrorTracker } from "@infrastructure/error-tracker";
 * import { SentryTracker } from "./sentry-tracker";
 * setErrorTracker(new SentryTracker());
 */
let tracker: IErrorTracker = new ConsoleTracker();

export function getErrorTracker(): IErrorTracker {
  return tracker;
}

export function setErrorTracker(newTracker: IErrorTracker): void {
  tracker = newTracker;
}
