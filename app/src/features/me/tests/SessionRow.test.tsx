import { render, screen } from '@testing-library/react-native';

import type { SessionSummary } from '@/core/api/auth';

import { SessionRow } from '../components/SessionRow';

/**
 * `SessionRow` — IP RÚT GỌN, huy hiệu chữ (không chỉ màu) cho "Thiết bị này", và nút "Thu hồi" có
 * nhãn trợ năng nêu tên thiết bị (p0-01 mục 3, mục 7).
 */

const OTHER: SessionSummary = {
  authMethod: 'PASSWORD',
  createdAt: '2026-09-01T00:00:00.000Z',
  deviceId: 'd2',
  id: 's-other',
  ipAddress: '203.0.113.45',
  isCurrent: false,
  lastUsedAt: '2026-09-02T00:00:00.000Z',
  userAgent: 'okhttp/4.12.0',
};

it('phiên khác: IP hiện RÚT GỌN (không lộ đầy đủ), nút Thu hồi có nhãn trợ năng nêu thiết bị', async () => {
  await render(<SessionRow isRevoking={false} session={OTHER} onRevoke={jest.fn()} />);

  expect(screen.getByText(/203\.0\.\*\.\*/)).toBeOnTheScreen();
  expect(screen.queryByText(/203\.0\.113\.45/)).toBeNull();
  expect(screen.getByLabelText('Thu hồi phiên trên okhttp/4.12.0')).toBeOnTheScreen();
});

it('phiên hiện tại: có nhãn CHỮ "Thiết bị này" và KHÔNG có nút Thu hồi', async () => {
  await render(
    <SessionRow isRevoking={false} session={{ ...OTHER, isCurrent: true }} onRevoke={jest.fn()} />,
  );

  expect(screen.getByText('Thiết bị này')).toBeOnTheScreen();
  expect(screen.queryByLabelText(/Thu hồi phiên trên/)).toBeNull();
});
