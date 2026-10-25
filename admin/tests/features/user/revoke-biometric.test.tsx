/**
 * Thu hồi đăng nhập sinh trắc học từ tab Phiên (p0-13 §2.2 · BIO-19):
 *  - thiếu `user:update` ⇒ không có nút "Thu hồi"
 *  - lý do < 10 ký tự ⇒ lỗi ở field, KHÔNG gọi API
 *  - thành công ⇒ đúng endpoint + body, toast, invalidate credential & nhật ký, danh sách tải lại
 *  - 404 `RES_001` ⇒ thông điệp tiếng Việt, modal KHÔNG đóng
 *
 * Mock ở tầng HTTP (MSW) — lỗi 404 đi qua axios interceptor thật, nên thông
 * điệp tiếng Việt là kết quả của `ERROR_CODE_MESSAGES`, không phải do test dựng.
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/app/store';
import { auditLogKeys } from '@/features/audit-log';
import UserSessionsTab from '@/features/user/components/UserSessionsTab';
import { ERROR_CODE_MESSAGES } from '@/shared/constants/error-codes';
import { useToastStore } from '@/shared/ui/overlays/toast-store';

import {
  createFakeBackend,
  makeCredential,
  renderWithProviders,
  signIn,
  USER_ID,
} from './biometric-test-utils';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  vi.restoreAllMocks();
});
afterAll(() => server.close());

beforeEach(() => {
  useAuthStore.getState().clearAuth();
  useToastStore.setState({ toasts: [] });
});

const bioSection = () => screen.getByRole('region', { name: 'Đăng nhập sinh trắc học' });
const toastTitles = () => useToastStore.getState().toasts.map((t) => t.title);
const REVOKE_TITLE = 'Thu hồi đăng nhập sinh trắc học';

/** Bấm "Thu hồi" ở hàng của `deviceName` rồi trả về hộp thoại vừa mở. */
async function openRevokeModal(user: ReturnType<typeof userEvent.setup>, deviceName: string) {
  const row = within(bioSection()).getByText(deviceName).closest('tr') as HTMLElement;
  await user.click(within(row).getByRole('button', { name: 'Thu hồi' }));
  return screen.findByRole('dialog', { name: REVOKE_TITLE });
}

describe('nút "Thu hồi" theo quyền (BIO-19)', () => {
  it('manager có user:view nhưng KHÔNG có user:update ⇒ thấy danh sách, không thấy nút', async () => {
    signIn('manager', ['user:view']);
    const { handlers } = createFakeBackend({
      credentials: [makeCredential({ deviceName: 'Pixel 8 của An' })],
    });
    server.use(...handlers);
    renderWithProviders(<UserSessionsTab userId={USER_ID} />);

    const section = within(bioSection());
    expect(await section.findByText('Pixel 8 của An')).toBeInTheDocument();
    expect(section.queryByRole('button', { name: 'Thu hồi' })).not.toBeInTheDocument();
  });

  it('có user:update ⇒ nút chỉ ở hàng ACTIVE, hàng đã thu hồi không có', async () => {
    signIn('manager', ['user:view', 'user:update']);
    const { handlers } = createFakeBackend({
      credentials: [
        makeCredential({ id: 'c1', deviceName: 'Máy còn bật' }),
        makeCredential({
          id: 'c2',
          deviceName: 'Máy đã tắt',
          status: 'REVOKED',
          revokedAt: '2026-08-01T06:00:00.000Z',
          revokeReason: 'ADMIN',
        }),
      ],
    });
    server.use(...handlers);
    const user = userEvent.setup();
    renderWithProviders(<UserSessionsTab userId={USER_ID} />);

    const section = within(bioSection());
    await section.findByText('Máy còn bật');
    expect(section.getAllByRole('button', { name: 'Thu hồi' })).toHaveLength(1);

    await user.click(section.getByRole('button', { name: 'Đã thu hồi' }));
    await section.findByText('Máy đã tắt');
    expect(section.queryByRole('button', { name: 'Thu hồi' })).not.toBeInTheDocument();
  });

  it('vai admin (vượt mọi kiểm quyền chi tiết) thấy nút', async () => {
    signIn('admin', []);
    const { handlers } = createFakeBackend({
      credentials: [makeCredential({ deviceName: 'Pixel 8 của An' })],
    });
    server.use(...handlers);
    renderWithProviders(<UserSessionsTab userId={USER_ID} />);

    await within(bioSection()).findByText('Pixel 8 của An');
    expect(within(bioSection()).getByRole('button', { name: 'Thu hồi' })).toBeInTheDocument();
  });
});

