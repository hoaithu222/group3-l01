import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react-native';
import { AxiosError } from 'axios';
import type { ReactElement, ReactNode } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import type { TemplateChannel, WorkspaceTemplate } from '../api';

/** ⚠️ `Screen`/`AppBar` gọi `useSafeAreaInsets()` — ném lỗi nếu thiếu provider. */
const SAFE_AREA_METRICS: Metrics = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { gcTime: Infinity, retry: false, staleTime: 0 },
    },
  });
}

/** ⚠️ `render()` của RNTL 14 là BẤT ĐỒNG BỘ — phải `await`. */
export async function renderWithProviders(
  ui: ReactElement,
  queryClient: QueryClient = makeQueryClient(),
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </SafeAreaProvider>
    );
  }
  const result = await render(ui, { wrapper: Wrapper });
  return { ...result, queryClient };
}

/** Lỗi HTTP có thân `{ error: { code, details } }` như `errorHandler` của BE. */
export function apiError(status: number, code: string): AxiosError {
  return new AxiosError(`HTTP ${status}`, 'ERR_BAD_REQUEST', undefined, undefined, {
    config: {} as never,
    data: { success: false, error: { code, message: code } },
    headers: {},
    status,
    statusText: '',
  });
}

/** Mất mạng: không có phản hồi nào (BE KHÔNG lưu gì dưới `Idempotency-Key` — thử lại an toàn với cùng khoá). */
export function networkError(): AxiosError {
  return new AxiosError('Network Error', 'ERR_NETWORK');
}

function makeChannel(overrides: Partial<TemplateChannel> = {}): TemplateChannel {
  return {
    defaultSelected: true,
    description: '',
    key: 'thao-luan',
    name: 'Thảo luận',
    postingPolicy: 'MEMBERS',
    type: 'TEXT',
    visibility: 'PUBLIC',
    ...overrides,
  };
}

/** Mẫu "Nhóm môn học": hai kênh tick sẵn, một kênh thoại KHÔNG tick sẵn. */
export const COURSE: WorkspaceTemplate = {
  channels: [
    makeChannel({
      description: 'Thông báo của giảng viên',
      key: 'thong-bao',
      name: 'Thông báo',
      postingPolicy: 'ADMINS_ONLY',
    }),
    makeChannel({ key: 'thao-luan', name: 'Thảo luận' }),
    makeChannel({ defaultSelected: false, key: 'phong-hoc', name: 'Phòng học', type: 'VOICE' }),
  ],
  code: 'course',
  description: 'Kênh cho một lớp học phần',
  name: 'Nhóm môn học',
};

export const CAPSTONE: WorkspaceTemplate = {
  channels: [
    makeChannel({ key: 'tien-do', name: 'Tiến độ' }),
    makeChannel({
      defaultSelected: false,
      key: 'tai-lieu',
      name: 'Tài liệu',
      visibility: 'PRIVATE',
    }),
  ],
  code: 'capstone',
  description: 'Theo dõi đồ án nhóm',
  name: 'Đồ án',
};

const SELF_STUDY: WorkspaceTemplate = {
  channels: [makeChannel({ key: 'ghi-chu', name: 'Ghi chú' })],
  code: 'tu-hoc',
  description: 'Tự học theo kế hoạch riêng',
  name: 'Nhóm tự học',
};

export const TEMPLATES: WorkspaceTemplate[] = [COURSE, CAPSTONE, SELF_STUDY];
