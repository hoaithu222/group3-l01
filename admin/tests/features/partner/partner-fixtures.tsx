/**
 * Đồ dùng chung cho bài kiểm phân hệ `partner` (p6-05 admin.md §4): fixture theo ĐÚNG hợp đồng BE (`partnerOrderView`, `myShops`) và hàm
 * dựng router + React Query. Không phải `*.test.*`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { HttpResponse } from 'msw';
import type { ReactElement } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';

import { useAuthStore } from '@/app/store';
import type {
  PartnerOrder,
  PartnerOrderActions,
  PartnerShop,
} from '@/features/partner/types/partner.types';

export const okBody = (data: unknown, meta?: Record<string, unknown>) =>
  HttpResponse.json({ success: true, data, ...(meta && { meta }) });

export const cursorMeta = (hasMore = false, nextCursor: string | null = null) => ({
  nextCursor,
  hasMore,
  limit: 100,
});

/** Lỗi BE dạng `{ success:false, error:{ code, message, details } }` với HTTP `status`. */
export const errorBody = (
  status: number,
  code: string,
  message: string,
  details?: unknown,
  headers?: Record<string, string>,
) =>
  HttpResponse.json(
    { success: false, error: { code, message, ...(details !== undefined && { details }) } },
    { status, headers },
  );

export const SHOP_ID = '650000000000000000000b01';
export const ORDER_ID = '650000000000000000000c01';

const NO_ACTIONS: PartnerOrderActions = {
  canAccept: false,
  canReject: false,
  canStartPrinting: false,
  canMarkReady: false,
  canPickup: false,
  canMarkPaid: false,
  canDownload: false,
};

/** Quyền hành động đúng theo trạng thái (đồng bộ `print-order.state-machine.ts` của BE). */
const ACTIONS_BY_STATUS: Record<string, Partial<PartnerOrderActions>> = {
  PENDING: { canAccept: true, canReject: true },
  ACCEPTED: { canStartPrinting: true, canDownload: true },
  PRINTING: { canMarkReady: true, canDownload: true },
  READY: { canPickup: true, canMarkPaid: true },
};

export function makeOrder(over: Partial<PartnerOrder> = {}): PartnerOrder {
  const status = over.status ?? 'PENDING';
  return {
    id: ORDER_ID,
    code: 'PO-7K2M9Q',
    status,
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
    events: [{ status: 'PENDING', at: '2026-09-20T02:00:00.000Z', note: null }],
    rejectReason: null,
    cancelReason: null,
    pickupBy: null,
    submittedAt: '2026-09-20T02:00:00.000Z',
    readyAt: null,
    pickedUpAt: null,
    version: 2,
    createdAt: '2026-09-20T01:58:00.000Z',
    updatedAt: '2026-09-20T02:00:00.000Z',
    customer: { name: 'Nguyễn Sinh Viên' },
    partnerActions: { ...NO_ACTIONS, ...ACTIONS_BY_STATUS[status] },
    ...over,
  };
}

export function makeShop(over: Partial<PartnerShop> = {}): PartnerShop {
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
    location: {
      name: 'Tiệm in Bách Khoa',
      address: '1 Đại Cồ Việt, Hà Nội',
      lat: 21.0,
      lng: 105.8,
    },
    status: 'APPROVED',
    suspendedReason: null,
    approvedAt: '2026-09-05T02:00:00.000Z',
    ...over,
  };
}

/** Chủ tiệm: quyền theo dữ liệu `partner:view` + `partner:update` (vai hệ thống thường, KHÔNG phải admin). */
export function signIn(permissions: string[] = ['partner:view', 'partner:update']) {
  useAuthStore.getState().setAuth({
    user: { id: 'owner1', email: 'chu@tiem.vn', name: 'Chủ Tiệm', roles: ['user'], permissions },
    token: 'test-token',
  });
}

/** Dựng router bộ nhớ quanh một phần tử ở `path` (mặc định `/partner`, để liên kết tương đối `orders/:id` phân giải đúng). */
export function renderAt(ui: ReactElement, url = '/partner') {
  const path = url.split('?')[0];
  const router = createMemoryRouter([{ path, element: ui }], { initialEntries: [url] });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, queryClient, ...utils };
}
