/**
 * Đồ dùng chung cho bài kiểm phân hệ `o2o` (p6-05 admin.md §4): fixture theo ĐÚNG hợp đồng BE (`admin-locations.service.ts`,
 * `admin-shops.service.ts`, `o2o.presenter.ts` `adminOrderView`) và hàm dựng router + React Query. Không phải `*.test.*`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { HttpResponse } from 'msw';
import type { ReactElement } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';

import { useAuthStore } from '@/app/store';
import type {
  AdminLocation,
  AdminLocationDetail,
  AdminLocationReview,
  AdminOrder,
  AdminShop,
  AdminShopDetail,
} from '@/features/o2o/types/o2o.types';

export const okBody = (data: unknown, meta?: Record<string, unknown>) =>
  HttpResponse.json({ success: true, data, ...(meta && { meta }) });

export const pageMeta = (total: number, page = 1, limit = 20) => ({
  page,
  limit,
  total,
  totalPages: Math.max(1, Math.ceil(total / limit)),
  hasNext: page * limit < total,
  hasPrev: page > 1,
});

export const cursorMeta = (hasMore = false, nextCursor: string | null = null) => ({
  nextCursor,
  hasMore,
  limit: 20,
});

export const LOCATION_ID = '650000000000000000000a01';
export const SHOP_ID = '650000000000000000000b01';
export const ORDER_ID = '650000000000000000000c01';
export const REVIEW_ID = '650000000000000000000d01';

export function makeLocation(over: Partial<AdminLocation> = {}): AdminLocation {
  return {
    id: LOCATION_ID,
    name: 'Cà phê Sách',
    type: 'CAFE',
    address: '12 Tạ Quang Bửu, Hà Nội',
    lat: 21.0045,
    lng: 105.8451,
    amenities: ['wifi_fast', 'quiet_zone', 'power_outlets', 'ac'],
    ratingAvg: 4.5,
    ratingCount: 12,
    noiseAvg: 2.1,
    openHours: [{ day: 1, open: '07:00', close: '22:00' }],
    photoAssetIds: [],
    status: 'ACTIVE',
    hiddenReason: null,
    version: 3,
    createdAt: '2026-09-01T02:00:00.000Z',
    updatedAt: '2026-09-02T02:00:00.000Z',
    shop: null,
    ...over,
  };
}

export function makeLocationDetail(over: Partial<AdminLocationDetail> = {}): AdminLocationDetail {
  return { ...makeLocation(), photos: [], ...over };
}

export function makeReview(over: Partial<AdminLocationReview> = {}): AdminLocationReview {
  return {
    id: REVIEW_ID,
    rating: 2,
    noise: 4,
    comment: 'Ồn ào, ổ cắm hỏng',
    author: { id: 'u1', name: 'Trần Bình' },
    createdAt: '2026-09-10T02:00:00.000Z',
    updatedAt: '2026-09-10T02:00:00.000Z',
    hiddenAt: null,
    ...over,
  };
}

export function makeShop(over: Partial<AdminShop> = {}): AdminShop {
  return {
    id: SHOP_ID,
    locationId: '650000000000000000000a02',
    displayName: 'In nhanh Bách Khoa',
    phone: '0912345678',
    priceTable: {
      a4Bw: 500,
      a4Color: 2000,
      a3Bw: 1000,
      a3Color: 5000,
      duplexDiscountPct: 10,
      minOrder: 2000,
    },
    capabilities: { color: true, duplex: true, a3: false, binding: false },
    acceptingOrders: true,
    priceTableVersion: 4,
    location: { name: 'Tiệm in Bách Khoa', address: '1 Đại Cồ Việt', lat: 21.0, lng: 105.8 },
    status: 'APPROVED',
    approvedAt: '2026-09-05T02:00:00.000Z',
    suspendedReason: null,
    owner: { id: 'owner1', name: 'Lê Chủ Tiệm', email: 'chu@tiem.vn' },
    orders30d: 7,
    version: 4,
    createdAt: '2026-09-04T02:00:00.000Z',
    ...over,
  };
}

export function makeShopDetail(over: Partial<AdminShopDetail> = {}): AdminShopDetail {
  return { ...makeShop(), pendingOrders: 3, ...over };
}

export function makeOrder(over: Partial<AdminOrder> = {}): AdminOrder {
  return {
    id: ORDER_ID,
    code: 'PO-7K2M9Q',
    status: 'PENDING',
    shopId: SHOP_ID,
    fileName: 'giao-trinh.pdf',
    pages: 12,
    pageCountError: null,
    settings: {
      paper: 'A4',
      color: true,
      copies: 2,
      duplex: true,
      pageRange: null,
      binding: false,
    },
    quote: {
      printablePages: 12,
      sheets: 6,
      unitPrice: 2000,
      subtotal: 48_000,
      duplexDiscount: 4800,
      total: 43_200,
      priceTableVersion: 4,
      quotedAt: '2026-09-20T02:00:00.000Z',
    },
    payment: { method: 'AT_COUNTER', status: 'UNPAID', confirmedAt: null },
    events: [
      { status: 'DRAFT', at: '2026-09-20T01:58:00.000Z', by: 'cust1', note: null },
      { status: 'PENDING', at: '2026-09-20T02:00:00.000Z', by: 'cust1', note: null },
    ],
    rejectReason: null,
    cancelReason: null,
    pickupBy: null,
    submittedAt: '2026-09-20T02:00:00.000Z',
    readyAt: null,
    pickedUpAt: null,
    version: 2,
    createdAt: '2026-09-20T01:58:00.000Z',
    updatedAt: '2026-09-20T02:00:00.000Z',
    customer: { id: 'cust1', name: 'Nguyễn Sinh Viên' },
    shop: {
      id: SHOP_ID,
      displayName: 'In nhanh Bách Khoa',
      address: '1 Đại Cồ Việt',
      lat: 21.0,
      lng: 105.8,
    },
    adminActions: { canCancel: true },
    ...over,
  };
}

export function signIn(permissions: string[]) {
  useAuthStore.getState().setAuth({
    user: { id: 'me', email: 'a@x.vn', name: 'Vận hành', roles: ['manager'], permissions },
    token: 'test-token',
  });
}

/** Dựng router bộ nhớ quanh một phần tử; trả `router` để đọc URL. */
export function renderAt(ui: ReactElement, url: string) {
  const path = url.split('?')[0];
  const router = createMemoryRouter([{ path, element: ui }], { initialEntries: [url] });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, ...utils };
}

export const urlParam = (router: ReturnType<typeof createMemoryRouter>, key: string) =>
  new URLSearchParams(router.state.location.search).get(key);
