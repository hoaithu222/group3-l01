/** Đường dẫn endpoint của `calls` (BE `calls.routes.ts`, p2-01 README §5) — `grep` một lần là thấy hết mặt tiếp xúc BE. */

export const CALLS_PATH = '/calls';
export const CALLS_ACTIVE_PATH = '/calls/active';
export const ME_ACTIVE_CALL_PATH = '/me/active-call';
export const ME_CALLS_PATH = '/me/calls';

export const callPath = (callId: string): string => `/calls/${callId}`;
export const callActionPath = (
  callId: string,
  action: 'answer' | 'cancel' | 'decline' | 'end' | 'hand' | 'join' | 'leave' | 'screen-share' | 'token',
): string => `/calls/${callId}/${action}`;
