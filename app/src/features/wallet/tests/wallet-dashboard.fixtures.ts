import { apiClient } from '@/core/api/client';

/**
 * Dữ liệu + bộ giả `apiClient` cho test màn hình ví — phong bì ĐÚNG hình BE. `jest.mock('@/core/api/client')`
 * nằm ở file test (hoist theo từng file), module này chỉ đọc bản đã bị giả.
 */

/** Phong bì THẬT của BE: `{ success, message, data, timestamp }`, danh sách cursor thêm `meta` ở gốc. */
export const ok = (data: unknown) => ({
  data: { data, message: 'Thành công', success: true, timestamp: 'x' },
  status: 200,
});
export const page = (data: unknown[]) => ({
  data: {
    data,
    message: 'Thành công',
    meta: { hasMore: false, limit: 20, nextCursor: null },
    success: true,
  },
  status: 200,
});

export const SETTINGS = {
  currency: 'VND',
  enabled: true,
  lastRemindedAt: null,
  myActions: { canManageSettings: false, canRemind: false },
  reminderCron: '0 9 * * 5',
  reminderEnabled: false,
  reminderMinDebt: 10000,
  reminderTargetId: null,
  reminderTargetType: 'NONE',
  timezone: 'Asia/Ho_Chi_Minh',
  version: 1,
  walletVersion: 3,
  workspaceId: 'ws1',
};

export const SUMMARY = {
  balances: [
    { balance: 37500, userId: 'an' },
    { balance: -37500, userId: 'binh' },
  ],
  currency: 'VND',
  myBalance: -37500,
  suggestions: [{ amount: 37500, fromId: 'binh', toId: 'an' }],
  totals: { expensesThisMonth: 150000, outstanding: 37500 },
  walletVersion: 3,
};

export const MEMBERS = [
  { avatarUrl: null, displayName: null, isMe: false, name: 'An', role: 'OWNER', userId: 'an' },
  { avatarUrl: null, displayName: null, isMe: true, name: 'Bình', role: 'MEMBER', userId: 'binh' },
];

export const EXPENSE = {
  adjustments: [],
  adjustsExpenseId: null,
  amount: 150000,
  canManage: false,
  category: 'FOOD',
  createdAt: '2026-09-10T05:00:00.000Z',
  createdBy: 'an',
  description: 'Ăn trưa nhóm',
  id: 'e1',
  kind: 'EXPENSE',
  myShare: { amount: 37500, paidAmount: 0, status: 'UNPAID' },
  occurredAt: '2026-09-10T05:00:00.000Z',
  paidBy: 'an',
  participants: [{ userId: 'an' }, { userId: 'binh' }],
  receiptAssetId: null,
  splitType: 'EQUAL',
  version: 1,
  workspaceId: 'ws1',
};

export const PENDING_FOR_ME = {
  allocations: [],
  amount: 20000,
  code: 'ABCD2345',
  createdAt: '2026-09-11T03:00:00.000Z',
  fromId: 'binh',
  id: 'st1',
  method: 'CASH',
  status: 'PENDING',
  toId: 'an',
  version: 1,
  workspaceId: 'ws1',
};

export interface World {
  expenses?: unknown[];
  myRole?: string;
  pending?: unknown[];
  settings?: Record<string, unknown>;
  summary?: Record<string, unknown>;
  /** Mọi endpoint ví trả lỗi HTTP này (BE gộp GUEST/không phải thành viên/cờ tắt thành 404). */
  walletHttpError?: number;
}

export function httpError(status: number) {
  return Object.assign(new Error(String(status)), {
    isAxiosError: true,
    response: { data: {}, status },
  });
}

export function mockWorld(world: World = {}) {
  jest.mocked(apiClient.get).mockImplementation(async (url: string) => {
    const isWalletUrl = /\/(wallet|expenses|settlements)/.test(url);
    if (world.walletHttpError && isWalletUrl) throw httpError(world.walletHttpError);
    if (url === '/workspaces/ws1')
      return ok({ myRole: world.myRole ?? 'MEMBER', name: 'Nhóm A', status: 'ACTIVE' });
    if (url === '/workspaces/ws1/wallet') return ok({ ...SETTINGS, ...world.settings });
    if (url === '/workspaces/ws1/wallet/summary') return ok({ ...SUMMARY, ...world.summary });
    if (url === '/workspaces/ws1/members') return page(MEMBERS);
    if (url === '/workspaces/ws1/expenses') return page(world.expenses ?? [EXPENSE]);
    if (url === '/workspaces/ws1/settlements') return page(world.pending ?? []);
    throw new Error(`URL chưa mock: ${url}`);
  });
}
