/**
 * Nhóm "Kho tài liệu" của tab `storage` (p3-01 admin.md §2.2, §4): hạn mức mặc định (GiB) + số ngày giữ thùng
 * rác sinh từ registry (`limits.resource`) và trình sửa HẠN MỨC RIÊNG theo nhóm (field `json`
 * `resource.quotaOverrides`) — xác nhận có lý do + `expectedVersion`, 409 giữ giá trị đang nhập. Mock ở tầng
 * HTTP (MSW).
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import StorageQuotaSection from '@/features/system-config/storage/components/StorageQuotaSection';

import {
  GIB,
  OVERRIDE_WS_A,
  OVERRIDE_WS_B,
  type PutBody,
  RESOURCE_ITEM,
  RESOURCE_LIMITS,
  renderWithDataRouter,
  signIn,
} from './p3-config-fixtures';

let listItems: unknown[] = [];
let puts: Array<PutBody & { key: string }> = [];
let resets: Array<{ key: string; expectedVersion: number; reason: string }> = [];
let putStatus: { status: number; code: string } | null = null;

const server = setupServer(
  http.get('*/admin/system-config', () => HttpResponse.json({ success: true, data: listItems })),
  http.put('*/admin/system-config/:key', async ({ request, params }) => {
    const body = (await request.json()) as PutBody;
    puts.push({ ...body, key: String(params.key) });
    if (putStatus) {
      return HttpResponse.json(
        { success: false, error: { code: putStatus.code, message: 'x' } },
        { status: putStatus.status },
      );
    }
    const src = params.key === 'resource' ? RESOURCE_ITEM : RESOURCE_LIMITS;
    return HttpResponse.json({
      success: true,
      data: { ...src, stored: body.value, effective: { ...src.effective, ...body.value }, version: src.version + 1 },
    });
  }),
  http.post('*/admin/system-config/:key/reset', async ({ request, params }) => {
    const body = (await request.json()) as { expectedVersion: number; reason: string };
    resets.push({ ...body, key: String(params.key) });
    return HttpResponse.json({ success: true, data: { ...RESOURCE_ITEM, stored: {}, effective: { quotaOverrides: [] }, version: 8 } });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  listItems = [RESOURCE_LIMITS, RESOURCE_ITEM];
  puts = [];
  resets = [];
  putStatus = null;
  signIn(['system-config:view', 'system-config:update', 'workspace:view']);
});

const renderSection = () => renderWithDataRouter(<StorageQuotaSection />);
const gib = (wsSuffix: string) => screen.getByLabelText(new RegExp(`Hạn mức nhóm #${wsSuffix}`)) as HTMLInputElement;

async function setGib(user: ReturnType<typeof userEvent.setup>, wsSuffix: string, value: string) {
  await user.clear(gib(wsSuffix));
  await user.type(gib(wsSuffix), value);
}

/** Nút "Lưu" của thẻ hạn mức riêng (thẻ giới hạn dùng "Lưu nhóm"). */
const saveOverrides = () => screen.getByRole('button', { name: 'Lưu' });

describe('limits.resource — hạn mức mặc định bằng GiB', () => {
  it('nhãn/gợi ý dùng GiB (trần ≥ 1 GiB), số ngày giữ thùng rác dùng "ngày"', async () => {
    renderSection();

    expect(await screen.findByText('Kho tài liệu')).toBeInTheDocument();
    const quota = screen.getByLabelText(/Hạn mức mặc định \/ nhóm \(GiB\)/);
    expect(quota).toHaveValue('2');
    expect(screen.getByText('Mặc định: 2 GiB · Trần: 100 GiB')).toBeInTheDocument();
    expect(screen.getByLabelText(/Số ngày giữ thùng rác \(ngày\)/)).toHaveValue('30');
  });

  it('đổi sang 3 GiB → lý do → PUT limits.resource { workspaceQuotaBytes = 3 GiB (byte) }', async () => {
    renderSection();
    const user = userEvent.setup();
    const quota = await screen.findByLabelText(/Hạn mức mặc định \/ nhóm \(GiB\)/);

    await user.clear(quota);
    await user.type(quota, '3');
    await user.click(screen.getByRole('button', { name: 'Lưu nhóm' }));
    const dialog = await screen.findByRole('dialog');
    // So sánh trước/sau đọc bằng GiB.
    expect(within(dialog).getByText('2 GiB')).toBeInTheDocument();
    expect(within(dialog).getByText('3 GiB')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/Lý do/), 'Mở rộng kho cho học kỳ mới');
    await user.click(within(dialog).getByRole('button', { name: 'Lưu cấu hình' }));

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({
      key: 'limits.resource',
      value: { workspaceQuotaBytes: 3 * GIB },
      expectedVersion: 2,
      reason: 'Mở rộng kho cho học kỳ mới',
    });
  });
});

