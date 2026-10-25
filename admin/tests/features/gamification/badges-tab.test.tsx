/**
 * Tab "Huy hiệu" (p4-03 admin.md §2.2): tìm theo TÊN phía server (IME-safe), tên huy hiệu là liên kết tới ngăn kéo theo URL,
 * quyền `gamification:update` quyết định nút ghi, ảnh huy hiệu rơi về emoji khi không đọc được. Mock ở tầng HTTP (MSW).
 */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/app/store';
import BadgesTab from '@/features/gamification/components/BadgesTab';

import { errorBody, makeBadge, okBody, pageMeta, renderAt, signIn, urlParam } from './gamification-fixtures';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => {
  useAuthStore.getState().clearAuth();
  signIn(['gamification:view']);
});

const SEARCH_PLACEHOLDER = 'Tìm theo tên huy hiệu…';

/** Ghi lại mọi lần gọi `GET /admin/badges` và trả `rows` theo hàm `answer` (mặc định: một huy hiệu). */
function mockList(answer: (q: URLSearchParams) => ReturnType<typeof makeBadge>[] = () => [makeBadge()]) {
  const calls: URLSearchParams[] = [];
  server.use(
    http.get('*/admin/badges', ({ request }) => {
      const q = new URL(request.url).searchParams;
      calls.push(q);
      const rows = answer(q);
      return okBody(rows, pageMeta(rows.length));
    }),
  );
  return calls;
}

describe('BadgesTab — tìm theo tên', () => {
  it('gõ từ khoá → gửi `q` lên SERVER (đã debounce), đồng bộ URL ?q=, page về 1; xoá ô → bỏ q', async () => {
    const calls = mockList();
    const { router } = renderAt(<BadgesTab />, '/gamification?tab=badges&page=3');
    await screen.findByText('Chăm chỉ');
    expect(calls[0]!.get('q')).toBeNull();
    expect(calls[0]!.get('page')).toBe('3');

    const input = screen.getByPlaceholderText(SEARCH_PLACEHOLDER);
    const user = userEvent.setup();
    await user.type(input, 'chăm');

    await waitFor(() => expect(calls.at(-1)!.get('q')).toBe('chăm'));
    expect(calls.at(-1)!.get('page')).toBe('1');
    expect(urlParam(router, 'q')).toBe('chăm');
    expect(urlParam(router, 'page')).toBe('1'); // đổi từ khoá → về trang đầu
    expect(urlParam(router, 'tab')).toBe('badges'); // giữ tab hiện tại

    await user.clear(input);
    await waitFor(() => expect(calls.at(-1)!.get('q')).toBeNull());
    expect(urlParam(router, 'q')).toBeNull();
  });

  it('IME (Telex/VNI): đang gõ dở dấu KHÔNG commit; chỉ commit khi compositionEnd', async () => {
    const calls = mockList();
    const { router } = renderAt(<BadgesTab />, '/gamification?tab=badges');
    await screen.findByText('Chăm chỉ');
    const input = screen.getByPlaceholderText(SEARCH_PLACEHOLDER);

    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: 'chă' } });
    await new Promise((r) => setTimeout(r, 400)); // quá thời gian debounce
    expect(urlParam(router, 'q')).toBeNull();
    expect(calls.every((c) => c.get('q') === null)).toBe(true);

    fireEvent.change(input, { target: { value: 'chăm' } });
    fireEvent.compositionEnd(input);
    await waitFor(() => expect(calls.at(-1)!.get('q')).toBe('chăm'));
  });

  it('kết quả do SERVER quyết định: bảng hiện đúng dòng server trả (không lọc lại phía client trên một trang)', async () => {
    mockList((q) => (q.get('q') ? [makeBadge({ id: 'b2', code: 'dung-han', name: 'Đúng hạn', emoji: '⏰' })] : [makeBadge()]));
    renderAt(<BadgesTab />, '/gamification?tab=badges&q=cham');
    // Từ khoá "cham" KHÔNG có trong "Đúng hạn" — vẫn hiện vì server đã lọc (khớp không dấu ở BE).
    expect(await screen.findByText('Đúng hạn')).toBeInTheDocument();
    expect(screen.queryByText('Chăm chỉ')).not.toBeInTheDocument();
  });

  it('không có huy hiệu khớp → thông báo nêu từ khoá', async () => {
    mockList((q) => (q.get('q') ? [] : [makeBadge()]));
    renderAt(<BadgesTab />, '/gamification?tab=badges&q=xyz');
    expect(await screen.findByText('Không có huy hiệu nào khớp "xyz"')).toBeInTheDocument();
  });

  it('từ khoá + lọc Bật/Tắt cùng gửi; URL cũ có q vẫn nạp vào ô tìm', async () => {
    const calls = mockList();
    renderAt(<BadgesTab />, '/gamification?tab=badges&q=chăm&active=false');
    await screen.findByText('Chăm chỉ');
    await waitFor(() => expect(calls.at(-1)!.get('q')).toBe('chăm'));
    expect(calls.at(-1)!.get('isActive')).toBe('false');
    expect(screen.getByPlaceholderText(SEARCH_PLACEHOLDER)).toHaveValue('chăm');
  });
});

