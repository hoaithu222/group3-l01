/**
 * Cấu hình ghi hình cuộc họp trong `system-config` (p2-06 admin.md §2.5): cờ phụ `meetingRecording` hiện thành nhóm "Cuộc họp" riêng dưới nhóm
 * "Giao tiếp" (khoá theo phân hệ cha `meeting`), và khi phân hệ họp ĐÃ có mã mà cờ phụ `available=false` thì cảnh báo "Storage hiện tại không hỗ
 * trợ ghi hình (cần S3/MinIO + LiveKit Egress)" ở cả tab Tính năng lẫn tab Giới hạn. Nhóm giới hạn `limits.recording`/`limits.meetingRecap` do
 * BE khai nên tab Giới hạn tự có thẻ. Mock ở tầng HTTP (MSW).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import type { ReactElement } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/app/store';
import FeaturesTab from '@/features/system-config/tabs/FeaturesTab';
import LimitsTab from '@/features/system-config/tabs/LimitsTab';

const FEATURES_ITEM = {
  key: 'features',
  tab: 'features',
  label: 'Tính năng',
  fields: [
    { path: 'communication', label: 'Nhắn tin & kênh', kind: 'bool', default: true },
    { path: 'meeting', label: 'Lịch họp/phòng họp', kind: 'bool', default: false },
    { path: 'workspaceSearch', label: 'Tìm kiếm toàn nhóm', kind: 'bool', default: true },
    { path: 'meetingRecording', label: 'Ghi hình cuộc họp', kind: 'bool', default: true },
  ],
  stored: {},
  effective: { communication: true, meeting: true, workspaceSearch: true, meetingRecording: true },
  version: 2,
  updatedAt: null,
  updatedBy: null,
};

const RECORDING_LIMITS = {
  key: 'limits.recording',
  tab: 'limits',
  label: 'Lưu trữ ghi âm/ghi hình',
  fields: [
    {
      path: 'retentionDays',
      label: 'Số ngày lưu trữ',
      kind: 'int',
      default: 90,
      floor: 7,
      ceil: 365,
      unit: 'days',
    },
    {
      path: 'concurrentMax',
      label: 'Số bản ghi hình chạy đồng thời',
      kind: 'int',
      default: 4,
      floor: 0,
      ceil: 16,
      unit: 'count',
    },
    {
      path: 'maxMinutes',
      label: 'Thời lượng tối đa một lần ghi',
      kind: 'int',
      default: 80,
      floor: 5,
      ceil: 80,
      unit: 'min',
    },
  ],
  stored: {},
  effective: { retentionDays: 90, concurrentMax: 4, maxMinutes: 80 },
  version: 0,
  updatedAt: null,
  updatedBy: null,
};

const RECAP_LIMITS = {
  key: 'limits.meetingRecap',
  tab: 'limits',
  label: 'Biên bản họp',
  fields: [
    {
      path: 'attachmentsMax',
      label: 'Tệp đính kèm/biên bản',
      kind: 'int',
      default: 10,
      floor: 0,
      ceil: 20,
      unit: 'count',
    },
  ],
  stored: {},
  effective: { attachmentsMax: 10 },
  version: 0,
  updatedAt: null,
  updatedBy: null,
};

type Flag = { enabled: boolean; available: boolean };
let features: Record<string, Flag> = {};

const NOTICE_TITLE = 'Ghi hình cuộc họp chưa khả dụng';
const STORAGE_TEXT = /Storage hiện tại không hỗ trợ ghi hình \(cần S3\/MinIO \+ LiveKit Egress\)/;

const server = setupServer(
  http.get('*/admin/system-config', () =>
    HttpResponse.json({ success: true, data: [FEATURES_ITEM, RECORDING_LIMITS, RECAP_LIMITS] }),
  ),
  http.get('*/capabilities', () => HttpResponse.json({ success: true, data: { features } })),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => {
  features = {
    communication: { enabled: true, available: true },
    workspaceSearch: { enabled: true, available: true },
    meeting: { enabled: true, available: true },
    meetingRecording: { enabled: true, available: true },
  };
  useAuthStore.getState().clearAuth();
  useAuthStore.getState().setAuth({
    user: {
      id: 'me',
      email: 'a@x.vn',
      name: 'Quản trị',
      roles: ['manager'],
      permissions: ['system-config:view', 'system-config:update'],
    },
    token: 'test-token',
  });
});

