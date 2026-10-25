/**
 * Tab "Phiên" (p0-13 §2.1) — cột "Cách đăng nhập" của bảng phiên và mục "Đăng
 * nhập sinh trắc học" bên dưới: có dữ liệu / rỗng / lọc "Đã thu hồi" đổi query
 * + URL.
 *
 * Mock ở tầng HTTP (MSW, "BE giả" trong `biometric-test-utils.tsx`) — đi đúng
 * đường thật: axios interceptor → React Query → `useQueryParams`.
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/app/store';
import UserSessionsTab from '@/features/user/components/UserSessionsTab';
import UserListPage from '@/features/user/pages/UserListPage';
import { formatDate } from '@/shared/utils/format';

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

const bioSection = () => screen.getByRole('region', { name: 'Đăng nhập sinh trắc học' });
const rowOf = (text: string) => screen.getByText(text).closest('tr') as HTMLElement;
const location = () => screen.getByTestId('location').textContent;

/**
 * Tiêu đề cột theo tên. `Table` kit2 gắn tay cầm kéo giãn (`aria-label="Kéo giãn cột"`)
 * vào TRONG `<th>` nên tên truy cập là "<tên cột> Kéo giãn cột" — khớp theo tiền tố.
 */
const header = (name: string) => new RegExp(`^${name}`);

/** Chữ trong ô của cột `header` ở dòng `tr` — tra theo tên cột, không theo vị trí. */
function cellText(tr: HTMLElement, header: string) {
  const headers = within(tr.closest('table') as HTMLElement).getAllByRole('columnheader');
  const index = headers.findIndex((h) => h.textContent?.trim() === header);
  return tr.querySelectorAll('td')[index]?.textContent;
}

describe('bảng phiên — cột "Cách đăng nhập"', () => {
  it('hiện "Mật khẩu" / "Sinh trắc học", còn thiếu hoặc giá trị lạ thì "—"', async () => {
    const { handlers } = createFakeBackend({
      sessions: [
        makeSession({ id: 's1', userAgent: 'UA mật khẩu', authMethod: 'PASSWORD' }),
        makeSession({ id: 's2', userAgent: 'UA sinh trắc', authMethod: 'BIOMETRIC' }),
        makeSession({ id: 's3', userAgent: 'UA thiếu', authMethod: undefined }),
        makeSession({ id: 's4', userAgent: 'UA lạ', authMethod: 'PASSKEY', ipAddress: null }),
        makeSession({ id: 's5', userAgent: 'UA nguyên mẫu', authMethod: 'constructor' }),
      ],
    });
    server.use(...handlers);
    renderWithProviders(<UserSessionsTab userId={USER_ID} />);

    // Chờ dữ liệu về (tiêu đề cột có ngay từ lúc đang tải, dòng thì chưa).
    await screen.findByText('UA mật khẩu');
    expect(
      screen.getByRole('columnheader', { name: header('Cách đăng nhập') }),
    ).toBeInTheDocument();
    const method = (ua: string) => cellText(rowOf(ua), 'Cách đăng nhập');
    expect(method('UA mật khẩu')).toBe('Mật khẩu');
    expect(method('UA sinh trắc')).toBe('Sinh trắc học');
    expect(method('UA thiếu')).toBe('—');
    // 'PASSKEY' (chưa biết) và 'constructor' (khoá của prototype) đều phải ra "—",
    // không lộ mã kỹ thuật và không vỡ vì tra bảng bằng `map[key]`.
    expect(method('UA lạ')).toBe('—');
    expect(method('UA nguyên mẫu')).toBe('—');
  });

  // BE nay LUÔN trả `expiresAt` (xem describe bên dưới); đây là đường phòng thủ cho BE cũ / dữ liệu thiếu.
  it('phiên thiếu `expiresAt` (BE cũ / dữ liệu thiếu) ⇒ cột "Hết hạn" hiện "—", không phải ngày hôm nay', async () => {
    const { handlers } = createFakeBackend({
      sessions: [makeSession({ userAgent: 'UA không hạn' })],
    });
    server.use(...handlers);
    renderWithProviders(<UserSessionsTab userId={USER_ID} />);

    await screen.findByText('UA không hạn');
    expect(cellText(rowOf('UA không hạn'), 'Hết hạn')).toBe('—');
  });
});

