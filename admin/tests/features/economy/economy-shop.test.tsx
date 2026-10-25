/**
 * Nhóm "Cửa hàng" (p7-02 admin.md §2.1, §4): bảng vật phẩm (lọc loại trên URL, phân trang client), tạo/sửa (RHF + Zod: mã, tên, giá ≤ 10.000, `data` theo loại,
 * lý do ≥ 10 ký tự), sửa chỉ gửi trường ĐÃ ĐỔI kèm `expectedVersion`, `RES_003` → tải lại, trùng mã gắn vào ô mã, bật/tắt hỏi lý do, thiếu `gamification:update` → không nút ghi. MSW.
 */
import { configure, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/app/store';
import ShopItemTable from '@/features/economy/components/ShopItemTable';
import { useToastStore } from '@/shared/ui/overlays/toast-store';

import { errorBody, makeItem, okBody, renderAt, signIn } from './economy-fixtures';

type Write = { body: Record<string, unknown>; id?: string };
type Behaviour = 'ok' | { status: number; code: string; message?: string; details?: unknown };

let items = [makeItem()];
let listQueries: Array<string | null> = [];
let creates: Write[] = [];
let patches: Write[] = [];
let behaviours: Behaviour[] = [];

const server = setupServer(
  http.get('*/admin/economy/shop-items', ({ request }) => {
    listQueries.push(new URL(request.url).searchParams.get('kind'));
    return okBody(items);
  }),
  http.post('*/admin/economy/shop-items', async ({ request }) => {
    creates.push({ body: (await request.json()) as Record<string, unknown> });
    const next = behaviours.shift() ?? 'ok';
    if (next === 'ok') return HttpResponse.json({ success: true, data: makeItem({ id: 'new1' }) }, { status: 201 });
    return errorBody(next.status, next.code, next.message ?? 'Lỗi từ BE', next.details);
  }),
  http.patch('*/admin/economy/shop-items/:id', async ({ request, params }) => {
    patches.push({ id: String(params.id), body: (await request.json()) as Record<string, unknown> });
    const next = behaviours.shift() ?? 'ok';
    if (next === 'ok') return okBody(makeItem({ version: 5 }));
    return errorBody(next.status, next.code, next.message ?? 'Lỗi từ BE', next.details);
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
  items = [makeItem()];
  listQueries = [];
  creates = [];
  patches = [];
  behaviours = [];
  useToastStore.setState({ toasts: [] });
  useAuthStore.getState().clearAuth();
  signIn(['gamification:view', 'gamification:update']);
});

const URL_SHOP = '/gamification?tab=economy&section=shop';
const REASON = 'Thêm vật phẩm cho sự kiện thu';
const toastTitles = () => useToastStore.getState().toasts.map((t) => t.title);

async function openCreate() {
  renderAt(<ShopItemTable />, URL_SHOP);
  await userEvent.click(await screen.findByRole('button', { name: 'Thêm vật phẩm' }));
  return screen.findByRole('dialog', { name: /Thêm vật phẩm/i });
}

async function typeInto(dialog: HTMLElement, label: RegExp, text: string) {
  const box = within(dialog).getByLabelText(label);
  await userEvent.clear(box);
  if (text !== '') await userEvent.type(box, text); // user-event không nhận chuỗi rỗng
}

async function fillCreate(dialog: HTMLElement, over: { code?: string; name?: string; price?: string; reason?: string } = {}) {
  await typeInto(dialog, /^Mã/, over.code ?? 'khung-bac');
  await typeInto(dialog, /^Tên vật phẩm/, over.name ?? 'Khung bạc');
  await typeInto(dialog, /^Giá \(xu\)/, over.price ?? '250');
  await typeInto(dialog, /^Lý do/, over.reason ?? REASON);
}

const submit = (dialog: HTMLElement, name: string) => userEvent.click(within(dialog).getByRole('button', { name }));

describe('ShopItemTable — danh sách', () => {
  it('hiện tên + mã, loại, "xem trước" bằng chữ, giá, số người sở hữu, khung bán; gói emoji tóm tắt số lượng', async () => {
    items = [
      makeItem(),
      makeItem({ id: 'i2', code: 'goi-vui', name: 'Gói vui', kind: 'EMOJI_PACK', data: { emojis: ['😀', '🎉', '✨'] }, price: 80, owners: 3, availableFrom: '2026-09-01T00:00:00.000Z', availableTo: '2026-09-30T00:00:00.000Z' }),
    ];
    renderAt(<ShopItemTable />, URL_SHOP);

    expect(await screen.findByText('Khung vàng')).toBeInTheDocument();
    expect(screen.getByText('khung-vang')).toBeInTheDocument();
    expect(screen.getByText('Khung avatar')).toBeInTheDocument();
    expect(screen.getByText('Viền #FFB700 · 3px')).toBeInTheDocument();
    expect(screen.getByText('Không giới hạn')).toBeInTheDocument();
    expect(screen.getByText('😀 🎉 ✨ (3 emoji)')).toBeInTheDocument();
    expect(screen.getByText(/01\/09\/2026 – 30\/09\/2026/)).toBeInTheDocument();
  });

  it('?kind=EMOJI_PACK trên URL → gửi kind cho BE', async () => {
    renderAt(<ShopItemTable />, `${URL_SHOP}&kind=EMOJI_PACK`);
    await screen.findByText('Khung vàng');
    expect(listQueries[0]).toBe('EMOJI_PACK');
  });

  it('phân trang phía client theo ?page=&pageSize= (BE không phân trang); page vượt quá bị kẹp về trang cuối', async () => {
    items = Array.from({ length: 30 }, (_, i) => makeItem({ id: `p${i}`, code: `vp-${i}`, name: `Vật phẩm ${String(i + 1).padStart(2, '0')}` }));
    const { unmount } = renderAt(<ShopItemTable />, URL_SHOP);
    await screen.findByText('Vật phẩm 01');
    expect(screen.getAllByRole('row').length - 1).toBe(12); // trừ dòng tiêu đề
    expect(screen.queryByText('Vật phẩm 13')).not.toBeInTheDocument();
    unmount();

    renderAt(<ShopItemTable />, `${URL_SHOP}&page=99`);
    expect(await screen.findByText('Vật phẩm 30')).toBeInTheDocument();
    expect(screen.getAllByRole('row').length - 1).toBe(6);
  });

  it('tải lỗi → "Không tải được danh sách vật phẩm" + Thử lại (không vẽ bảng rỗng)', async () => {
    server.use(http.get('*/admin/economy/shop-items', () => errorBody(500, 'SYS_001', 'Lỗi máy chủ')));
    renderAt(<ShopItemTable />, URL_SHOP);
    expect(await screen.findByText('Không tải được danh sách vật phẩm')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
    expect(screen.queryByText('Chưa có vật phẩm nào')).not.toBeInTheDocument();
  });

  it('chỉ có gamification:view → không có nút Thêm/Sửa, công tắc bị khoá', async () => {
    signIn(['gamification:view']);
    renderAt(<ShopItemTable />, URL_SHOP);
    await screen.findByText('Khung vàng');
    expect(screen.queryByRole('button', { name: 'Thêm vật phẩm' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Sửa vật phẩm/ })).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Bật vật phẩm — Khung vàng' })).toBeDisabled();
  });
});

describe('ShopItemFormModal — tạo', () => {
  it('gửi đúng DTO: khung avatar có data { color, width }, khung bán trống = null; đóng modal, toast, tải lại danh sách', async () => {
    const dialog = await openCreate();
    await fillCreate(dialog);
    await submit(dialog, 'Thêm vật phẩm');

    await waitFor(() => expect(creates).toHaveLength(1));
    expect(creates[0]!.body).toEqual({
      code: 'khung-bac',
      name: 'Khung bạc',
      kind: 'AVATAR_FRAME',
      price: 250,
      data: { color: '#F59E0B', width: 3 },
      isActive: true,
      availableFrom: null,
      availableTo: null,
      reason: REASON,
    });
    await waitFor(() => expect(toastTitles()).toContain('Đã thêm vật phẩm và ghi nhật ký'));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Thêm vật phẩm/i })).not.toBeInTheDocument());
    await waitFor(() => expect(listQueries.length).toBeGreaterThan(1));
  });

  it('mã viết hoa / tên ngắn / thiếu giá / lý do ngắn → báo lỗi từng ô, KHÔNG gọi API', async () => {
    const dialog = await openCreate();
    await fillCreate(dialog, { code: 'Khung-Bac', name: 'K', price: '', reason: 'ngắn' });
    await submit(dialog, 'Thêm vật phẩm');

    expect(await within(dialog).findByText('Mã chỉ gồm chữ thường, số và dấu gạch ngang')).toBeInTheDocument();
    expect(within(dialog).getByText('Tên tối thiểu 2 ký tự')).toBeInTheDocument();
    expect(within(dialog).getByText('Nhập giá')).toBeInTheDocument();
    expect(within(dialog).getByText('Lý do tối thiểu 10 ký tự')).toBeInTheDocument();
    expect(creates).toEqual([]);
  });

  it('gói emoji: danh sách emoji được tách theo dấu cách/phẩy và gửi dạng mảng', async () => {
    const dialog = await openCreate();
    await userEvent.click(within(dialog).getByRole('combobox', { name: /Loại/ }));
    await userEvent.click(await screen.findByRole('option', { name: 'Gói emoji' }));
    await fillCreate(dialog, { code: 'goi-thu', name: 'Gói thu', price: '90' });
    await typeInto(dialog, /^Danh sách emoji/, '🍂, 🍁 🎃');
    await submit(dialog, 'Thêm vật phẩm');

    await waitFor(() => expect(creates).toHaveLength(1));
    expect(creates[0]!.body).toMatchObject({ kind: 'EMOJI_PACK', data: { emojis: ['🍂', '🍁', '🎃'] } });
  });

  it('trùng mã (409) → lỗi gắn vào ô Mã, modal giữ mở', async () => {
    behaviours = [{ status: 409, code: 'RES_002', message: 'Mã vật phẩm đã tồn tại' }];
    const dialog = await openCreate();
    await fillCreate(dialog);
    await submit(dialog, 'Thêm vật phẩm');

    await waitFor(() => expect(creates).toHaveLength(1));
    expect(await within(dialog).findAllByText('Mã vật phẩm đã tồn tại')).not.toHaveLength(0);
    expect(screen.getByRole('dialog', { name: /Thêm vật phẩm/i })).toBeInTheDocument();
  });

  it('BE từ chối data (VAL_001, details.data) → lỗi gắn vào ô màu của khung avatar', async () => {
    behaviours = [{ status: 400, code: 'VAL_001', details: { data: ['color: Màu phải dạng #RRGGBB'] } }];
    const dialog = await openCreate();
    await fillCreate(dialog);
    await submit(dialog, 'Thêm vật phẩm');

    expect(await within(dialog).findByText('color: Màu phải dạng #RRGGBB')).toBeInTheDocument();
  });
});

