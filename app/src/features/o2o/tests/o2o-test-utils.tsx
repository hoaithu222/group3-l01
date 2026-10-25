import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import type {
  LocationDetail,
  NearLocation,
  PrintOrderView,
  PrintQuote,
  PrintShopView,
  ReviewView,
} from '../api/o2o.types';

/** Đồ dùng chung cho test của `o2o`. KHÔNG phải test (`testMatch` chỉ nhận `*.test.ts(x)`). */
const METRICS: Metrics = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      // `gcTime: Infinity` cho MUTATION nữa: mặc định React Query hẹn giờ dọn 5 phút sau mỗi lượt ghi — chạy MỘT file test riêng thì tiến trình Node
      // ngồi chờ hẹn giờ đó tới hết 5 phút ("Jest did not exit one second after the test run"). Vô hạn = không hẹn giờ.
      mutations: { gcTime: Infinity, retry: false },
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

export function makeNear(over: Partial<NearLocation> = {}): NearLocation {
  return {
    id: 'loc-1',
    name: 'Cà phê Góc Học',
    type: 'CAFE',
    address: '12 Tạ Quang Bửu, Hà Nội',
    lat: 21.0049,
    lng: 105.8431,
    amenities: ['wifi_fast', 'power_outlets', 'quiet_zone', 'ac'],
    ratingAvg: 4.5,
    ratingCount: 12,
    noiseAvg: 1.8,
    distanceM: 350,
    openNow: true,
    shop: null,
    ...over,
  };
}

export function makeShop(over: Partial<PrintShopView> = {}): PrintShopView {
  return {
    id: 'shop-1',
    locationId: 'loc-2',
    displayName: 'In nhanh Bách Khoa',
    phone: '0901234567',
    priceTable: {
      a4Bw: 500,
      a4Color: 2000,
      a3Bw: 1500,
      a3Color: 5000,
      duplexDiscountPct: 10,
      minOrder: 2000,
    },
    capabilities: { color: true, duplex: true, a3: true, binding: false },
    acceptingOrders: true,
    priceTableVersion: 3,
    ...over,
  };
}

export function makeReview(over: Partial<ReviewView> = {}): ReviewView {
  return {
    id: 'rv-1',
    rating: 5,
    noise: 2,
    comment: 'Wifi nhanh, nhiều ổ cắm.',
    author: { id: 'u-2', name: 'Lan' },
    mine: false,
    createdAt: '2026-09-20T03:00:00.000Z',
    updatedAt: '2026-09-20T03:00:00.000Z',
    ...over,
  };
}

export function makeDetail(over: Partial<LocationDetail> = {}): LocationDetail {
  const { distanceM: _distance, shop: _shop, ...base } = makeNear({ type: 'PRINT_SHOP' });
  return {
    ...base,
    id: 'loc-2',
    name: 'In nhanh Bách Khoa',
    openHours: [{ day: 1, open: '07:00', close: '22:00' }],
    photos: [],
    recentReviews: [makeReview()],
    myReview: null,
    shop: makeShop(),
    ...over,
  };
}

export function makeQuote(over: Partial<PrintQuote> = {}): PrintQuote {
  return {
    printablePages: 12,
    sheets: 6,
    unitPrice: 2000,
    subtotal: 24_000,
    duplexDiscount: 2400,
    total: 21_600,
    priceTableVersion: 3,
    quotedAt: '2026-09-27T01:00:00.000Z',
    ...over,
  };
}

export function makeOrder(over: Partial<PrintOrderView> = {}): PrintOrderView {
  return {
    id: 'ord-1',
    code: 'PO-7K2M9Q',
    status: 'PENDING',
    shopId: 'shop-1',
    fileName: 'bao-cao.pdf',
    pages: 12,
    pageCountError: null,
    settings: {
      paper: 'A4',
      color: true,
      copies: 1,
      duplex: true,
      pageRange: null,
      binding: false,
    },
    quote: makeQuote(),
    payment: { method: 'AT_COUNTER', status: 'UNPAID', confirmedAt: null },
    events: [
      { status: 'DRAFT', at: '2026-09-27T00:50:00.000Z', note: null },
      { status: 'QUOTED', at: '2026-09-27T00:51:00.000Z', note: '12 trang' },
      { status: 'PENDING', at: '2026-09-27T01:00:00.000Z', note: null },
    ],
    rejectReason: null,
    cancelReason: null,
    pickupBy: null,
    submittedAt: '2026-09-27T01:00:00.000Z',
    readyAt: null,
    pickedUpAt: null,
    version: 4,
    createdAt: '2026-09-27T00:50:00.000Z',
    updatedAt: '2026-09-27T01:00:00.000Z',
    source: { kind: 'UPLOAD', resourceId: null },
    shop: {
      id: 'shop-1',
      displayName: 'In nhanh Bách Khoa',
      address: '1 Đại Cồ Việt, Hà Nội',
      lat: 21.005,
      lng: 105.843,
    },
    hasPin: true,
    myActions: { canEdit: false, canSubmit: false, canCancel: true, canRegeneratePin: true },
    ...over,
  };
}
