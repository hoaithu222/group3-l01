import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';

import type { CollabGrant } from '@/shared/collab';

import type { WhiteboardDetail, WhiteboardView } from '../api/whiteboard.types';
import type { PortFactory, PortOptions, SessionPort } from '../collab/hocuspocus-port';

/** Đồ dùng chung cho test của `whiteboard` (KHÔNG phải test — `testMatch` chỉ nhận `*.test.ts(x)`); mọi `jest.mock` nằm ở từng file test. */
export const WB_ID = '0123456789abcdef01234567';
export const WS_ID = '0123456789abcdef01234599';
export const ME = '0123456789abcdef0123abcd';

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

export function makeBoardView(over: Partial<WhiteboardView> = {}): WhiteboardView {
  return {
    createdAt: '2026-09-27T00:00:00.000Z',
    createdBy: ME,
    elementCount: 12,
    id: WB_ID,
    lastEditedAt: '2026-09-27T09:00:00.000Z',
    lastEditedBy: { id: 'u2', name: 'Trần Lan' },
    myRole: 'CREATOR',
    name: 'Sơ đồ đồ án',
    status: 'ACTIVE',
    thumbnailAssetId: null,
    thumbnailUrl: null,
    updatedAt: '2026-09-27T09:00:00.000Z',
    version: 3,
    visibility: 'WORKSPACE',
    workspaceId: WS_ID,
    yjsVersion: 5,
    ...over,
  };
}

export function makeBoard(over: Partial<WhiteboardDetail> = {}): WhiteboardDetail {
  return {
    ...makeBoardView(),
    myPermissions: { edit: true, manage: true, restore: true, snapshot: true },
    ...over,
  };
}

export function makeGrant(over: Partial<CollabGrant> = {}): CollabGrant {
  return {
    documentName: `wb:${WB_ID}`,
    elementsMax: 5000,
    expiresAt: Date.now() + 300_000,
    mode: 'edit',
    token: 'header.payload.signature',
    url: 'wss://superapp.example.com/collab',
    user: { color: '#175CD3', id: ME, name: 'Nguyễn An' },
    ...over,
  };
}

/** Cổng giả cho `ConnectionController`/`WhiteboardRuntime`: không mở WebSocket; test gọi `handlers.*` để giả lập provider. */
export class FakePort implements SessionPort {
  readonly awareness = new Awareness(new Y.Doc());
  readonly connect = jest.fn();
  readonly destroy = jest.fn();
  readonly disconnect = jest.fn(() => this.options.handlers.onStatus('disconnected'));
  constructor(readonly options: PortOptions) {}

  /** Đi hết đường nối thành công: socket mở → xác thực → đồng bộ. */
  goLive(scope: 'read-write' | 'readonly' = 'read-write'): void {
    this.options.handlers.onStatus('connected');
    this.options.handlers.onAuthenticated(scope);
    this.options.handlers.onSynced();
  }
}

export function fakePorts(): { factory: PortFactory; last: () => FakePort; ports: FakePort[] } {
  const ports: FakePort[] = [];
  const factory: PortFactory = (options) => {
    const port = new FakePort(options);
    ports.push(port);
    return port;
  };
  return { factory, last: () => ports[ports.length - 1] as FakePort, ports };
}
