/**
 * Tab `pm` (Dự án) của `system-config` (p3-02 admin.md §2.2, §4): giới hạn bảng/thẻ sinh từ registry + trình
 * sửa MẪU CỘT MẶC ĐỊNH (field `json` `pm.defaultColumns`) — 2–12 cột, đúng 1 cột Hoàn thành, xác nhận có lý
 * do + `expectedVersion`, 409 giữ giá trị đang nhập. Mock ở tầng HTTP (MSW).
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import PmTab from '@/features/system-config/pm/PmTab';

import {
  BOARD_LIMITS,
  DEFAULT_COLUMNS,
  PM_ITEM,
  type PutBody,
  RESOURCE_LIMITS,
  renderWithDataRouter,
  signIn,
  TASK_LIMITS,
} from './p3-config-fixtures';

let listItems: unknown[] = [];
let puts: PutBody[] = [];
let resets: Array<{ expectedVersion: number; reason: string }> = [];
let putStatus: { status: number; code: string } | null = null;

const server = setupServer(
  http.get('*/admin/system-config', () => HttpResponse.json({ success: true, data: listItems })),
  http.get('*/capabilities', () => HttpResponse.json({ success: true, data: { features: {} } })),
  http.put('*/admin/system-config/:key', async ({ request }) => {
    puts.push((await request.json()) as PutBody);
    if (putStatus) {
      return HttpResponse.json(
        { success: false, error: { code: putStatus.code, message: 'x' } },
        { status: putStatus.status },
      );
    }
    const body = puts.at(-1) as PutBody;
    return HttpResponse.json({
      success: true,
      data: { ...PM_ITEM, stored: body.value, effective: { ...PM_ITEM.effective, ...body.value }, version: PM_ITEM.version + 1 },
    });
  }),
  http.post('*/admin/system-config/:key/reset', async ({ request }) => {
    resets.push((await request.json()) as { expectedVersion: number; reason: string });
    return HttpResponse.json({ success: true, data: { ...PM_ITEM, version: PM_ITEM.version + 1 } });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  listItems = [BOARD_LIMITS, TASK_LIMITS, PM_ITEM, RESOURCE_LIMITS];
  puts = [];
  resets = [];
  putStatus = null;
  signIn(['system-config:view', 'system-config:update']);
});

const renderTab = () => renderWithDataRouter(<PmTab />);
// Nhãn ô là "Tên cột N*" (dấu * của ô bắt buộc) nên khớp theo tiền tố, không khớp nguyên chuỗi.
const title = (n: number) =>
  screen.getByLabelText(new RegExp(`^Tên cột ${n}(?!\\d)`)) as HTMLInputElement;
const saveButton = () => screen.getByRole('button', { name: 'Lưu' });

async function setTitle(user: ReturnType<typeof userEvent.setup>, n: number, value: string) {
  await user.clear(title(n));
  await user.type(title(n), value);
}

async function setKind(user: ReturnType<typeof userEvent.setup>, n: number, option: string) {
  await user.click(screen.getByRole('combobox', { name: new RegExp(`Loại cột ${n}`) }));
  await user.click(await screen.findByRole('option', { name: option }));
}

describe('PmTab — hiển thị', () => {
  it('giới hạn bảng/thẻ (thẻ nhóm từ registry) + mẫu cột mặc định với 4 hàng tên/loại', async () => {
    renderTab();

    expect(await screen.findByText('Bảng công việc')).toBeInTheDocument();
    expect(screen.getByText('Thẻ công việc')).toBeInTheDocument();
    expect(screen.getByLabelText(/Số cột tối đa \/ bảng/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Số bảng tối đa \/ nhóm/)).toBeInTheDocument();
    // Khoá của tab khác không lẫn vào.
    expect(screen.queryByText('Kho tài liệu')).not.toBeInTheDocument();

    // Mẫu cột: một thẻ riêng cho field json.
    expect(await screen.findByLabelText(/^Tên cột 4(?!d)/)).toBeInTheDocument();
    DEFAULT_COLUMNS.forEach((col, i) => expect(title(i + 1)).toHaveValue(col.title));
    expect(screen.getByRole('combobox', { name: /Loại cột 4/ })).toHaveTextContent('Hoàn thành');
    expect(screen.getByRole('combobox', { name: /Loại cột 1/ })).toHaveTextContent('Cần làm');
    // Chưa sửa gì: nút Lưu của thẻ mẫu cột tắt (chỉ bật khi form có thay đổi).
    expect(saveButton()).toBeDisabled();
  });

  it('chưa sửa gì ⇒ nút Lưu tắt; chỉ xem (thiếu system-config:update) ⇒ không nút lưu/thêm/xoá', async () => {
    signIn(['system-config:view']);
    renderTab();

    expect(await screen.findByText('Cột mặc định khi tạo bảng')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Lưu' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thêm cột' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Xoá cột/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Đưa cột/ })).not.toBeInTheDocument();
    // Form chỉ-đọc: giá trị hiện dạng chữ, không có ô nhập.
    expect(screen.queryByLabelText(/^Tên cột 1(?!d)/)).not.toBeInTheDocument();
    expect(screen.getByText('To do')).toBeInTheDocument();
  });

  it('BE chưa khai khoá pm ⇒ báo thiếu cấu hình mẫu cột, không vỡ trang', async () => {
    listItems = [BOARD_LIMITS, TASK_LIMITS];
    renderTab();

    expect(await screen.findByText('Không có cấu hình mẫu cột')).toBeInTheDocument();
    expect(screen.getByText('Bảng công việc')).toBeInTheDocument();
  });
});