describe('ShopItemFormModal — sửa', () => {
  async function openEdit() {
    renderAt(<ShopItemTable />, URL_SHOP);
    await userEvent.click(await screen.findByRole('button', { name: 'Sửa vật phẩm Khung vàng' }));
    return screen.findByRole('dialog', { name: 'Sửa vật phẩm' });
  }

  it('mã và loại bị khoá; chưa đổi gì thì nút Lưu khoá; đổi giá → chỉ gửi price + expectedVersion + reason', async () => {
    const dialog = await openEdit();
    expect(within(dialog).getByLabelText(/^Mã/)).toBeDisabled();
    expect(within(dialog).getByRole('combobox', { name: /Loại/ })).toBeDisabled();
    const save = within(dialog).getByRole('button', { name: 'Lưu thay đổi' });
    expect(save).toBeDisabled();

    await typeInto(dialog, /^Giá \(xu\)/, '350');
    await typeInto(dialog, /^Lý do/, 'Điều chỉnh giá theo cân bằng mới');
    expect(save).toBeEnabled();
    await userEvent.click(save);

    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0]).toEqual({ id: 'i1', body: { expectedVersion: 4, reason: 'Điều chỉnh giá theo cân bằng mới', price: 350 } });
    await waitFor(() => expect(toastTitles()).toContain('Đã cập nhật vật phẩm và ghi nhật ký'));
  });

  it('RES_003 (vừa bị sửa ở nơi khác) → đóng modal (nó cầm bản cũ) và tải lại danh sách', async () => {
    behaviours = [{ status: 409, code: 'RES_003', message: 'Dữ liệu đã thay đổi, vui lòng tải lại', details: { currentVersion: 6 } }];
    const dialog = await openEdit();
    await typeInto(dialog, /^Giá \(xu\)/, '350');
    await typeInto(dialog, /^Lý do/, 'Điều chỉnh giá theo cân bằng mới');
    const before = listQueries.length;
    await userEvent.click(within(dialog).getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() => expect(patches).toHaveLength(1));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Sửa vật phẩm' })).not.toBeInTheDocument());
    await waitFor(() => expect(listQueries.length).toBeGreaterThan(before));
    expect(toastTitles().some((t) => /vui lòng tải lại/.test(String(t)))).toBe(true); // interceptor báo "tải lại"
  });
});

