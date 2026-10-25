import type { CallHistoryFilter, CallScopeType } from './calls.types';

/** Khoá cache của `calls` — mọi tham số ảnh hưởng kết quả đều nằm trong khoá (skill `api-data`). */
export const callKeys = {
  active: (scopeType: CallScopeType, scopeId: string) =>
    ['calls', 'active', scopeType, scopeId] as const,
  all: ['calls'] as const,
  detail: (callId: string) => ['calls', 'detail', callId] as const,
  history: (filter: CallHistoryFilter) => ['calls', 'me', 'history', filter] as const,
  historyAll: ['calls', 'me', 'history'] as const,
  myActive: ['calls', 'me', 'active'] as const,
};