function renderTab(ui: ReactElement) {
  const router = createMemoryRouter([{ path: '/', element: ui }]);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

const toggle = (label: string) => screen.getByRole('switch', { name: `Bật/tắt ${label}` });
/** Hàng của một tiện ích trong bảng (để đọc badge trạng thái mã). */
const rowOf = (label: string) => screen.getByText(label).closest('tr')!;

describe('FeaturesTab — cờ phụ ghi hình cuộc họp', () => {
  it('nhóm "Cuộc họp" nằm dưới nhóm "Giao tiếp": mỗi phân hệ cha một bảng, ghi hình KHÔNG lẫn vào nhóm Giao tiếp', async () => {
    renderTab(<FeaturesTab />);

    expect(await screen.findByText('Giao tiếp')).toBeInTheDocument();
    expect(screen.getByText('Cuộc họp')).toBeInTheDocument();
    expect(screen.getAllByText('Tiện ích')).toHaveLength(2); // đầu cột của hai bảng cờ phụ
    expect(within(rowOf('Ghi hình cuộc họp')).getByText('Sẵn sàng')).toBeInTheDocument();
    expect(within(rowOf('Ghi hình cuộc họp')).getByText('Mặc định (bật)')).toBeInTheDocument();
    expect(toggle('Ghi hình cuộc họp')).toBeChecked();
    expect(toggle('Ghi hình cuộc họp')).toBeEnabled();
    // phân hệ họp vẫn ở bảng phân hệ
    expect(screen.getByText('Lịch họp/phòng họp')).toBeInTheDocument();
    expect(screen.queryByText(NOTICE_TITLE)).not.toBeInTheDocument();
  });

  it('phân hệ họp có mã nhưng thiếu hạ tầng (available=false) → cảnh báo Storage/Egress, badge "Thiếu hạ tầng", toggle khoá', async () => {
    features.meetingRecording = { enabled: false, available: false };
    renderTab(<FeaturesTab />);

    expect(await screen.findByText(NOTICE_TITLE)).toBeInTheDocument();
    expect(screen.getByText(STORAGE_TEXT)).toBeInTheDocument();
    expect(within(rowOf('Ghi hình cuộc họp')).getByText('Thiếu hạ tầng')).toBeInTheDocument();
    expect(within(rowOf('Ghi hình cuộc họp')).queryByText('Chưa có mã')).not.toBeInTheDocument();
    expect(toggle('Ghi hình cuộc họp')).toBeDisabled();
  });

  it('phân hệ họp CHƯA có mã → KHÔNG đổ lỗi cho storage: không cảnh báo, badge "Chưa có mã", toggle khoá', async () => {
    features.meeting = { enabled: false, available: false };
    features.meetingRecording = { enabled: false, available: false };
    renderTab(<FeaturesTab />);

    await screen.findByText('Ghi hình cuộc họp');
    expect(screen.queryByText(NOTICE_TITLE)).not.toBeInTheDocument();
    expect(screen.queryByText(STORAGE_TEXT)).not.toBeInTheDocument();
    expect(within(rowOf('Ghi hình cuộc họp')).getByText('Chưa có mã')).toBeInTheDocument();
    expect(toggle('Ghi hình cuộc họp')).toBeDisabled();
  });

  it('phân hệ họp có mã nhưng đang TẮT → toggle ghi hình khoá vì cần bật phân hệ cha (không phải vì hạ tầng)', async () => {
    features.meeting = { enabled: false, available: true };
    features.meetingRecording = { enabled: false, available: true };
    renderTab(<FeaturesTab />);

    await screen.findByText('Ghi hình cuộc họp');
    expect(screen.queryByText(NOTICE_TITLE)).not.toBeInTheDocument();
    expect(toggle('Ghi hình cuộc họp')).toBeDisabled();
  });
});

describe('LimitsTab — nhóm ghi hình', () => {
  it('thẻ "Lưu trữ ghi âm/ghi hình" (ngày lưu, số bản chạy đồng thời, thời lượng tối đa) và "Biên bản họp" tự có từ metadata BE', async () => {
    renderTab(<LimitsTab />);

    expect(await screen.findByText('Lưu trữ ghi âm/ghi hình')).toBeInTheDocument();
    expect(screen.getByText('Biên bản họp')).toBeInTheDocument();
    for (const label of [
      'Số ngày lưu trữ',
      'Số bản ghi hình chạy đồng thời',
      'Thời lượng tối đa một lần ghi',
      'Tệp đính kèm/biên bản',
    ]) {
      // Nhãn ô kèm đơn vị: "Số ngày lưu trữ (ngày)".
      expect(await screen.findByLabelText((text) => text.startsWith(label))).toBeInTheDocument();
    }
    expect(screen.queryByText(NOTICE_TITLE)).not.toBeInTheDocument();
  });

  it('thiếu hạ tầng ghi hình → cảnh báo hiện ngay trên các thẻ giới hạn; thẻ vẫn sửa được', async () => {
    features.meetingRecording = { enabled: false, available: false };
    renderTab(<LimitsTab />);

    expect(await screen.findByText(NOTICE_TITLE)).toBeInTheDocument();
    expect(screen.getByText(STORAGE_TEXT)).toBeInTheDocument();
    expect(await screen.findByText('Lưu trữ ghi âm/ghi hình')).toBeInTheDocument();
  });
});