describe('Bật/tắt vật phẩm', () => {
  it('bấm công tắc → hộp thoại lý do; thiếu lý do KHÔNG gửi; đủ lý do → PATCH isActive=false kèm expectedVersion', async () => {
    renderAt(<ShopItemTable />, URL_SHOP);
    await userEvent.click(await screen.findByRole('switch', { name: 'Bật vật phẩm — Khung vàng' }));
    const dialog = await screen.findByRole('dialog', { name: 'Tắt vật phẩm' });
    expect(within(dialog).getByText(/Tắt vật phẩm “Khung vàng”/)).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Xác nhận' }));
    expect(patches).toEqual([]);

    await userEvent.type(within(dialog).getByRole('textbox', { name: /Lý do/ }), 'Vật phẩm hết mùa sự kiện');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Xác nhận' }));
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0]!.body).toEqual({ expectedVersion: 4, isActive: false, reason: 'Vật phẩm hết mùa sự kiện' });
  });

  it('RES_003 khi bật/tắt → đóng hộp thoại và tải lại danh sách', async () => {
    behaviours = [{ status: 409, code: 'RES_003', details: { currentVersion: 6 } }];
    renderAt(<ShopItemTable />, URL_SHOP);
    await userEvent.click(await screen.findByRole('switch', { name: 'Bật vật phẩm — Khung vàng' }));
    const dialog = await screen.findByRole('dialog', { name: 'Tắt vật phẩm' });
    const before = listQueries.length;
    await userEvent.type(within(dialog).getByRole('textbox', { name: /Lý do/ }), 'Vật phẩm hết mùa sự kiện');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Xác nhận' }));

    await waitFor(() => expect(patches).toHaveLength(1));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Tắt vật phẩm' })).not.toBeInTheDocument());
    await waitFor(() => expect(listQueries.length).toBeGreaterThan(before));
  });
});
