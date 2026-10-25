/**
 * Không lộ bí mật ra DOM (p0-13 §4 · README §5 "⛔ không hiển thị secretHash /
 * deviceId đầy đủ").
 *
 * BE thật KHÔNG trả `secretHash` và chỉ trả `deviceIdMasked` cho credential. Bài
 * kiểm này giả một BE LỠ TAY trả thừa (`secret`, `secretHash`, `deviceId` đầy đủ,
 * cả `refreshTokenHash` của phiên) để chứng minh lớp giao diện tự chốt chặn: các
 * trường đó không được khai trong kiểu, nên không có đường nào lên DOM — ở mọi
 * trạng thái (đang hoạt động, đã thu hồi, đang mở hộp thoại thu hồi).
 */
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/app/store';
import UserSessionsTab from '@/features/user/components/UserSessionsTab';

import {
  createFakeBackend,
  makeCredential,
  makeSession,
  renderWithProviders,
  signIn,
  USER_ID,
} from './biometric-test-utils';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  useAuthStore.getState().clearAuth();
  signIn('admin', ['user:view', 'user:update']);
});

const LEAKS = {
  secret: 'RAW-SECRET-VALUE-do-not-render',
  secretHash: 'SECRETHASH-9f8e7d6c5b4a-do-not-render',
  deviceId: 'android-device-FULL-ID-0123456789',
  sessionDeviceId: 'session-device-FULL-ID-9876543210',
  refreshTokenHash: 'REFRESHHASH-do-not-render',
};

function fakeBackendWithLeaks() {
  return createFakeBackend({
    credentials: [
      makeCredential({
        id: 'active-1',
        deviceName: 'Máy đang bật',
        secret: LEAKS.secret,
        secretHash: LEAKS.secretHash,
        deviceId: LEAKS.deviceId,
      }),
      makeCredential({
        id: 'revoked-1',
        deviceName: 'Máy đã thu hồi',
        status: 'REVOKED',
        revokedAt: '2026-08-01T06:00:00.000Z',
        revokeReason: 'ADMIN',
        secret: LEAKS.secret,
        secretHash: LEAKS.secretHash,
        deviceId: LEAKS.deviceId,
      }),
    ],
    sessions: [
      makeSession({
        userAgent: 'UA có deviceId',
        authMethod: 'BIOMETRIC',
        deviceId: LEAKS.sessionDeviceId,
        refreshTokenHash: LEAKS.refreshTokenHash,
      }),
    ],
  });
}

/** Toàn bộ DOM (cả thuộc tính lẫn portal của hộp thoại) — không chỉ văn bản hiển thị. */
const dom = () => document.body.innerHTML;

function expectNoLeak() {
  expect(dom()).not.toMatch(/secret/i);
  for (const value of Object.values(LEAKS)) {
    expect(dom()).not.toContain(value);
  }
}

describe('không lộ secret / secretHash / deviceId đầy đủ ra DOM', () => {
  it('mục sinh trắc học "Đang hoạt động" + bảng phiên', async () => {
    const { handlers, state } = fakeBackendWithLeaks();
    server.use(...handlers);
    renderWithProviders(<UserSessionsTab userId={USER_ID} />);

    const section = within(await screen.findByRole('region', { name: 'Đăng nhập sinh trắc học' }));
    await section.findByText('Máy đang bật');
    await screen.findByText('UA có deviceId');

    // Không vô nghĩa: fixture THẬT SỰ mang các trường nhạy cảm và BE giả đã trả chúng.
    expect(state.credentials[0]).toMatchObject({ secretHash: LEAKS.secretHash });
    expect(state.listStatuses).toEqual(['ACTIVE']);
    // Chỉ dạng rút gọn được hiện.
    expect(section.getByText('••••a1b2c3')).toBeInTheDocument();
    expectNoLeak();
  });

  it('bộ lọc "Đã thu hồi"', async () => {
    const { handlers } = fakeBackendWithLeaks();
    server.use(...handlers);
    const user = userEvent.setup();
    renderWithProviders(<UserSessionsTab userId={USER_ID} />);

    const section = within(await screen.findByRole('region', { name: 'Đăng nhập sinh trắc học' }));
    await section.findByText('Máy đang bật');
    await user.click(section.getByRole('button', { name: 'Đã thu hồi' }));
    await section.findByText('Máy đã thu hồi');

    expectNoLeak();
  });

  it('khi đang mở hộp thoại thu hồi (portal)', async () => {
    const { handlers } = fakeBackendWithLeaks();
    server.use(...handlers);
    const user = userEvent.setup();
    renderWithProviders(<UserSessionsTab userId={USER_ID} />);

    const section = within(await screen.findByRole('region', { name: 'Đăng nhập sinh trắc học' }));
    const row = (await section.findByText('Máy đang bật')).closest('tr') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: 'Thu hồi' }));
    await screen.findByRole('dialog', { name: 'Thu hồi đăng nhập sinh trắc học' });

    expectNoLeak();
  });
});