describe('bảng phiên — hợp đồng BE mới (`deviceIdMasked`, `expiresAt`, `isCurrent`)', () => {
  it('hiện hạn phiên và mã thiết bị ĐÃ CHE dưới tên thiết bị', async () => {
    const { handlers } = createFakeBackend({
      sessions: [
        makeSession({
          userAgent: 'UA có mã thiết bị',
          deviceIdMasked: '••••a1b2c3',
          expiresAt: '2026-10-01T06:00:00.000Z',
        }),
      ],
    });
    server.use(...handlers);
    renderWithProviders(<UserSessionsTab userId={USER_ID} />);

    await screen.findByText('UA có mã thiết bị');
    const row = rowOf('UA có mã thiết bị');
    expect(within(row).getByText('Mã thiết bị ••••a1b2c3')).toBeInTheDocument();
    expect(cellText(row, 'Hết hạn')).toBe(formatDate('2026-10-01T06:00:00.000Z', 'HH:mm DD/MM/YYYY'));
  });

  it('phiên cũ chưa ghi mã thiết bị ⇒ không có dòng "Mã thiết bị"', async () => {
    const { handlers } = createFakeBackend({
      sessions: [makeSession({ userAgent: 'UA không mã', deviceIdMasked: null })],
    });
    server.use(...handlers);
    renderWithProviders(<UserSessionsTab userId={USER_ID} />);

    await screen.findByText('UA không mã');
    expect(within(rowOf('UA không mã')).queryByText(/Mã thiết bị/)).not.toBeInTheDocument();
  });

  it('xem phiên của CHÍNH MÌNH: BE trả deviceId đầy đủ ⇒ giao diện che lại, không lộ nguyên văn', async () => {
    const { handlers } = createFakeBackend({
      sessions: [makeSession({ userAgent: 'UA của tôi', deviceId: 'device-FULL-ID-0123456789' })],
    });
    server.use(...handlers);
    renderWithProviders(<UserSessionsTab userId={USER_ID} />);

    await screen.findByText('UA của tôi');
    expect(within(rowOf('UA của tôi')).getByText('Mã thiết bị ••••456789')).toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain('device-FULL-ID-0123456789');
  });

  it('phiên đang dùng (`isCurrent`) không có nút "Thu hồi" — BE từ chối 400 — mà ghi rõ là phiên hiện tại', async () => {
    const { handlers } = createFakeBackend({
      sessions: [
        makeSession({ id: 's-now', userAgent: 'UA hiện tại', isCurrent: true }),
        makeSession({ id: 's-other', userAgent: 'UA khác', isCurrent: false }),
      ],
    });
    server.use(...handlers);
    renderWithProviders(<UserSessionsTab userId={USER_ID} />);

    await screen.findByText('UA hiện tại');
    const current = within(rowOf('UA hiện tại'));
    expect(current.queryByRole('button', { name: 'Thu hồi' })).not.toBeInTheDocument();
    expect(current.getByText('Phiên hiện tại')).toBeInTheDocument();
    expect(within(rowOf('UA khác')).getByRole('button', { name: 'Thu hồi' })).toBeInTheDocument();
  });

  it('lỗi tải danh sách phiên ⇒ báo lỗi + "Thử lại" (không để bảng trống như thể chưa đăng nhập bao giờ)', async () => {
    const { handlers } = createFakeBackend({
      sessions: [makeSession({ userAgent: 'UA sau khi thử lại' })],
    });
    server.use(...handlers);
    server.use(
      http.get('*/users/:id/sessions', () =>
        HttpResponse.json(
          { success: false, error: { code: 'SYS_500', message: 'Lỗi máy chủ' } },
          { status: 500 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<UserSessionsTab userId={USER_ID} />);

    expect(await screen.findByText('Không tải được danh sách phiên đăng nhập')).toBeInTheDocument();
    expect(screen.queryByText('Không có phiên nào')).not.toBeInTheDocument();

    server.resetHandlers();
    server.use(...handlers);
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('UA sau khi thử lại')).toBeInTheDocument();
  });
});

describe('mục "Đăng nhập sinh trắc học"', () => {
  it('có dữ liệu: hiện thiết bị, nền tảng, loại, các mốc thời gian — che deviceId', async () => {
    const { handlers, state } = createFakeBackend({
      credentials: [
        makeCredential({ id: 'c1', deviceName: 'Pixel 8 của An' }),
        makeCredential({
          id: 'c2',
          deviceName: null,
          deviceIdMasked: '••••ffee00',
          platform: 'IOS',
          biometryKind: 'FACE',
          lastUsedAt: null,
        }),
        makeCredential({
          id: 'c3',
          deviceName: 'Galaxy Tab',
          deviceIdMasked: '••••112233',
          biometryKind: 'FACE',
        }),
        makeCredential({ id: 'c4', deviceName: 'Máy cũ', biometryKind: 'IRIS' }),
      ],
    });
    server.use(...handlers);
    renderWithProviders(<UserSessionsTab userId={USER_ID} />);

    const section = within(bioSection());
    expect(await section.findByText('Pixel 8 của An')).toBeInTheDocument();
    for (const name of [
      'Thiết bị',
      'Nền tảng',
      'Loại',
      'Bật lúc',
      'Dùng gần nhất',
      'Hết hạn',
      'Hành động',
    ]) {
      expect(section.getByRole('columnheader', { name: header(name) })).toBeInTheDocument();
    }

    const pixel = within(section.getByText('Pixel 8 của An').closest('tr') as HTMLElement);
    expect(pixel.getByText('Android')).toBeInTheDocument();
    expect(pixel.getByText('Vân tay')).toBeInTheDocument();
    expect(pixel.getByText('••••a1b2c3')).toBeInTheDocument();
    expect(pixel.getByText('3 giờ trước')).toBeInTheDocument();
    expect(pixel.getByText(formatDate('2026-05-12T06:00:00.000Z'))).toBeInTheDocument();
    expect(pixel.getByText(formatDate('2026-08-10T06:00:00.000Z'))).toBeInTheDocument();

    // `deviceName` null ⇒ "Không rõ"; FACE trên iOS là Face ID; chưa từng dùng.
    const unnamed = within(section.getByText('Không rõ').closest('tr') as HTMLElement);
    expect(unnamed.getByText('iOS')).toBeInTheDocument();
    expect(unnamed.getByText('Face ID')).toBeInTheDocument();
    expect(unnamed.getByText('Chưa dùng')).toBeInTheDocument();

    // FACE trên Android không có thương hiệu riêng; IRIS đọc là "Mống mắt".
    expect(
      within(section.getByText('Galaxy Tab').closest('tr') as HTMLElement).getByText('Khuôn mặt'),
    ).toBeInTheDocument();
    expect(
      within(section.getByText('Máy cũ').closest('tr') as HTMLElement).getByText('Mống mắt'),
    ).toBeInTheDocument();

    // Mặc định gọi BE với ?status=ACTIVE, URL không có `bioStatus`.
    expect(state.listStatuses).toEqual(['ACTIVE']);
    expect(location()).not.toContain('bioStatus');
  });

  it('rỗng: hiện EmptyState, không hiện bảng', async () => {
    const { handlers } = createFakeBackend({ credentials: [] });
    server.use(...handlers);
    renderWithProviders(<UserSessionsTab userId={USER_ID} />);

    const section = within(bioSection());
    expect(
      await section.findByText('Người dùng chưa bật đăng nhập sinh trắc học trên thiết bị nào'),
    ).toBeInTheDocument();
    expect(
      section.queryByRole('columnheader', { name: header('Thiết bị') }),
    ).not.toBeInTheDocument();
  });

  it('vẫn hiện khi người dùng không còn phiên nào', async () => {
    const { handlers } = createFakeBackend({
      sessions: [],
      credentials: [makeCredential({ deviceName: 'Máy còn bật' })],
    });
    server.use(...handlers);
    renderWithProviders(<UserSessionsTab userId={USER_ID} />);

    expect(await screen.findByText('Không có phiên nào')).toBeInTheDocument();
    expect(await within(bioSection()).findByText('Máy còn bật')).toBeInTheDocument();
  });

  it('lỗi tải ⇒ báo lỗi, KHÔNG nói "người dùng chưa bật" (sai sự thật)', async () => {
    const { handlers } = createFakeBackend({});
    // MSW dùng handler khớp ĐẦU TIÊN — override phải đứng trước handler mặc định.
    server.use(
      http.get('*/admin/users/:id/biometric-credentials', () =>
        HttpResponse.json(
          { success: false, error: { code: 'SYS_500', message: 'Lỗi hệ thống' } },
          { status: 500 },
        ),
      ),
      ...handlers,
    );
    renderWithProviders(<UserSessionsTab userId={USER_ID} />);

    const section = within(bioSection());
    expect(
      await section.findByText('Không tải được danh sách đăng nhập sinh trắc học'),
    ).toBeInTheDocument();
    expect(
      section.queryByText('Người dùng chưa bật đăng nhập sinh trắc học trên thiết bị nào'),
    ).not.toBeInTheDocument();
  });
});

describe('bộ lọc trạng thái — đồng bộ URL `?bioStatus=`', () => {
  const revokedFixture = () => [
    makeCredential({ id: 'a1', deviceName: 'Máy đang bật' }),
    makeCredential({
      id: 'r1',
      deviceName: 'Máy R1',
      status: 'REVOKED',
      revokedAt: '2026-08-01T06:00:00.000Z',
      revokeReason: 'REPLACED',
    }),
    makeCredential({
      id: 'r2',
      deviceName: 'Máy R2',
      status: 'REVOKED',
      revokedAt: '2026-08-02T06:00:00.000Z',
      revokeReason: 'PASSWORD_CHANGED',
    }),
    makeCredential({
      id: 'r3',
      deviceName: 'Máy R3',
      status: 'REVOKED',
      revokedAt: '2026-08-03T06:00:00.000Z',
      revokeReason: 'ADMIN',
    }),
    makeCredential({
      id: 'r4',
      deviceName: 'Máy R4',
      status: 'REVOKED',
      revokedAt: '2026-08-04T06:00:00.000Z',
      revokeReason: 'TOO_MANY_ATTEMPTS',
    }),
    makeCredential({
      id: 'r5',
      deviceName: 'Máy R5',
      status: 'REVOKED',
      revokedAt: '2026-08-05T06:00:00.000Z',
      revokeReason: 'MOT_LY_DO_MOI_CUA_BE',
    }),
  ];

  it('chọn "Đã thu hồi" ⇒ gọi ?status=REVOKED, URL có bioStatus, hàng hiện lý do đọc được', async () => {
    const user = userEvent.setup();
    const { handlers, state } = createFakeBackend({ credentials: revokedFixture() });
    server.use(...handlers);
    renderWithProviders(<UserSessionsTab userId={USER_ID} />);

    const section = within(bioSection());
    await section.findByText('Máy đang bật');
    expect(section.getByRole('button', { name: 'Đang hoạt động' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(section.getByRole('button', { name: 'Đã thu hồi' }));

    await section.findByText('Máy R1');
    expect(state.listStatuses).toEqual(['ACTIVE', 'REVOKED']);
    expect(location()).toBe(`/user?id=${USER_ID}&bioStatus=REVOKED`);
    expect(section.queryByText('Máy đang bật')).not.toBeInTheDocument();
    expect(section.getByRole('button', { name: 'Đã thu hồi' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    const reasonOf = (device: string) =>
      within(section.getByText(device).closest('tr') as HTMLElement);
    expect(reasonOf('Máy R1').getByText('Bật lại trên cùng máy')).toBeInTheDocument();
    expect(reasonOf('Máy R2').getByText('Đổi mật khẩu')).toBeInTheDocument();
    expect(reasonOf('Máy R3').getByText('Quản trị viên thu hồi')).toBeInTheDocument();
    expect(reasonOf('Máy R4').getByText('Sai quá số lần')).toBeInTheDocument();
    // Lý do BE thêm sau này: đọc được, không lộ mã kỹ thuật.
    expect(reasonOf('Máy R5').getByText('Lý do khác')).toBeInTheDocument();
    expect(section.queryByText('MOT_LY_DO_MOI_CUA_BE')).not.toBeInTheDocument();
    // Hàng đã thu hồi: nhãn trạng thái, không còn nút "Thu hồi".
    expect(reasonOf('Máy R1').getByText('Đã thu hồi')).toBeInTheDocument();
    expect(section.queryByRole('button', { name: 'Thu hồi' })).not.toBeInTheDocument();

    // Quay lại "Đang hoạt động" ⇒ bỏ khoá khỏi URL (URL sạch), giữ các param khác.
    await user.click(section.getByRole('button', { name: 'Đang hoạt động' }));
    await section.findByText('Máy đang bật');
    expect(location()).toBe(`/user?id=${USER_ID}`);
  });

  it('đổi bộ lọc KHÔNG reset `?page=` của bảng người dùng nằm sau drawer', async () => {
    const user = userEvent.setup();
    const { handlers } = createFakeBackend({ credentials: revokedFixture() });
    server.use(...handlers);
    renderWithProviders(<UserSessionsTab userId={USER_ID} />, `/user?id=${USER_ID}&page=3`);

    const section = within(bioSection());
    await section.findByText('Máy đang bật');
    await user.click(section.getByRole('button', { name: 'Đã thu hồi' }));

    await section.findByText('Máy R1');
    expect(location()).toBe(`/user?id=${USER_ID}&page=3&bioStatus=REVOKED`);
  });

  it('mở thẳng từ URL `?bioStatus=REVOKED` ⇒ lọc đúng ngay lần tải đầu', async () => {
    const { handlers, state } = createFakeBackend({ credentials: revokedFixture() });
    server.use(...handlers);
    renderWithProviders(
      <UserSessionsTab userId={USER_ID} />,
      `/user?id=${USER_ID}&bioStatus=REVOKED`,
    );

    const section = within(bioSection());
    expect(await section.findByText('Máy R1')).toBeInTheDocument();
    expect(state.listStatuses).toEqual(['REVOKED']);
  });

  it('giá trị `bioStatus` lạ trên URL bị ép về "Đang hoạt động", không đẩy nguyên lên BE', async () => {
    const { handlers, state } = createFakeBackend({ credentials: revokedFixture() });
    server.use(...handlers);
    renderWithProviders(
      <UserSessionsTab userId={USER_ID} />,
      `/user?id=${USER_ID}&bioStatus=ALL%26x%3D1`,
    );

    await within(bioSection()).findByText('Máy đang bật');
    expect(state.listStatuses).toEqual(['ACTIVE']);
  });

  it('lọc "Đã thu hồi" mà rỗng ⇒ EmptyState riêng, không nói "chưa bật"', async () => {
    const { handlers } = createFakeBackend({ credentials: [makeCredential()] });
    server.use(...handlers);
    renderWithProviders(
      <UserSessionsTab userId={USER_ID} />,
      `/user?id=${USER_ID}&bioStatus=REVOKED`,
    );

    const section = within(bioSection());
    expect(
      await section.findByText('Chưa có đăng nhập sinh trắc học nào bị thu hồi'),
    ).toBeInTheDocument();
  });
});

describe('trong drawer người dùng (UserListPage)', () => {
  it('tab "Phiên" có mục sinh trắc học; đóng drawer thì bỏ `bioStatus` khỏi URL', async () => {
    const user = userEvent.setup();
    const { handlers } = createFakeBackend({
      credentials: [makeCredential({ deviceName: 'Máy trong drawer' })],
      sessions: [makeSession()],
    });
    const listedUser = {
      id: USER_ID,
      email: 'nguyen.van.an@congty.vn',
      name: 'Nguyễn Văn An',
      role: 'user',
      status: 'ACTIVE',
      emailVerified: true,
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    server.use(
      ...handlers,
      http.get('*/users', () =>
        HttpResponse.json({
          success: true,
          data: [listedUser],
          meta: { page: 3, limit: 20, total: 1, totalPages: 1, hasNext: false, hasPrev: false },
        }),
      ),
      http.get('*/users/:id', () => HttpResponse.json({ success: true, data: listedUser })),
    );
    renderWithProviders(<UserListPage />, `/user?id=${USER_ID}&page=3&bioStatus=REVOKED`);

    await user.click(await screen.findByRole('tab', { name: 'Phiên' }));
    expect(
      await screen.findByRole('region', { name: 'Đăng nhập sinh trắc học' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('columnheader', { name: header('Cách đăng nhập') }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Đóng' }));
    await waitFor(() => expect(location()).toBe('/user?page=3'));
  });
});
