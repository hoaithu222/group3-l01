import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import type { RecapDto, RecordingDto } from '../api/meeting-recap.types';

/** Đồ dùng chung cho test của `meeting-recap`. KHÔNG phải test (`testMatch` chỉ nhận `*.test.ts(x)`). */

const METRICS: Metrics = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      mutations: { gcTime: 0, retry: false },
      queries: { gcTime: Infinity, retry: false, staleTime: 0 },
    },
  });
}

/** ⚠️ `render()` của RNTL 14 là BẤT ĐỒNG BỘ — phải `await`. */
export async function renderWithProviders(ui: ReactElement, queryClient: QueryClient = makeQueryClient()) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <SafeAreaProvider initialMetrics={METRICS}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </SafeAreaProvider>
    );
  }
  const result = await render(ui, { wrapper: Wrapper });
  return { ...result, queryClient };
}

/** Lỗi axios có cấu trúc `{ error: { code, details } }` như BE trả. */
export function apiError(status: number, code: string, details?: unknown) {
  return Object.assign(new Error(`HTTP ${status}`), {
    isAxiosError: true,
    response: { data: { error: { code, details, message: code } }, headers: {}, status },
  });
}

export function makeRecap(over: Partial<RecapDto> = {}): RecapDto {
  return {
    attachments: [],
    authorId: 'host',
    content: '### Quyết định\n- Chốt **ngân sách** quý 4\n- [ ] Gửi báo cáo',
    endedAt: '2026-09-25T03:00:00.000Z',
    hasUnpublishedChanges: true,
    lastEditedBy: 'host',
    meetingId: 'meet-1',
    myActions: { canEdit: true, canPublish: true },
    recapId: 'recap-1',
    serverNow: '2026-09-25T04:00:00.000Z',
    startedAt: '2026-09-25T02:00:00.000Z',
    version: 3,
    ...over,
  };
}

export function makeRecording(over: Partial<RecordingDto> = {}): RecordingDto {
  return {
    consentCount: 3,
    durationSec: 2700,
    fileSizeBytes: 50 * 1024 * 1024,
    id: 'rec-1',
    layout: 'GRID',
    meetingId: 'meet-1',
    myActions: { canDelete: false, canDownload: false, canRetry: false, canStop: false },
    retentionExpiresAt: '2026-12-24T03:00:00.000Z',
    serverNow: '2026-09-25T04:00:00.000Z',
    startedAt: '2026-09-25T02:05:00.000Z',
    startedBy: 'host',
    status: 'READY',
    ...over,
  };
}
