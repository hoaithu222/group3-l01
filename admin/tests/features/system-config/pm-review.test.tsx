/**
 * Tab `pm` (Dự án) của `system-config` — thẻ "Chấm chéo — mặc định cho bảng mới" (`pm.review`, p4-05 admin.md §2.1, §4):
 * bật cho bảng mới, số lượt duyệt 1–trần, 1–3 mốc nhắc TĂNG DẦN; sai chặn gửi; lưu có lý do + `expectedVersion`; 409 giữ
 * giá trị đang nhập; chỉ xem khi thiếu `system-config:update`; BE chưa khai khoá thì ẩn thẻ. Mock ở tầng HTTP (MSW).
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import PmTab from '@/features/system-config/pm/PmTab';

import {
  BOARD_LIMITS,
  type PutBody,
  PM_ITEM,
  renderWithDataRouter,
  signIn,
  TASK_LIMITS,
} from './p3-config-fixtures';

interface ConfigItem {
  key: string;
  effective: Record<string, unknown>;
  stored: Record<string, unknown>;
  version: number;
  [k: string]: unknown;
}

const REVIEW_TITLE = 'Chấm chéo — mặc định cho bảng mới';

/** Khoá `pm.review` đúng hình dạng BE: bool + int (form chung sửa được) + json mốc nhắc. */
const REVIEW_ITEM: ConfigItem = {
  key: 'pm.review',
  tab: 'pm',
  label: 'Chấm chéo (mặc định)',
  fields: [
    { path: 'enabledForNewBoards', label: 'Bật chấm chéo cho bảng mới', kind: 'bool', default: false },
    {
      path: 'requiredReviews',
      label: 'Số lượt duyệt mặc định',
      kind: 'int',
      default: 2,
      floor: 1,
      ceil: 5,
      unit: 'count',
    },
    { path: 'reminderHours', label: 'Nhắc người chấm sau (giờ)', kind: 'json', default: [24, 72] },
  ],
  stored: {},
  effective: { enabledForNewBoards: false, requiredReviews: 2, reminderHours: [24, 72] },
  version: 2,
  updatedAt: null,
  updatedBy: null,
};

let listItems: ConfigItem[] = [];
let puts: Array<PutBody & { key: string }> = [];
let resets: Array<{ key: string; expectedVersion: number; reason: string }> = [];
let putStatus: { status: number; code: string } | null = null;

