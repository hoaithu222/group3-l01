/**
 * Đồ dùng chung cho bài kiểm cấu hình Phase 3 của `system-config` (p3-01 kho tài liệu, p3-02 dự án):
 * fixture khoá registry theo ĐÚNG hình dạng BE (`SystemConfigItem`) và hàm dựng router có data router
 * (`Form` của kit2 gọi `useBlocker`).
 *
 * Tệp `.tsx` không phải `*.test.*` nên vitest không chạy nó như bài kiểm.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';

import { useAuthStore } from '@/app/store';

export const GIB = 1024 ** 3;

export interface PutBody {
  value: Record<string, unknown>;
  expectedVersion: number;
  reason: string;
}

export const DEFAULT_COLUMNS = [
  { title: 'To do', kind: 'TODO' },
  { title: 'In progress', kind: 'IN_PROGRESS' },
  { title: 'Review', kind: 'REVIEW' },
  { title: 'Done', kind: 'DONE' },
];

const base = { stored: {}, updatedAt: null, updatedBy: null };

export const BOARD_LIMITS = {
  ...base,
  key: 'limits.board',
  tab: 'pm',
  label: 'Bảng công việc',
  fields: [
    { path: 'columnsMax', label: 'Số cột tối đa / bảng', kind: 'int', default: 12, floor: 2, ceil: 12, unit: 'count' },
    { path: 'perWorkspaceMax', label: 'Số bảng tối đa / nhóm', kind: 'int', default: 20, floor: 1, ceil: 100, unit: 'count' },
  ],
  effective: { columnsMax: 12, perWorkspaceMax: 20 },
  version: 1,
};

export const TASK_LIMITS = {
  ...base,
  key: 'limits.task',
  tab: 'pm',
  label: 'Thẻ công việc',
  fields: [
    { path: 'perBoardMax', label: 'Số thẻ tối đa / bảng', kind: 'int', default: 5000, floor: 100, ceil: 5000, unit: 'count' },
  ],
  effective: { perBoardMax: 5000 },
  version: 1,
};

export const PM_ITEM = {
  ...base,
  key: 'pm',
  tab: 'pm',
  label: 'Dự án',
  fields: [
    { path: 'defaultColumns', label: 'Cột mặc định khi tạo bảng', kind: 'json', default: DEFAULT_COLUMNS },
  ],
  effective: { defaultColumns: DEFAULT_COLUMNS },
  version: 4,
};

export const RESOURCE_LIMITS = {
  ...base,
  key: 'limits.resource',
  tab: 'storage',
  label: 'Kho tài liệu',
  fields: [
    {
      path: 'workspaceQuotaBytes',
      label: 'Hạn mức mặc định / nhóm',
      kind: 'bytes',
      default: 2 * GIB,
      floor: GIB / 2,
      ceil: 100 * GIB,
      unit: 'bytes',
    },
    {
      path: 'trashRetentionDays',
      label: 'Số ngày giữ thùng rác',
      kind: 'int',
      default: 30,
      floor: 7,
      ceil: 90,
      unit: 'days',
    },
  ],
  effective: { workspaceQuotaBytes: 2 * GIB, trashRetentionDays: 30 },
  version: 2,
};

export const OVERRIDE_WS_A = '64a1b2c3d4e5f60718293a01';
export const OVERRIDE_WS_B = '64a1b2c3d4e5f60718293a02';

export const RESOURCE_ITEM = {
  ...base,
  key: 'resource',
  tab: 'storage',
  label: 'Kho tài liệu — hạn mức riêng',
  fields: [{ path: 'quotaOverrides', label: 'Hạn mức riêng theo nhóm', kind: 'json', default: [] }],
  stored: {
    quotaOverrides: [
      { workspaceId: OVERRIDE_WS_A, bytes: 5 * GIB },
      { workspaceId: OVERRIDE_WS_B, bytes: 0.5 * GIB },
    ],
  },
  effective: {
    quotaOverrides: [
      { workspaceId: OVERRIDE_WS_A, bytes: 5 * GIB },
      { workspaceId: OVERRIDE_WS_B, bytes: 0.5 * GIB },
    ],
  },
  version: 7,
};

/** Đăng nhập với vai KHÔNG phải `admin` (admin vượt mọi kiểm quyền chi tiết nên che lỗi phân quyền). */
export function signIn(permissions: string[]) {
  useAuthStore.getState().clearAuth();
  useAuthStore.getState().setAuth({
    user: { id: 'me', email: 'a@x.vn', name: 'Admin', roles: ['manager'], permissions },
    token: 'test-token',
  });
}

/** `Form` của kit2 gọi `useBlocker` ⇒ cần data router, không chạy được dưới `MemoryRouter`. */
export function renderWithDataRouter(ui: ReactElement, url = '/') {
  const router = createMemoryRouter([{ path: '*', element: ui }], { initialEntries: [url] });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}
