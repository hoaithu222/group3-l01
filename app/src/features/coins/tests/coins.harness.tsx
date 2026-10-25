import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react-native';
import { AxiosError } from 'axios';
import type { ReactElement, ReactNode } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { socket } from '@/core/socket';

import type {
  CoinTransaction,
  InventoryEntry,
  Quest,
  ShopListing,
  Wallet,
} from '../api/coins.types';

/** Đồ dùng chung cho test `features/coins`. KHÔNG phải test (`testMatch` chỉ nhận `*.test.ts(x)`). */

/** ⚠️ `Screen`/`BottomSheet` gọi `useSafeAreaInsets()` — thiếu provider là ném lỗi. */
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

/** Lỗi HTTP có cấu trúc BE (`{ error: { code, message, details } }`) — `message` cố ý khác câu của app để test biết app dùng câu của mình. */
export function apiError(status: number, code: string, details?: unknown): AxiosError {
  return new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    config: {} as never,
    data: { error: { code, details, message: 'Câu của server' } },
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

export const wallet = (over: Partial<Wallet> = {}): Wallet => ({
  balance: 1250,
  dailyCap: 200,
  lifetimeEarned: 2000,
  lifetimeSpent: 750,
  todayEarned: 40,
  ...over,
});

export const quest = (id: string, over: Partial<Quest> = {}): Quest => ({
  claimable: false,
  claimedAt: null,
  progress: 1,
  quest: {
    code: id.toUpperCase(),
    coins: 20,
    description: `Mô tả ${id}`,
    id,
    order: 0,
    title: `Nhiệm vụ ${id}`,
  },
  target: 3,
  ...over,
});

export const tx = (id: string, over: Partial<CoinTransaction> = {}): CoinTransaction => ({
  amount: 20,
  at: '2026-09-27T03:30:00.000Z',
  balanceAfter: 1250,
  id,
  refId: 'TASK_ON_TIME:abc',
  refType: 'XP_EVENT',
  type: 'EARN_EVENT',
  ...over,
});

export const shopItem = (id: string, over: Partial<ShopListing> = {}): ShopListing => ({
  assetId: null,
  availableFrom: null,
  availableTo: null,
  code: id.toUpperCase(),
  data: { color: '#D4A017', width: 3 },
  equipped: false,
  id,
  inventoryId: null,
  kind: 'AVATAR_FRAME',
  name: `Vật phẩm ${id}`,
  owned: false,
  price: 300,
  ...over,
});

export const entry = (id: string, over: Partial<InventoryEntry> = {}): InventoryEntry => ({
  acquiredAt: '2026-09-20T00:00:00.000Z',
  equipped: false,
  id,
  item: {
    assetId: null,
    availableFrom: null,
    availableTo: null,
    code: id.toUpperCase(),
    data: { color: '#D4A017', width: 3 },
    id: `item-${id}`,
    kind: 'AVATAR_FRAME',
    name: `Khung ${id}`,
    price: 300,
  },
  itemId: `item-${id}`,
  kind: 'AVATAR_FRAME',
  ...over,
});
