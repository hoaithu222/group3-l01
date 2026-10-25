/**
 * Ví một người + sổ cái + điều chỉnh xu (p7-02 admin.md §2.2, §4): số liệu ví, sổ cái có dấu/nhãn, ngăn kéo chi tiết, phân trang CURSOR, lọc loại, 404;
 * modal điều chỉnh: số làm âm bị chặn ở client, lý do ≥ 10 ký tự, xác nhận số lớn, `Idempotency-Key` (giữ khi lỗi mạng, ĐỔI sau 4xx), `COIN_001` gắn vào ô số xu,
 * thiếu `gamification:update` → không có nút ghi. MSW.
 */
import { configure, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/app/store';
import UserWalletPanel from '@/features/economy/components/UserWalletPanel';
import { useToastStore } from '@/shared/ui/overlays/toast-store';

import {
  cursorMeta,
  errorBody,
  makeTx,
  makeWallet,
  okBody,
  renderAt,
  signIn,
  USER_ID,
} from './economy-fixtures';

interface AdjustCall {
  key: string | null;
  body: Record<string, unknown>;
}
type Behaviour = 'ok' | 'network' | { status: number; code: string; details?: unknown };

let wallet = makeWallet();
let txPages: Record<string, ReturnType<typeof makeTx>[]> = {};
let txNext: Record<string, string | null> = {};
let txQueries: Array<{ cursor: string | null; type: string | null }> = [];
let walletHits = 0;
let adjusts: AdjustCall[] = [];
let behaviours: Behaviour[] = [];

const server = setupServer(
  http.get('*/admin/economy/users/:userId/wallet', () => {
    walletHits += 1;
    return okBody(wallet);
  }),
  http.get('*/admin/economy/users/:userId/transactions', ({ request }) => {
    const q = new URL(request.url).searchParams;
    const cursor = q.get('cursor');
    txQueries.push({ cursor, type: q.get('type') });
    return okBody(txPages[cursor ?? 'first'] ?? [], cursorMeta(txNext[cursor ?? 'first'] ?? null));
  }),
  http.post('*/admin/economy/users/:userId/adjust', async ({ request }) => {
    adjusts.push({ key: request.headers.get('Idempotency-Key'), body: (await request.json()) as Record<string, unknown> });
    const next = behaviours.shift() ?? 'ok';
    if (next === 'ok') return okBody({ balance: 650, delta: 150, replayed: false });
    if (next === 'network') return HttpResponse.error();
    return errorBody(next.status, next.code, 'Thông điệp từ BE', next.details);
  }),
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
  wallet = makeWallet();
  txPages = { first: [makeTx()] };
  txNext = {};
  txQueries = [];
  walletHits = 0;
  adjusts = [];
  behaviours = [];
  useToastStore.setState({ toasts: [] });
  useAuthStore.getState().clearAuth();
  signIn(['gamification:view', 'gamification:update']);
});

const URL_WALLET = `/gamification?tab=economy&section=wallet&userId=${USER_ID}`;
const toastTitles = () => useToastStore.getState().toasts.map((t) => t.title);
const REASON = 'Bù xu do lỗi đồng bộ nhiệm vụ';

async function openAdjust() {
  renderAt(<UserWalletPanel userId={USER_ID} />, URL_WALLET);
  await userEvent.click(await screen.findByRole('button', { name: 'Điều chỉnh xu' }));
  return screen.findByRole('dialog', { name: /Điều chỉnh xu — / });
}

async function fill(dialog: HTMLElement, amount: string, reason = REASON) {
  const user = userEvent.setup();
  const amountBox = within(dialog).getByLabelText(/Số xu điều chỉnh/);
  await user.clear(amountBox);
  await user.type(amountBox, amount);
  const reasonBox = within(dialog).getByLabelText(/Lý do/);
  await user.clear(reasonBox);
  await user.type(reasonBox, reason);
  return user;
}