const server = setupServer(
  http.get('*/admin/system-config', () => HttpResponse.json({ success: true, data: listItems })),
  http.get('*/capabilities', () => HttpResponse.json({ success: true, data: { features: {} } })),
  http.put('*/admin/system-config/:key', async ({ request, params }) => {
    const key = String(params.key);
    const body = (await request.json()) as PutBody;
    puts.push({ key, ...body });
    if (putStatus) {
      return HttpResponse.json(
        { success: false, error: { code: putStatus.code, message: 'x' } },
        { status: putStatus.status },
      );
    }
    // Giả lập máy chủ: giá trị mới thành hiệu lực, phiên bản tăng.
    const item = listItems.find((i) => i.key === key) as ConfigItem;
    const saved = {
      ...item,
      stored: body.value,
      effective: { ...item.effective, ...body.value },
      version: item.version + 1,
    };
    listItems = listItems.map((i) => (i.key === key ? saved : i));
    return HttpResponse.json({ success: true, data: saved });
  }),
  http.post('*/admin/system-config/:key/reset', async ({ request, params }) => {
    const body = (await request.json()) as { expectedVersion: number; reason: string };
    resets.push({ key: String(params.key), ...body });
    const item = listItems.find((i) => i.key === params.key) as ConfigItem;
    return HttpResponse.json({
      success: true,
      data: { ...item, stored: {}, version: item.version + 1 },
    });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  listItems = [BOARD_LIMITS, TASK_LIMITS, PM_ITEM, REVIEW_ITEM] as ConfigItem[];
  puts = [];
  resets = [];
  putStatus = null;
  signIn(['system-config:view', 'system-config:update']);
});

const renderTab = () => renderWithDataRouter(<PmTab />);

const input = (label: RegExp) => screen.getByLabelText(label) as HTMLInputElement;
const required = () => input(/^Số lượt duyệt mặc định/);
const reminder = (n: number) => input(new RegExp(`^Nhắc lần ${n} \\(giờ\\)`));
const enabledSwitch = () => screen.getByRole('switch', { name: /Bật chấm chéo cho bảng mới/ });
// Thẻ mẫu cột (khoá `pm`) cũng có nút "Lưu"; thẻ chấm chéo đứng SAU nó.
const saveButton = () => screen.getAllByRole('button', { name: 'Lưu' }).at(-1) as HTMLButtonElement;

async function setNumber(
  user: ReturnType<typeof userEvent.setup>,
  el: HTMLInputElement,
  value: string,
) {
  await user.clear(el);
  await user.type(el, value);
}

async function confirmWithReason(user: ReturnType<typeof userEvent.setup>, reason: string) {
  const dialog = await screen.findByRole('dialog');
  await user.type(within(dialog).getByLabelText(/Lý do/), reason);
  await user.click(within(dialog).getByRole('button', { name: 'Lưu cấu hình' }));
}

describe('PmTab — thẻ Chấm chéo: hiển thị', () => {
  it('hiện tắt/2 lượt/mốc nhắc 24 và 72 giờ theo giá trị hiệu lực; chưa sửa ⇒ nút Lưu tắt; có ghi chú phạm vi áp dụng', async () => {
    renderTab();

    expect(await screen.findByText(REVIEW_TITLE)).toBeInTheDocument();
    expect(enabledSwitch()).not.toBeChecked();
    expect(required()).toHaveValue('2');
    expect(reminder(1)).toHaveValue('24');
    expect(reminder(2)).toHaveValue('72');
    expect(screen.queryByLabelText(/^Nhắc lần 3/)).not.toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
    expect(screen.getByText(/Chỉ áp cho bảng tạo sau khi lưu/)).toBeInTheDocument();
  });

  it('đọc giá trị hiệu lực của server (không phải mặc định) — bật, 3 lượt, mốc 12/48/96', async () => {
    listItems = [
      BOARD_LIMITS,
      TASK_LIMITS,
      PM_ITEM,
      {
        ...REVIEW_ITEM,
        stored: { enabledForNewBoards: true },
        effective: { enabledForNewBoards: true, requiredReviews: 3, reminderHours: [12, 48, 96] },
      },
    ] as ConfigItem[];
    renderTab();

    await screen.findByText(REVIEW_TITLE);
    expect(enabledSwitch()).toBeChecked();
    expect(required()).toHaveValue('3');
    expect(reminder(1)).toHaveValue('12');
    expect(reminder(2)).toHaveValue('48');
    expect(reminder(3)).toHaveValue('96');
  });

  it('khoá chỉ có một thẻ riêng — form chung bỏ qua (không lặp thẻ thứ hai "Chấm chéo (mặc định)")', async () => {
    renderTab();
    await screen.findByText(REVIEW_TITLE);

    expect(screen.getAllByText(REVIEW_TITLE)).toHaveLength(1);
    expect(screen.queryByText('Chấm chéo (mặc định)')).not.toBeInTheDocument();
    // Chỉ còn hai thẻ nhóm thường (bảng, thẻ công việc); khoá `pm` của fixture chỉ có field json.
    expect(screen.getAllByRole('button', { name: 'Lưu nhóm' })).toHaveLength(2);
  });

  it('chỉ xem (thiếu system-config:update) ⇒ không nút lưu/khôi phục/thêm/xoá mốc, giá trị hiện dạng chữ', async () => {
    signIn(['system-config:view']);
    renderTab();

    expect(await screen.findByText(REVIEW_TITLE)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Lưu' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thêm mốc nhắc' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Xoá mốc nhắc/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Số lượt duyệt mặc định/)).not.toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('BE chưa khai khoá chấm chéo ⇒ không có thẻ, các thẻ khác vẫn hoạt động', async () => {
    listItems = [BOARD_LIMITS, TASK_LIMITS, PM_ITEM] as ConfigItem[];
    renderTab();

    expect(await screen.findByText('Bảng công việc')).toBeInTheDocument();
    expect(await screen.findByText('Cột mặc định khi tạo bảng')).toBeInTheDocument();
    expect(screen.queryByText(REVIEW_TITLE)).not.toBeInTheDocument();
  });
});

describe('PmTab — thẻ Chấm chéo: kiểm tra', () => {
  it('ô số kẹp theo sàn/trần của BE khi rời ô: lượt duyệt 0 → 1, 6 → 5; mốc nhắc 169 → 168 (không thể gửi số ngoài khoảng)', async () => {
    renderTab();
    const user = userEvent.setup();
    await screen.findByText(REVIEW_TITLE);

    await setNumber(user, required(), '0');
    await user.tab();
    expect(required()).toHaveValue('1');

    await setNumber(user, required(), '6');
    await user.tab();
    expect(required()).toHaveValue('5');

    await setNumber(user, reminder(2), '169');
    await user.tab();
    expect(reminder(2)).toHaveValue('168');
    expect(puts).toHaveLength(0);
  });

  it('mốc nhắc giảm dần (100 rồi 72) ⇒ lỗi "Các mốc nhắc phải tăng dần" (role alert), không gửi', async () => {
    renderTab();
    const user = userEvent.setup();
    await screen.findByText(REVIEW_TITLE);

    await setNumber(user, reminder(1), '100');
    await user.click(saveButton());

    expect(await screen.findByText('Các mốc nhắc phải tăng dần')).toHaveAttribute('role', 'alert');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(puts).toHaveLength(0);
  });

  it('hai mốc bằng nhau (72 và 72) cũng bị chặn; sửa lại cho tăng dần thì lỗi biến mất', async () => {
    renderTab();
    const user = userEvent.setup();
    await screen.findByText(REVIEW_TITLE);

    await setNumber(user, reminder(1), '72');
    await user.click(saveButton());
    expect(await screen.findByText('Các mốc nhắc phải tăng dần')).toBeInTheDocument();

    await setNumber(user, reminder(1), '48');
    await user.click(saveButton());
    await waitFor(() =>
      expect(screen.queryByText('Các mốc nhắc phải tăng dần')).not.toBeInTheDocument(),
    );
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('ô mốc nhắc/số lượt để trống ⇒ lỗi "Nhập một số" tại ô, không mở hộp thoại, không gửi', async () => {
    renderTab();
    const user = userEvent.setup();
    await screen.findByText(REVIEW_TITLE);

    await user.clear(reminder(2));
    await user.clear(required());
    await user.click(saveButton());

    expect(await screen.findAllByText('Nhập một số')).toHaveLength(2);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(puts).toHaveLength(0);
  });

  it('thêm mốc nhắc: mốc mới = mốc cuối + 24 giờ, tối đa 3 mốc (nút thêm tắt); xoá bớt được nhưng luôn còn ít nhất một mốc', async () => {
    renderTab();
    const user = userEvent.setup();
    await screen.findByText(REVIEW_TITLE);

    await user.click(screen.getByRole('button', { name: 'Thêm mốc nhắc' }));
    expect(reminder(3)).toHaveValue('96');
    expect(screen.getByRole('button', { name: 'Thêm mốc nhắc' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Xoá mốc nhắc 3' }));
    await user.click(screen.getByRole('button', { name: 'Xoá mốc nhắc 2' }));
    expect(screen.queryByLabelText(/^Nhắc lần 2/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xoá mốc nhắc 1' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Thêm mốc nhắc' })).toBeEnabled();
  });
});

describe('PmTab — thẻ Chấm chéo: lưu', () => {
  it('bật + 3 lượt + mốc 12/48 → hộp thoại so sánh trước/sau → lý do ≥ 10 ký tự → PUT { enabledForNewBoards, requiredReviews, reminderHours, expectedVersion, reason }', async () => {
    renderTab();
    const user = userEvent.setup();
    await screen.findByText(REVIEW_TITLE);

    await user.click(enabledSwitch());
    await setNumber(user, required(), '3');
    await setNumber(user, reminder(1), '12');
    await setNumber(user, reminder(2), '48');
    await user.click(saveButton());

    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(/Trước: Bảng mới tắt chấm chéo · 2 lượt duyệt · nhắc sau 24 \/ 72 giờ/),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Sau: Bảng mới bật chấm chéo · 3 lượt duyệt · nhắc sau 12 \/ 48 giờ/),
    ).toBeInTheDocument();

    // Lý do ngắn bị chặn.
    await user.type(within(dialog).getByLabelText(/Lý do/), 'ngắn');
    await user.click(within(dialog).getByRole('button', { name: 'Lưu cấu hình' }));
    expect(await screen.findByText('Lý do tối thiểu 10 ký tự')).toBeInTheDocument();
    expect(puts).toHaveLength(0);

    await user.clear(within(dialog).getByLabelText(/Lý do/));
    await user.type(within(dialog).getByLabelText(/Lý do/), 'Học kỳ mới bật chấm chéo mặc định');
    await user.click(within(dialog).getByRole('button', { name: 'Lưu cấu hình' }));

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({
      key: 'pm.review',
      value: { enabledForNewBoards: true, requiredReviews: 3, reminderHours: [12, 48] },
      expectedVersion: 2,
      reason: 'Học kỳ mới bật chấm chéo mặc định',
    });
    // Lưu xong: form theo bản mới, nút Lưu tắt lại.
    await waitFor(() => expect(saveButton()).toBeDisabled());
    expect(required()).toHaveValue('3');
    expect(enabledSwitch()).toBeChecked();
  });

  it('xoá mốc nhắc thứ hai ⇒ gửi reminderHours còn một phần tử', async () => {
    renderTab();
    const user = userEvent.setup();
    await screen.findByText(REVIEW_TITLE);

    await user.click(screen.getByRole('button', { name: 'Xoá mốc nhắc 2' }));
    await user.click(saveButton());
    await confirmWithReason(user, 'Chỉ nhắc một lần sau 24 giờ');

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].value).toEqual({
      enabledForNewBoards: false,
      requiredReviews: 2,
      reminderHours: [24],
    });
  });

  it('409 RES_003 ⇒ banner "vừa được người khác thay đổi", giữ giá trị đang nhập', async () => {
    putStatus = { status: 409, code: 'RES_003' };
    renderTab();
    const user = userEvent.setup();
    await screen.findByText(REVIEW_TITLE);

    await setNumber(user, required(), '4');
    await user.click(saveButton());
    await confirmWithReason(user, 'Nhóm lớn cần nhiều lượt duyệt hơn');

    expect(await screen.findByText('Cấu hình vừa được người khác thay đổi')).toBeInTheDocument();
    expect(required()).toHaveValue('4');
    expect(puts).toHaveLength(1);
  });

  it('"Khôi phục mặc định" chỉ bật khi đã có override; cần lý do rồi POST reset { expectedVersion, reason }', async () => {
    listItems = [
      BOARD_LIMITS,
      TASK_LIMITS,
      PM_ITEM,
      {
        ...REVIEW_ITEM,
        stored: { requiredReviews: 3 },
        effective: { ...REVIEW_ITEM.effective, requiredReviews: 3 },
      },
    ] as ConfigItem[];
    renderTab();
    const user = userEvent.setup();
    await screen.findByText(REVIEW_TITLE);

    const restore = screen
      .getAllByRole('button', { name: 'Khôi phục mặc định' })
      .at(-1) as HTMLButtonElement;
    expect(restore).toBeEnabled();
    await user.click(restore);
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Lý do/), 'Quay về cấu hình gốc của hệ thống');
    await user.click(within(dialog).getByRole('button', { name: 'Khôi phục mặc định' }));

    await waitFor(() => expect(resets).toHaveLength(1));
    expect(resets[0]).toEqual({
      key: 'pm.review',
      expectedVersion: 2,
      reason: 'Quay về cấu hình gốc của hệ thống',
    });
  });
});