describe('PmTab — kiểm tra mẫu cột (Zod giống BE)', () => {
  it('2 cột Hoàn thành ⇒ lỗi "đúng một cột Hoàn thành", KHÔNG mở hộp thoại, KHÔNG gửi', async () => {
    renderTab();
    const user = userEvent.setup();
    await screen.findByLabelText(/^Tên cột 1(?!d)/);

    await setKind(user, 3, 'Hoàn thành'); // Review → Done ⇒ 2 cột DONE
    await user.click(saveButton());

    expect(await screen.findByText('Phải có đúng một cột Hoàn thành')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(puts).toHaveLength(0);
  });

  it('0 cột Hoàn thành ⇒ lỗi, không gửi', async () => {
    renderTab();
    const user = userEvent.setup();
    await screen.findByLabelText(/^Tên cột 1(?!d)/);

    await setKind(user, 4, 'Chờ duyệt'); // Done → Review ⇒ 0 cột DONE
    await user.click(saveButton());

    expect(await screen.findByText('Phải có đúng một cột Hoàn thành')).toBeInTheDocument();
    expect(puts).toHaveLength(0);
  });

  it('tên cột trống / toàn khoảng trắng ⇒ lỗi tại ô, không gửi', async () => {
    renderTab();
    const user = userEvent.setup();
    await screen.findByLabelText(/^Tên cột 1(?!d)/);

    await setTitle(user, 2, '   ');
    await user.click(saveButton());

    expect(await screen.findByText('Nhập tên cột')).toBeInTheDocument();
    expect(puts).toHaveLength(0);
  });

  it('không xoá xuống dưới 2 cột; không thêm quá trần limits.board.columnsMax', async () => {
    listItems = [{ ...BOARD_LIMITS, effective: { columnsMax: 5, perWorkspaceMax: 20 } }, TASK_LIMITS, PM_ITEM];
    renderTab();
    const user = userEvent.setup();
    await screen.findByLabelText(/^Tên cột 1(?!d)/);

    // Trần 5 cột: thêm được 1 cột (4 → 5) rồi nút "Thêm cột" tắt.
    const add = screen.getByRole('button', { name: 'Thêm cột' });
    expect(add).toBeEnabled();
    await user.click(add);
    expect(await screen.findByLabelText(/^Tên cột 5(?!d)/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thêm cột' })).toBeDisabled();
    expect(screen.getByText(/2–5 cột, đúng một cột loại "Hoàn thành"/)).toBeInTheDocument();

    // Xoá về 2 cột: mọi nút xoá còn lại bị tắt.
    for (let i = 0; i < 3; i += 1) await user.click(screen.getByRole('button', { name: 'Xoá cột 1' }));
    await waitFor(() => expect(screen.queryByLabelText(/^Tên cột 3(?!d)/)).not.toBeInTheDocument());
    for (const btn of screen.getAllByRole('button', { name: /^Xoá cột/ })) expect(btn).toBeDisabled();
  });

  it('đổi thứ tự: "Đưa cột 2 lên trên" hoán vị hai cột đầu', async () => {
    renderTab();
    const user = userEvent.setup();
    await screen.findByLabelText(/^Tên cột 1(?!d)/);

    expect(screen.getByRole('button', { name: 'Đưa cột 1 lên trên' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Đưa cột 4 xuống dưới' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Đưa cột 2 lên trên' }));

    await waitFor(() => expect(title(1)).toHaveValue('In progress'));
    expect(title(2)).toHaveValue('To do');
  });
});

describe('PmTab — lưu', () => {
  it('sửa tên cột → hộp thoại lý do (≥ 10 ký tự) → PUT /system-config/pm { value.defaultColumns, expectedVersion, reason }', async () => {
    renderTab();
    const user = userEvent.setup();
    await screen.findByLabelText(/^Tên cột 1(?!d)/);

    await setTitle(user, 1, 'Backlog');
    await user.click(saveButton());

    // Hộp thoại có so sánh trước/sau.
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Trước: To do · Cần làm → In progress/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Sau: Backlog · Cần làm → In progress/)).toBeInTheDocument();

    // Lý do ngắn bị chặn.
    await user.type(within(dialog).getByLabelText(/Lý do/), 'ngắn');
    await user.click(within(dialog).getByRole('button', { name: 'Lưu cấu hình' }));
    expect(await screen.findByText('Lý do tối thiểu 10 ký tự')).toBeInTheDocument();
    expect(puts).toHaveLength(0);

    await user.clear(within(dialog).getByLabelText(/Lý do/));
    await user.type(within(dialog).getByLabelText(/Lý do/), 'Đổi mẫu cột cho học kỳ mới');
    await user.click(within(dialog).getByRole('button', { name: 'Lưu cấu hình' }));

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({
      value: {
        defaultColumns: [
          { title: 'Backlog', kind: 'TODO' },
          { title: 'In progress', kind: 'IN_PROGRESS' },
          { title: 'Review', kind: 'REVIEW' },
          { title: 'Done', kind: 'DONE' },
        ],
      },
      expectedVersion: 4,
      reason: 'Đổi mẫu cột cho học kỳ mới',
    });
    // Lưu xong: form theo bản mới, nút Lưu tắt lại.
    await waitFor(() => expect(saveButton()).toBeDisabled());
  });

  it('giữ nguyên wipLimit của mẫu đã lưu (ô này không có ở admin)', async () => {
    const withWip = [
      { title: 'To do', kind: 'TODO', wipLimit: 20 },
      { title: 'Done', kind: 'DONE' },
    ];
    listItems = [BOARD_LIMITS, TASK_LIMITS, { ...PM_ITEM, effective: { defaultColumns: withWip } }];
    renderTab();
    const user = userEvent.setup();
    await screen.findByLabelText(/^Tên cột 1(?!d)/);

    await setTitle(user, 1, 'Cần làm');
    await user.click(saveButton());
    await user.type(await screen.findByLabelText(/Lý do/), 'Đặt tên tiếng Việt cho cột');
    await user.click(screen.getByRole('button', { name: 'Lưu cấu hình' }));

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].value.defaultColumns).toEqual([
      { title: 'Cần làm', kind: 'TODO', wipLimit: 20 },
      { title: 'Done', kind: 'DONE' },
    ]);
  });

  it('409 RES_003 ⇒ banner "vừa được người khác thay đổi", giữ giá trị đang nhập, không toast lỗi trùng', async () => {
    putStatus = { status: 409, code: 'RES_003' };
    renderTab();
    const user = userEvent.setup();
    await screen.findByLabelText(/^Tên cột 1(?!d)/);

    await setTitle(user, 1, 'Backlog');
    await user.click(saveButton());
    await user.type(await screen.findByLabelText(/Lý do/), 'Đổi mẫu cột cho học kỳ mới');
    await user.click(screen.getByRole('button', { name: 'Lưu cấu hình' }));

    expect(await screen.findByText('Cấu hình vừa được người khác thay đổi')).toBeInTheDocument();
    expect(title(1)).toHaveValue('Backlog'); // giá trị đang nhập được giữ
    expect(puts).toHaveLength(1);
  });

  it('"Khôi phục mặc định" chỉ bật khi đã có override; cần lý do rồi POST reset { expectedVersion, reason }', async () => {
    listItems = [BOARD_LIMITS, TASK_LIMITS, { ...PM_ITEM, stored: { defaultColumns: DEFAULT_COLUMNS } }];
    renderTab();
    const user = userEvent.setup();
    await screen.findByLabelText(/^Tên cột 1(?!d)/);

    // Có nhiều nút "Khôi phục mặc định cả nhóm" của thẻ giới hạn (tắt) và MỘT nút "Khôi phục mặc định" của thẻ mẫu cột.
    await user.click(screen.getByRole('button', { name: 'Khôi phục mặc định' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Lý do/), 'Quay về mẫu cột gốc của hệ thống');
    await user.click(within(dialog).getByRole('button', { name: 'Khôi phục mặc định' }));

    await waitFor(() => expect(resets).toHaveLength(1));
    expect(resets[0]).toEqual({ expectedVersion: 4, reason: 'Quay về mẫu cột gốc của hệ thống' });
  });
});