describe('BadgesTab — liên kết, quyền, ảnh', () => {
  it('tên huy hiệu là <a href> THẬT tới ngăn kéo, giữ tab/từ khoá; điều kiện hiện dạng chữ', async () => {
    mockList();
    renderAt(<BadgesTab />, '/gamification?tab=badges&q=chăm');
    const link = await screen.findByRole('link', { name: 'Chăm chỉ' });
    const href = new URL(link.getAttribute('href')!, 'http://x');
    expect(href.searchParams.get('badgeId')).toBe('b1');
    expect(href.searchParams.get('tab')).toBe('badges');
    expect(href.searchParams.get('q')).toBe('chăm');
    expect(screen.getByText('Task hoàn thành ≥ 50')).toBeInTheDocument();
  });

  it('chỉ có gamification:view → không thấy Tạo/Sửa/Tắt/Cấp bù; có update → thấy đủ', async () => {
    mockList();
    const first = renderAt(<BadgesTab />, '/gamification?tab=badges');
    await screen.findByText('Chăm chỉ');
    for (const name of ['Tạo huy hiệu', 'Sửa', 'Tắt', 'Cấp bù']) expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    first.unmount();

    signIn(['gamification:view', 'gamification:update']);
    renderAt(<BadgesTab />, '/gamification?tab=badges');
    await screen.findByText('Chăm chỉ');
    for (const name of ['Tạo huy hiệu', 'Sửa', 'Tắt', 'Cấp bù']) expect(screen.getByRole('button', { name })).toBeInTheDocument();
  });

  it('có iconAssetId → tải URL ký và hiện ảnh; không đọc được (404) → giữ emoji, không báo lỗi', async () => {
    server.use(
      http.get('*/assets/a-ok/url', () => okBody({ url: 'https://cdn.test/badge.png', expiresAt: '2026-09-25T00:01:00.000Z' })),
      http.get('*/assets/a-bad/url', () => errorBody(404, 'PERM_404', 'Không tìm thấy')),
    );
    mockList(() => [
      makeBadge({ id: 'b-img', name: 'Có ảnh', iconAssetId: 'a-ok' }),
      makeBadge({ id: 'b-lost', name: 'Mất ảnh', iconAssetId: 'a-bad', emoji: '🔥' }),
    ]);
    renderAt(<BadgesTab />, '/gamification?tab=badges');

    const img = await screen.findByRole('img', { name: 'Có ảnh' });
    expect(img).toHaveAttribute('src', 'https://cdn.test/badge.png');
    expect(await screen.findByText('Mất ảnh')).toBeInTheDocument();
    expect(screen.getAllByText('🔥').length).toBeGreaterThan(0);
    expect(screen.queryByRole('img', { name: 'Mất ảnh' })).not.toBeInTheDocument();
  });
});