describe('hộp thoại thu hồi', () => {
  beforeEach(() => signIn('manager', ['user:view', 'user:update']));

  it('hiện tiêu đề + mô tả tác động đúng với thiết bị được chọn', async () => {
    const { handlers } = createFakeBackend({
      credentials: [makeCredential({ deviceName: 'Pixel 8 của An' })],
    });
    server.use(...handlers);
    const user = userEvent.setup();
    renderWithProviders(<UserSessionsTab userId={USER_ID} />);
    await within(bioSection()).findByText('Pixel 8 của An');

    const dialog = within(await openRevokeModal(user, 'Pixel 8 của An'));
    expect(
      dialog.getByText(
        'Thiết bị Pixel 8 của An sẽ phải đăng nhập lại bằng mật khẩu. Phiên đang mở trên thiết bị đó không bị ngắt — dùng tab Phiên để thu hồi phiên nếu cần.',
      ),
    ).toBeInTheDocument();
    expect(dialog.getByLabelText(/Lý do/i)).toBeInTheDocument();
  });

  it('thiết bị không có tên ⇒ mô tả dùng "Không rõ"', async () => {
    const { handlers } = createFakeBackend({ credentials: [makeCredential({ deviceName: null })] });
    server.use(...handlers);
    const user = userEvent.setup();
    renderWithProviders(<UserSessionsTab userId={USER_ID} />);
    await within(bioSection()).findByText('Không rõ');

    const dialog = within(await openRevokeModal(user, 'Không rõ'));
    expect(dialog.getByText(/^Thiết bị Không rõ sẽ phải đăng nhập lại/)).toBeInTheDocument();
  });

  it('lý do < 10 ký tự ⇒ lỗi ở field, KHÔNG gọi API, modal vẫn mở', async () => {
    const { handlers, state } = createFakeBackend({
      credentials: [makeCredential({ deviceName: 'Pixel 8 của An' })],
    });
    server.use(...handlers);
    const user = userEvent.setup();
    renderWithProviders(<UserSessionsTab userId={USER_ID} />);
    await within(bioSection()).findByText('Pixel 8 của An');

    const dialog = within(await openRevokeModal(user, 'Pixel 8 của An'));
    await user.type(dialog.getByLabelText(/Lý do/i), 'ngan qua');
    await user.click(dialog.getByRole('button', { name: 'Thu hồi' }));

    expect(await dialog.findByText('Lý do tối thiểu 10 ký tự')).toBeInTheDocument();
    expect(state.revokeCalls).toHaveLength(0);
    expect(toastTitles()).not.toContain('Đã thu hồi và ghi nhật ký');
  });

  it('thành công ⇒ đúng endpoint + body đã trim, toast, invalidate, danh sách tải lại', async () => {
    const { handlers, state } = createFakeBackend({
      credentials: [makeCredential({ id: 'cred-1', deviceName: 'Pixel 8 của An' })],
    });
    server.use(...handlers);
    const user = userEvent.setup();
    const { queryClient } = renderWithProviders(<UserSessionsTab userId={USER_ID} />);
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    // Cache nhật ký của đúng người dùng này như `AuditTrailPanel` ghép (có `limit`).
    const auditKey = auditLogKeys.byTarget('User', USER_ID, 20);
    queryClient.setQueryData(auditKey, { pages: [], pageParams: [] });
    await within(bioSection()).findByText('Pixel 8 của An');

    const dialog = within(await openRevokeModal(user, 'Pixel 8 của An'));
    await user.type(dialog.getByLabelText(/Lý do/i), '  Máy bị mất, người dùng báo lại  ');
    await user.click(dialog.getByRole('button', { name: 'Thu hồi' }));

    await waitFor(() => expect(state.revokeCalls).toHaveLength(1));
    expect(
      state.revokeCalls[0].path.endsWith(
        `/admin/users/${USER_ID}/biometric-credentials/cred-1/revoke`,
      ),
    ).toBe(true);
    expect(state.revokeCalls[0].body).toEqual({ reason: 'Máy bị mất, người dùng báo lại' });

    await waitFor(() => expect(toastTitles()).toContain('Đã thu hồi và ghi nhật ký'));
    // Modal tự đóng khi thành công.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    // Invalidate danh sách credential (mọi bộ lọc) và nhật ký audit.
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['user', 'biometric-credentials', USER_ID],
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['audit-log'] });
    // Và hiệu lực thật trên key của panel — `byTarget(..., undefined)` sẽ KHÔNG khớp
    // key có `limit` nên không thể dùng làm key invalidate.
    expect(queryClient.getQueryState(auditKey)?.isInvalidated).toBe(true);

    // Danh sách được tải lại thật: BE giả đã đổi credential sang REVOKED nên
    // bộ lọc "Đang hoạt động" giờ rỗng.
    expect(
      await within(bioSection()).findByText(
        'Người dùng chưa bật đăng nhập sinh trắc học trên thiết bị nào',
      ),
    ).toBeInTheDocument();
    expect(state.listStatuses).toEqual(['ACTIVE', 'ACTIVE']);
  });

  it('404 RES_001 ⇒ thông điệp tiếng Việt, modal KHÔNG đóng, không báo thành công', async () => {
    // FormModal chủ ý `console.error` khi `onConfirm` ném lỗi (để giữ modal mở).
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { handlers, state } = createFakeBackend({
      credentials: [makeCredential({ id: 'cred-1', deviceName: 'Pixel 8 của An' })],
    });
    server.use(...handlers);
    const user = userEvent.setup();
    const { queryClient } = renderWithProviders(<UserSessionsTab userId={USER_ID} />);
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    await within(bioSection()).findByText('Pixel 8 của An');

    const dialog = within(await openRevokeModal(user, 'Pixel 8 của An'));
    // Credential biến mất phía server (vd job dọn dẹp) sau khi danh sách đã tải.
    state.credentials.length = 0;
    await user.type(dialog.getByLabelText(/Lý do/i), 'Máy bị mất, người dùng báo lại');
    await user.click(dialog.getByRole('button', { name: 'Thu hồi' }));

    await waitFor(() => expect(state.revokeCalls).toHaveLength(1));
    await waitFor(() => expect(toastTitles()).toContain(ERROR_CODE_MESSAGES.RES_001));
    // Không phải câu tiếng Anh mặc định của axios / lộ mã kỹ thuật.
    expect(ERROR_CODE_MESSAGES.RES_001).toContain('Không tìm thấy');
    expect(toastTitles().join(' ')).not.toMatch(/RES_001|status code|Request failed/);
    expect(toastTitles()).not.toContain('Đã thu hồi và ghi nhật ký');
    expect(screen.getByRole('dialog', { name: REVOKE_TITLE })).toBeInTheDocument();
    expect(invalidate).not.toHaveBeenCalled();
  });
});