describe('resource.quotaOverrides — hạn mức riêng theo nhóm (json)', () => {
  it('liệt kê từng nhóm (mã rút gọn, link tới tab Tài liệu) với hạn mức GiB; không có nút thêm nhóm', async () => {
    renderSection();

    expect(await screen.findByText('Kho tài liệu — hạn mức riêng')).toBeInTheDocument();
    expect(gib('293a01')).toHaveValue('5');
    expect(gib('293a02')).toHaveValue('0.5');
    const link = screen.getByRole('link', { name: 'Nhóm #293a01' });
    expect(link).toHaveAttribute('href', `/workspace/${OVERRIDE_WS_A}?tab=resources`);
    expect(screen.queryByRole('button', { name: /^Thêm/ })).not.toBeInTheDocument();
    expect(screen.getByText(/mở nhóm đó → tab Tài liệu/)).toBeInTheDocument();
    expect(saveOverrides()).toBeDisabled(); // chưa sửa gì
  });

  it('không có workspace:view ⇒ mã nhóm là chữ, không phải link', async () => {
    signIn(['system-config:view', 'system-config:update']);
    renderSection();

    await screen.findByText('Kho tài liệu — hạn mức riêng');
    expect(screen.queryByRole('link', { name: /Nhóm #/ })).not.toBeInTheDocument();
    expect(screen.getAllByText('Nhóm #293a01').length).toBeGreaterThan(0);
  });

  it('sửa hạn mức một nhóm → lý do → PUT resource { quotaOverrides (byte) } giữ nhóm còn lại', async () => {
    renderSection();
    const user = userEvent.setup();
    await screen.findByText('Kho tài liệu — hạn mức riêng');

    await setGib(user, '293a01', '8');
    await user.click(saveOverrides());
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('1 nhóm đổi hạn mức')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/Lý do/), 'Nhóm đồ án lớn cần thêm dung lượng');
    await user.click(within(dialog).getByRole('button', { name: 'Lưu cấu hình' }));

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({
      key: 'resource',
      value: {
        quotaOverrides: [
          { workspaceId: OVERRIDE_WS_A, bytes: 8 * GIB },
          { workspaceId: OVERRIDE_WS_B, bytes: 0.5 * GIB },
        ],
      },
      expectedVersion: 7,
      reason: 'Nhóm đồ án lớn cần thêm dung lượng',
    });
  });

  it('"Bỏ hạn mức" một nhóm → lưu → nhóm đó không còn trong quotaOverrides (về mặc định)', async () => {
    renderSection();
    const user = userEvent.setup();
    await screen.findByText('Kho tài liệu — hạn mức riêng');

    await user.click(screen.getByRole('button', { name: 'Bỏ hạn mức riêng của nhóm #293a02' }));
    await waitFor(() => expect(screen.queryByLabelText(/Hạn mức nhóm #293a02/)).not.toBeInTheDocument());
    await user.click(saveOverrides());
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('1 nhóm về hạn mức mặc định')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/Lý do/), 'Nhóm đã xong đồ án, về mặc định');
    await user.click(within(dialog).getByRole('button', { name: 'Lưu cấu hình' }));

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].value).toEqual({ quotaOverrides: [{ workspaceId: OVERRIDE_WS_A, bytes: 5 * GIB }] });
  });

  it('lý do < 10 ký tự bị chặn, không gửi', async () => {
    renderSection();
    const user = userEvent.setup();
    await screen.findByText('Kho tài liệu — hạn mức riêng');

    await setGib(user, '293a01', '8');
    await user.click(saveOverrides());
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Lý do/), 'ngắn');
    await user.click(within(dialog).getByRole('button', { name: 'Lưu cấu hình' }));

    expect(await screen.findByText('Lý do tối thiểu 10 ký tự')).toBeInTheDocument();
    expect(puts).toHaveLength(0);
  });

  it('bỏ trống hạn mức một nhóm ⇒ lỗi tại ô, không mở hộp thoại, không gửi', async () => {
    renderSection();
    const user = userEvent.setup();
    await screen.findByText('Kho tài liệu — hạn mức riêng');

    await user.clear(gib('293a01'));
    await user.click(saveOverrides());

    expect(await screen.findByText('Nhập hạn mức (GiB)')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(puts).toHaveLength(0);
  });

  it('409 RES_003 ⇒ banner "vừa được người khác thay đổi", giữ giá trị đang nhập', async () => {
    putStatus = { status: 409, code: 'RES_003' };
    renderSection();
    const user = userEvent.setup();
    await screen.findByText('Kho tài liệu — hạn mức riêng');

    await setGib(user, '293a01', '8');
    await user.click(saveOverrides());
    await user.type(await screen.findByLabelText(/Lý do/), 'Nhóm đồ án lớn cần thêm dung lượng');
    await user.click(screen.getByRole('button', { name: 'Lưu cấu hình' }));

    expect(await screen.findByText('Cấu hình vừa được người khác thay đổi')).toBeInTheDocument();
    expect(gib('293a01')).toHaveValue('8');
  });

  it('"Khôi phục mặc định" (xoá mọi hạn mức riêng) cần lý do rồi POST reset { expectedVersion }', async () => {
    renderSection();
    const user = userEvent.setup();
    await screen.findByText('Kho tài liệu — hạn mức riêng');

    await user.click(screen.getByRole('button', { name: 'Khôi phục mặc định' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Lý do/), 'Kết thúc học kỳ, xoá mọi hạn mức riêng');
    await user.click(within(dialog).getByRole('button', { name: 'Khôi phục mặc định' }));

    await waitFor(() => expect(resets).toHaveLength(1));
    expect(resets[0]).toEqual({
      key: 'resource',
      expectedVersion: 7,
      reason: 'Kết thúc học kỳ, xoá mọi hạn mức riêng',
    });
  });

  it('chưa nhóm nào có hạn mức riêng ⇒ thông báo rỗng, không hàng nào; nút "Khôi phục mặc định" tắt', async () => {
    listItems = [RESOURCE_LIMITS, { ...RESOURCE_ITEM, stored: {}, effective: { quotaOverrides: [] } }];
    renderSection();

    expect(await screen.findByText(/Chưa nhóm nào có hạn mức riêng/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Hạn mức nhóm #/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Khôi phục mặc định' })).toBeDisabled();
  });

  it('chỉ xem (thiếu system-config:update) ⇒ không nút lưu/bỏ hạn mức/khôi phục; giá trị hiện dạng chữ', async () => {
    signIn(['system-config:view', 'workspace:view']);
    renderSection();

    await screen.findByText('Kho tài liệu — hạn mức riêng');
    expect(screen.queryByRole('button', { name: 'Lưu' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Bỏ hạn mức/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Khôi phục mặc định' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Hạn mức nhóm #/)).not.toBeInTheDocument();
  });

  it('BE chưa khai khoá resource ⇒ chỉ có nhóm limits.resource, không vỡ', async () => {
    listItems = [RESOURCE_LIMITS];
    renderSection();

    expect(await screen.findByText('Kho tài liệu')).toBeInTheDocument();
    expect(screen.queryByText('Kho tài liệu — hạn mức riêng')).not.toBeInTheDocument();
  });
});
