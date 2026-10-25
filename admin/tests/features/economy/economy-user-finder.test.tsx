/**
 * Chọn người dùng để mở ví (p7-02 admin.md §2.2): BE chỉ có endpoint theo `userId`, nên nhóm "Ví người dùng" cho tìm theo tên/email (cần `user:view`) hoặc DÁN ID.
 * Dán ID dùng được cả khi không có `user:view`; không có quyền thì KHÔNG gọi danh sách người dùng; `?userId=` sai dạng → về bước chọn. MSW.
 */
import { configure, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/app/store';
import WalletLookup from '@/features/economy/components/WalletLookup';

import { cursorMeta, makeTx, makeWallet, okBody, pageMeta, renderAt, signIn, urlParam, USER_ID } from './economy-fixtures';

let userQueries: string[] = [];

const server = setupServer(
  http.get('*/users/:id', ({ params }) =>
    okBody({ id: params.id, email: 'lan@congty.vn', name: 'Nguyễn Thị Lan', role: 'user', status: 'ACTIVE', createdAt: '2026-01-01T00:00:00.000Z' }),
  ),
  http.get('*/users', ({ request }) => {
    userQueries.push(new URL(request.url).searchParams.get('q') ?? '');
    return okBody(
      [{ id: USER_ID, email: 'lan@congty.vn', name: 'Nguyễn Thị Lan', role: 'user', status: 'ACTIVE', createdAt: '2026-01-01T00:00:00.000Z' }],
      pageMeta(1),
    );
  }),
  http.get('*/admin/economy/users/:userId/wallet', () => okBody(makeWallet())),
  http.get('*/admin/economy/users/:userId/transactions', () => okBody([makeTx()], cursorMeta())),
);

beforeAll(() => {
  configure({ asyncUtilTimeout: 4000 });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => server.resetHandlers());
afterAll(() => {
  configure({ asyncUtilTimeout: 1000 });
  server.close();
});
beforeEach(() => {
  userQueries = [];
  useAuthStore.getState().clearAuth();
  signIn(['gamification:view', 'user:view']);
});

const URL_FINDER = '/gamification?tab=economy&section=wallet';
const searchBox = () => screen.getByRole('textbox', { name: 'Tìm người dùng để xem ví xu' });

describe('WalletLookup — chọn người dùng', () => {
  it('gõ tên (có user:view) → gọi danh sách người dùng theo từ khoá và mỗi kết quả là liên kết THẬT sang ?userId=', async () => {
    renderAt(<WalletLookup />, URL_FINDER);
    await userEvent.type(searchBox(), 'Lan');

    const link = await screen.findByRole('link', { name: 'Xem ví của Nguyễn Thị Lan' });
    expect(link.getAttribute('href')).toContain(`userId=${USER_ID}`);
    expect(link.getAttribute('href')).toContain('section=wallet');
    expect(userQueries.at(-1)).toBe('Lan');
  });

  it('gõ dưới 2 ký tự → chưa gọi danh sách người dùng', async () => {
    renderAt(<WalletLookup />, URL_FINDER);
    await userEvent.type(searchBox(), 'L');
    await new Promise((r) => setTimeout(r, 450)); // qua thời gian debounce 300 ms
    expect(userQueries).toEqual([]);
  });

  it('dán ID 24 ký tự → liên kết mở ví ngay, KHÔNG gọi danh sách người dùng', async () => {
    renderAt(<WalletLookup />, URL_FINDER);
    await userEvent.type(searchBox(), USER_ID);

    const link = await screen.findByRole('link', { name: `Xem ví của người dùng có ID ${USER_ID}` });
    expect(link.getAttribute('href')).toContain(`userId=${USER_ID}`);
    expect(userQueries).toEqual([]);
  });

  it('KHÔNG có user:view → gõ tên hiện lời nhắc dán ID và KHÔNG gọi danh sách người dùng; dán ID vẫn dùng được', async () => {
    signIn(['gamification:view']);
    renderAt(<WalletLookup />, URL_FINDER);
    const user = userEvent.setup();
    await user.type(searchBox(), 'Lan');

    expect(await screen.findByText(/chưa có quyền xem danh sách người dùng/)).toBeInTheDocument();
    expect(userQueries).toEqual([]);

    await user.clear(searchBox());
    await user.type(searchBox(), USER_ID);
    expect(await screen.findByRole('link', { name: /Xem ví của người dùng có ID/ })).toBeInTheDocument();
  });
});

describe('WalletLookup — theo URL', () => {
  it('?userId= hợp lệ → mở ví của người đó (tên lấy từ hồ sơ khi có user:view) và có liên kết "Chọn người dùng khác"', async () => {
    const { router } = renderAt(<WalletLookup />, `${URL_FINDER}&userId=${USER_ID}`);

    expect(await screen.findByText('Ví xu — Nguyễn Thị Lan')).toBeInTheDocument();
    expect(await screen.findByText('500 xu')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('link', { name: '← Chọn người dùng khác' }));
    expect(await screen.findByRole('textbox', { name: 'Tìm người dùng để xem ví xu' })).toBeInTheDocument();
    expect(urlParam(router, 'userId')).toBeNull();
    expect(urlParam(router, 'section')).toBe('wallet'); // vẫn ở nhóm ví
  });

  it('?userId= sai dạng (URL bị sửa tay) → về bước chọn, KHÔNG gọi API ví', async () => {
    renderAt(<WalletLookup />, `${URL_FINDER}&userId=khong-phai-id`);
    expect(await screen.findByRole('textbox', { name: 'Tìm người dùng để xem ví xu' })).toBeInTheDocument();
    expect(within(document.body).queryByText('500 xu')).not.toBeInTheDocument();
  });

  it('không có user:view → tiêu đề dùng id rút gọn thay vì tên (không gọi hồ sơ người dùng)', async () => {
    signIn(['gamification:view']);
    renderAt(<WalletLookup />, `${URL_FINDER}&userId=${USER_ID}`);
    expect(await screen.findByText(/^Ví xu — người dùng …/)).toBeInTheDocument();
  });
});
