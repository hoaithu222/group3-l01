import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react-native';
import { AxiosError } from 'axios';
import type { ReactElement, ReactNode } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { socket } from '@/core/socket';

import type {
  WellbeingAssessment,
  WellbeingDaily,
  WellbeingFactor,
  WellbeingHistory,
  WellbeingSetting,
} from '../api/wellbeing.types';
import { addDays } from '../utils/wellbeing-format';
import { wellbeingToday } from '../utils/wellbeing-series';

/** Đồ dùng chung cho test `features/wellbeing`. KHÔNG phải test (`testMatch` chỉ nhận `*.test.ts(x)`). */

/** ⚠️ `Screen`/`BottomSheet`/host nổi gọi `useSafeAreaInsets()` — thiếu provider là ném lỗi. */
const METRICS: Metrics = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

export function makeClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      mutations: { gcTime: 0, retry: false },
      queries: { gcTime: Infinity, retry: false, staleTime: 0 },
    },
  });
}

/** `render()` của RNTL 14 là BẤT ĐỒNG BỘ — phải `await`. */
export async function renderWithClient(ui: ReactElement, client: QueryClient = makeClient()) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <SafeAreaProvider initialMetrics={METRICS}>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </SafeAreaProvider>
    );
  }
  return { client, screen: await render(ui, { wrapper: Wrapper }) };
}

/** Lỗi HTTP có cấu trúc BE (`{ error: { code, message } }`) — `message` cố ý khác câu của app để test biết app dùng câu của mình. */
export function apiError(status: number, code: string): AxiosError {
  return new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    config: {} as never,
    data: { error: { code, message: 'Câu của server' } },
    headers: {},
    status,
    statusText: '',
  });
}

/** Mất mạng: axios không có `response`. */
export const networkError = (): AxiosError => new AxiosError('Network Error', 'ERR_NETWORK');

interface MockSocket {
  __emitServer: (event: string, payload?: unknown) => void;
}

/** Socket giả dùng chung (`__mocks__/socket.io-client.ts`): `@/core/socket` xuất chính đối tượng đó. */
export const mockSocket = socket as unknown as MockSocket;

/** Chờ React Query xả hết việc đang treo trong `act`. */
export const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

/** Ngày wellbeing hôm qua theo giờ máy — cột cuối của biểu đồ. Test dựng ngày TƯƠNG ĐỐI để không phụ thuộc ngày chạy. */
export const yesterday = (): string => addDays(wellbeingToday(new Date()), -1);
export const daysAgo = (count: number): string => addDays(yesterday(), -count);

export const factor = (over: Partial<WellbeingFactor> = {}): WellbeingFactor => ({
  aggregate: 'MAX',
  days: 7,
  label: 'Làm việc liên tục quá lâu',
  metric: 'longestContinuousMinutes',
  ruleId: 'long-continuous-session',
  value: 195,
  ...over,
});

export const assessment = (over: Partial<WellbeingAssessment> = {}): WellbeingAssessment => ({
  ackAction: null,
  alerted: false,
  date: yesterday(),
  factors: [factor()],
  id: 'as1',
  level: 'MEDIUM',
  suggestion: 'BREAK',
  ...over,
});

export const daily = (date: string, over: Partial<WellbeingDaily> = {}): WellbeingDaily => ({
  activeMinutes: 200,
  date,
  eventsCount: 12,
  lateNightEvents: 0,
  lateNightMinutes: 0,
  longestContinuousMinutes: 90,
  ...over,
});

export const setting = (over: Partial<WellbeingSetting> = {}): WellbeingSetting => ({
  alertsEnabled: true,
  enabled: true,
  latest: null,
  optedInAt: '2026-09-20T00:00:00.000Z',
  pendingAlert: null,
  preferredBreak: null,
  ...over,
});

/** Chưa bật (mặc định của BE): không dữ liệu nào. */
export const disabledSetting = (): WellbeingSetting => setting({ enabled: false, optedInAt: null });

export const history = (over: Partial<WellbeingHistory> = {}): WellbeingHistory => ({
  assessments: [],
  dailies: [],
  days: 7,
  ...over,
});