describe('UserWalletPanel — ví và sổ cái', () => {
  it('hiện số dư, tổng nhận/tiêu, nhận hôm nay/trần ngày; sổ cái có dấu (+/−), nhãn loại và số dư sau', async () => {
    txPages.first = [
      makeTx({ id: 't1', type: 'EARN_EVENT', amount: 20, balanceAfter: 520 }),
      makeTx({ id: 't2', type: 'SPEND_SHOP', amount: -300, balanceAfter: 500, refType: 'SHOP_ITEM' }),
    ];
    renderAt(<UserWalletPanel userId={USER_ID} />, URL_WALLET);

    expect(await screen.findByText('500 xu')).toBeInTheDocument();
    expect(screen.getByText('900 xu')).toBeInTheDocument();
    expect(screen.getByText('400 xu')).toBeInTheDocument();
    expect(screen.getByText('30/200 xu')).toBeInTheDocument();

    expect(await screen.findByText('Thưởng sự kiện')).toBeInTheDocument();
    expect(screen.getByText('+20')).toBeInTheDocument();
    expect(screen.getByText('Mua ở cửa hàng')).toBeInTheDocument();
    expect(screen.getByText('−300')).toBeInTheDocument();
  });

  it('"Chi tiết" mở ngăn kéo với lý do đầy đủ, người thực hiện và mã tham chiếu', async () => {
    txPages.first = [
      makeTx({
        id: 't9',
        type: 'ADJUST_ADMIN',
        amount: 150,
        refType: 'ADMIN',
        refId: 'idem-key-123',
        note: 'Bù xu do lỗi đồng bộ nhiệm vụ ngày 26/09',
        actorId: 'f1f2f3f4f5f6f1f2f3f4f5f6',
      }),
    ];
    renderAt(<UserWalletPanel userId={USER_ID} />, URL_WALLET);

    await userEvent.click(await screen.findByRole('button', { name: /^Chi tiết giao dịch Admin điều chỉnh/ }));
    const drawer = await screen.findByRole('dialog', { name: 'Chi tiết giao dịch xu' });
    expect(within(drawer).getByText('Bù xu do lỗi đồng bộ nhiệm vụ ngày 26/09')).toBeInTheDocument();
    expect(within(drawer).getByText('ADMIN')).toBeInTheDocument();
    expect(within(drawer).getByText('Người thực hiện')).toBeInTheDocument();
    expect(within(drawer).getByText('Người thực hiện').nextElementSibling).toHaveTextContent('…f4f5f6');
  });

  it('phân trang CURSOR: "Trang sau" gửi cursor BE trả về, "Trang trước" quay về trang đầu', async () => {
    txPages.first = [makeTx({ id: 'a', type: 'EARN_QUEST', amount: 5 })];
    txNext.first = 'cur2';
    txPages.cur2 = [makeTx({ id: 'b', type: 'REFUND', amount: 7 })];
    renderAt(<UserWalletPanel userId={USER_ID} />, URL_WALLET);

    expect(await screen.findByText('Thưởng nhiệm vụ')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Trang trước' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Trang sau' }));

    expect(await screen.findByText('Hoàn xu')).toBeInTheDocument();
    expect(txQueries.at(-1)).toEqual({ cursor: 'cur2', type: null });
    expect(screen.queryByRole('button', { name: 'Trang sau' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Trang trước' }));
    expect(await screen.findByText('Thưởng nhiệm vụ')).toBeInTheDocument();
  });

  it('?type=ADJUST_ADMIN trên URL → gửi type cho BE; lọc rỗng hiện thông điệp riêng', async () => {
    txPages.first = [];
    renderAt(<UserWalletPanel userId={USER_ID} />, `${URL_WALLET}&type=ADJUST_ADMIN`);

    expect(await screen.findByText('Không có giao dịch nào thuộc loại này')).toBeInTheDocument();
    expect(txQueries[0]).toEqual({ cursor: null, type: 'ADJUST_ADMIN' });
  });

  it('người dùng không tồn tại (404) → nói rõ, KHÔNG có nút Thử lại và KHÔNG có nút Điều chỉnh', async () => {
    server.use(http.get('*/admin/economy/users/:userId/wallet', () => errorBody(404, 'RES_001', 'Không tìm thấy')));
    renderAt(<UserWalletPanel userId={USER_ID} />, URL_WALLET);

    expect(await screen.findByText('Không tải được ví xu')).toBeInTheDocument();
    expect(screen.getByText(/Không tìm thấy người dùng này/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Điều chỉnh xu' })).not.toBeInTheDocument();
  });

  it('chỉ có gamification:view → xem được ví nhưng KHÔNG có nút "Điều chỉnh xu"', async () => {
    signIn(['gamification:view']);
    renderAt(<UserWalletPanel userId={USER_ID} />, URL_WALLET);

    await screen.findByText('500 xu');
    expect(screen.queryByRole('button', { name: 'Điều chỉnh xu' })).not.toBeInTheDocument();
  });
});

describe('AdjustCoinsModal — kiểm tra ở client', () => {
  it('trừ quá số dư hiện tại → báo lỗi ở ô số xu, KHÔNG gọi API', async () => {
    const dialog = await openAdjust();
    const user = await fill(dialog, '-600');
    await user.click(within(dialog).getByRole('button', { name: 'Điều chỉnh xu' }));

    expect(await within(dialog).findByText('Không thể trừ quá số dư hiện tại (500 xu)')).toBeInTheDocument();
    expect(adjusts).toEqual([]);
  });

  it('số xu = 0 hoặc lý do < 10 ký tự → báo lỗi, KHÔNG gọi API', async () => {
    const dialog = await openAdjust();
    const user = await fill(dialog, '0', 'ngắn');
    await user.click(within(dialog).getByRole('button', { name: 'Điều chỉnh xu' }));

    expect(await within(dialog).findByText('Số xu điều chỉnh phải khác 0')).toBeInTheDocument();
    expect(within(dialog).getByText('Lý do tối thiểu 10 ký tự')).toBeInTheDocument();
    expect(adjusts).toEqual([]);
  });

  it('từ 10.000 xu phải tích ô xác nhận điều chỉnh lớn; chưa tích → KHÔNG gửi, tích rồi mới gửi', async () => {
    const dialog = await openAdjust();
    const user = await fill(dialog, '20000');
    expect(within(dialog).getByText(/Tôi xác nhận cộng 20\.000 xu vào ví của/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Điều chỉnh xu' }));
    expect(await within(dialog).findByText('Hãy tích xác nhận đây là điều chỉnh lớn')).toBeInTheDocument();
    expect(adjusts).toEqual([]);

    await user.click(within(dialog).getByRole('checkbox'));
    await user.click(within(dialog).getByRole('button', { name: 'Điều chỉnh xu' }));
    await waitFor(() => expect(adjusts).toHaveLength(1));
    expect(adjusts[0]!.body).toMatchObject({ amount: 20000 });
  });
});

describe('AdjustCoinsModal — gửi lên BE', () => {
  it('POST đúng thân + Idempotency-Key (8–128 ký tự); đóng modal, toast, làm mới ví', async () => {
    const dialog = await openAdjust();
    const user = await fill(dialog, '150');
    await user.click(within(dialog).getByRole('button', { name: 'Điều chỉnh xu' }));

    await waitFor(() => expect(adjusts).toHaveLength(1));
    expect(adjusts[0]!.key).toMatch(/^.{8,128}$/);
    expect(adjusts[0]!.body).toEqual({ amount: 150, reason: REASON });
    await waitFor(() => expect(toastTitles()).toContain('Đã điều chỉnh xu và ghi nhật ký'));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Điều chỉnh xu — / })).not.toBeInTheDocument());
    await waitFor(() => expect(walletHits).toBeGreaterThan(1)); // ví được tải lại
  });

  it('BE trả replayed=true → toast nói rõ số dư không đổi thêm', async () => {
    server.use(
      http.post('*/admin/economy/users/:userId/adjust', () => okBody({ balance: 650, delta: 150, replayed: true })),
    );
    const dialog = await openAdjust();
    const user = await fill(dialog, '150');
    await user.click(within(dialog).getByRole('button', { name: 'Điều chỉnh xu' }));

    await waitFor(() => expect(toastTitles()).toContain('Yêu cầu này đã được xử lý trước đó (+150 xu) — số dư không đổi thêm'));
  });

  it('COIN_001 từ BE → lỗi gắn vào ô SỐ XU (kèm số dư), modal giữ mở; thử lại dùng khoá MỚI (BE lưu 4xx theo khoá)', async () => {
    behaviours = [{ status: 400, code: 'COIN_001', details: { balance: 120, required: 400 } }, 'ok'];
    const dialog = await openAdjust();
    // Số dư hiển thị (500) còn đủ nên qua được kiểm tra ở client; BE mới là chỗ quyết định.
    const user = await fill(dialog, '-400');
    await user.click(within(dialog).getByRole('button', { name: 'Điều chỉnh xu' }));

    expect(await within(dialog).findByText('Số dư hiện tại chỉ còn 120 xu — không thể trừ nhiều hơn')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: /Điều chỉnh xu — / })).toBeInTheDocument();

    const amountBox = within(dialog).getByLabelText(/Số xu điều chỉnh/);
    await user.clear(amountBox);
    await user.type(amountBox, '-100');
    await user.click(within(dialog).getByRole('button', { name: 'Điều chỉnh xu' }));

    await waitFor(() => expect(adjusts).toHaveLength(2));
    expect(adjusts[0]!.key).not.toBe(adjusts[1]!.key);
    expect(adjusts[1]!.body).toMatchObject({ amount: -100 });
  });

  it('lỗi mạng → GIỮ nguyên khoá khi thử lại (BE trả kết quả đã có thay vì cộng hai lần)', async () => {
    behaviours = ['network', 'ok'];
    const dialog = await openAdjust();
    const user = await fill(dialog, '150');
    await user.click(within(dialog).getByRole('button', { name: 'Điều chỉnh xu' }));
    await waitFor(() => expect(adjusts).toHaveLength(1));
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Điều chỉnh xu' })).toBeEnabled());

    await user.click(within(dialog).getByRole('button', { name: 'Điều chỉnh xu' }));
    await waitFor(() => expect(adjusts).toHaveLength(2));
    expect(adjusts[1]!.key).toBe(adjusts[0]!.key);
  });

  it('COIN_009 (vượt số dư tối đa) → lỗi ở ô số xu kèm mức tối đa', async () => {
    behaviours = [{ status: 400, code: 'COIN_009', details: { max: 1_000_000_000 } }];
    const dialog = await openAdjust();
    const user = await fill(dialog, '150');
    await user.click(within(dialog).getByRole('button', { name: 'Điều chỉnh xu' }));

    expect(await within(dialog).findByText('Số dư sau điều chỉnh vượt mức tối đa 1.000.000.000 xu')).toBeInTheDocument();
  });
});
