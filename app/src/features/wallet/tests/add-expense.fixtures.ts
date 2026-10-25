import type { Metrics } from 'react-native-safe-area-context';

import { apiClient } from '@/core/api/client';

/** Dữ liệu + bộ giả `apiClient` cho test màn Thêm khoản chi (xem `wallet-dashboard.fixtures.ts`). */

export const ok = (data: unknown, status = 200) => ({
  data: { data, message: 'Thành công', success: true, timestamp: 'x' },
  status,
});

export const MEMBERS = [
  { avatarUrl: null, displayName: null, isMe: false, name: 'An', role: 'OWNER', userId: 'an' },
  { avatarUrl: null, displayName: null, isMe: true, name: 'Bình', role: 'MEMBER', userId: 'binh' },
  {
    avatarUrl: null,
    displayName: null,
    isMe: false,
    name: 'Khách',
    role: 'GUEST',
    userId: 'guest',
  },
];

export const CREATED = {
  adjustments: [],
  adjustsExpenseId: null,
  amount: 150000,
  canManage: true,
  category: 'FOOD',
  createdAt: '2026-09-19T05:00:00.000Z',
  createdBy: 'binh',
  description: 'Ăn trưa',
  id: 'new-expense',
  kind: 'EXPENSE',
  myShare: null,
  occurredAt: '2026-09-19T05:00:00.000Z',
  paidBy: 'binh',
  participants: [{ userId: 'an' }, { userId: 'binh' }],
  receiptAssetId: null,
  shares: [],
  splitType: 'EQUAL',
  version: 1,
  workspaceId: 'ws1',
};

export function apiFailure(status: number, code: string) {
  return Object.assign(new Error(code), {
    isAxiosError: true,
    response: { data: { error: { code }, success: false }, status },
  });
}

export function mockReads() {
  jest.mocked(apiClient.get).mockImplementation(async (url: string) => {
    if (url === '/workspaces/ws1')
      return ok({ myRole: 'MEMBER', name: 'Nhóm A', status: 'ACTIVE' });
    if (url === '/workspaces/ws1/wallet') {
      return ok({
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
        walletVersion: 1,
        workspaceId: 'ws1',
      });
    }
    if (url === '/workspaces/ws1/members') {
      return { data: { data: MEMBERS, meta: { hasNext: false }, success: true }, status: 200 };
    }
    throw new Error(`URL chưa mock: ${url}`);
  });
}

export const METRICS: Metrics = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

export const sentHeaders = (call: number) =>
  (jest.mocked(apiClient.post).mock.calls[call]?.[2] as { headers: Record<string, string> })
    .headers;
