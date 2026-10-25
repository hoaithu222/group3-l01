import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { webViewMethods } from '../../../../__mocks__/react-native-webview';
import type { CollabGrant } from '@/shared/collab';

import type { DocumentDetail, DocumentView } from '../api/docs.types';

/** Đồ dùng chung cho test của `docs`. KHÔNG phải test (`testMatch` chỉ nhận `*.test.tsx`); mọi `jest.mock` nằm ở từng file test. */
export const DOC_ID = '0123456789abcdef01234567';
export const WS_ID = '0123456789abcdef01234599';

const METRICS: Metrics = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { gcTime: Infinity, retry: false, staleTime: 0 },
    },
  });
}

/** ⚠️ `render()` của RNTL 14 là BẤT ĐỒNG BỘ — phải `await`. */
export async function renderWithProviders(ui: ReactElement, queryClient = makeQueryClient()) {
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

/** Lỗi axios có cấu trúc `{ error: { code } }` như BE trả. */
export function apiError(status: number, code: string) {
  return Object.assign(new Error(`HTTP ${status}`), {
    isAxiosError: true,
    response: { data: { error: { code, message: code } }, headers: {}, status },
  });
}

export function makeDocView(over: Partial<DocumentView> = {}): DocumentView {
  return {
    createdAt: '2026-09-27T00:00:00.000Z',
    createdBy: 'u1',
    id: DOC_ID,
    lastEditedAt: '2026-09-27T09:00:00.000Z',
    lastEditedBy: { id: 'u2', name: 'Trần Lan' },
    myRole: 'CREATOR',
    status: 'ACTIVE',
    title: 'Báo cáo tuần 3',
    updatedAt: '2026-09-27T09:00:00.000Z',
    version: 3,
    visibility: 'WORKSPACE',
    wordCount: 120,
    workspaceId: WS_ID,
    yjsVersion: 5,
    ...over,
  };
}

export function makeDoc(over: Partial<DocumentDetail> = {}): DocumentDetail {
  return {
    ...makeDocView(),
    myPermissions: { edit: true, manage: true, restore: true, snapshot: true },
    ...over,
  };
}

export function makeGrant(over: Partial<CollabGrant> = {}): CollabGrant {
  return {
    documentName: `doc:${DOC_ID}`,
    expiresAt: Date.now() + 300_000,
    mode: 'edit',
    token: 'header.payload.signature',
    url: 'wss://superapp.example.com/collab',
    user: { color: '#175CD3', id: 'u1', name: 'Nguyễn An' },
    ...over,
  };
}

/** Tin WebView → app dạng chuỗi JSON `{ v: 1, type, payload }`. */
export const editorMsg = (type: string, payload: unknown): string =>
  JSON.stringify({ payload, type, v: 1 });

export const STATUS_OK = {
  archived: false,
  connection: 'synced',
  mode: 'edit',
  nearLimit: false,
  readOnly: false,
  saveFailed: false,
  tooLarge: false,
  unsynced: false,
};

export const SELECTION = {
  blockquote: false,
  bold: false,
  bulletList: false,
  canEdit: true,
  canRedo: false,
  canUndo: true,
  code: false,
  codeBlock: false,
  heading: null,
  italic: false,
  link: null,
  orderedList: false,
  strike: false,
  table: false,
  taskList: false,
  underline: false,
};

/** Gửi một tin từ "trang" tới app qua `onMessage` của WebView giả. */
export async function fromEditor(type: string, payload: unknown): Promise<void> {
  await fireEvent(screen.getByTestId('webview'), 'message', {
    nativeEvent: { data: editorMsg(type, payload) },
  });
}

export async function rawFromEditor(data: string): Promise<void> {
  await fireEvent(screen.getByTestId('webview'), 'message', { nativeEvent: { data } });
}

/** Các tin app → trang đã `postMessage` (đã parse JSON) theo thứ tự. */
export function posted(): { payload: Record<string, unknown>; type: string; v: number }[] {
  return webViewMethods.postMessage.mock.calls.map(
    ([json]) =>
      JSON.parse(json as string) as { payload: Record<string, unknown>; type: string; v: number },
  );
}

export const postedOfType = (type: string) => posted().filter((message) => message.type === type);
