/**
 * Tab `pm` (Dự án) của `system-config` — thẻ "Đóng góp — mặc định cho bảng mới" (`pm.contribution`,
 * p4-06 admin.md §2.1, §4): ba trọng số + dòng tổng, số giờ cho phép trễ, điểm thẻ chưa gán story points; tổng ≠ 100
 * chặn gửi, lưu có lý do + `expectedVersion`, 409 giữ giá trị đang nhập; đổi múi giờ (thẻ "Dự án") hiện cảnh báo
 * tính lại trong hộp thoại lý do. Mock ở tầng HTTP (MSW).
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
  type PutBody,
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

const base = { stored: {}, updatedAt: null, updatedBy: null };

/** Khoá `pm` đúng hình dạng BE: mẫu cột (json) + múi giờ (enum). */
const PM_ITEM: ConfigItem = {
  ...base,
  key: 'pm',
  tab: 'pm',
  label: 'Dự án',
  fields: [
    {
      path: 'defaultColumns',
      label: 'Cột mặc định khi tạo bảng',
      kind: 'json',
      default: DEFAULT_COLUMNS,
    },
    {
      path: 'timezone',
      label: 'Múi giờ tính ngày/tuần/tháng (dời lịch, Gantt, báo cáo đóng góp)',
      kind: 'enum',
      options: ['Asia/Ho_Chi_Minh', 'Asia/Bangkok', 'UTC'],
      default: 'Asia/Ho_Chi_Minh',
    },
  ],
  effective: { defaultColumns: DEFAULT_COLUMNS, timezone: 'Asia/Ho_Chi_Minh' },
  version: 4,
};

const CONTRIBUTION_ITEM: ConfigItem = {
  ...base,
  key: 'pm.contribution',
  tab: 'pm',
  label: 'Đóng góp — mặc định cho bảng mới',
  fields: [
    {
      path: 'weights',
      label: 'Trọng số',
      kind: 'json',
      default: { points: 60, onTime: 20, peer: 20 },
    },
    { path: 'onTimeGraceHours', label: 'Cho phép trễ', kind: 'json', default: 0 },
    { path: 'unestimatedPoints', label: 'Điểm thẻ chưa gán', kind: 'json', default: 1 },
  ],
  effective: {
    weights: { points: 60, onTime: 20, peer: 20 },
    onTimeGraceHours: 0,
    unestimatedPoints: 1,
  },
  version: 3,
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
  listItems = [BOARD_LIMITS, TASK_LIMITS, PM_ITEM, CONTRIBUTION_ITEM] as ConfigItem[];
  puts = [];
  resets = [];
  putStatus = null;
  signIn(['system-config:view', 'system-config:update']);
});

const renderTab = () => renderWithDataRouter(<PmTab />);

const input = (label: RegExp) => screen.getByLabelText(label) as HTMLInputElement;
const points = () => input(/^Điểm thẻ \(story points\)/);
const onTime = () => input(/^Đúng hạn/);
const peer = () => input(/^Điểm chấm chéo/);
const grace = () => input(/^Cho phép trễ/);
const unestimated = () => input(/^Điểm cho thẻ chưa gán story points/);
// Thẻ mẫu cột và thẻ đóng góp đều có nút "Lưu"; thẻ đóng góp đứng SAU trong tab.
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

describe('PmTab — thẻ Đóng góp: hiển thị', () => {
  it('hiện ba trọng số 60/20/20, dòng tổng 100 / 100, số giờ trễ và điểm thẻ chưa gán; chưa sửa ⇒ nút Lưu tắt', async () => {
    renderTab();

    expect(await screen.findByText('Đóng góp — mặc định cho bảng mới')).toBeInTheDocument();
    expect(points()).toHaveValue('60');
    expect(onTime()).toHaveValue('20');
    expect(peer()).toHaveValue('20');
    expect(screen.getByText('100 / 100')).toBeInTheDocument();
    expect(screen.queryByText(/Tổng trọng số phải bằng 100/)).not.toBeInTheDocument();
    expect(grace()).toHaveValue('0');
    expect(unestimated()).toHaveValue('1');
    expect(saveButton()).toBeDisabled();
    // Ghi chú phạm vi áp dụng + múi giờ hiện hành (đổi ở thẻ "Dự án").
    expect(screen.getByText(/Chỉ áp cho bảng tạo sau khi lưu/)).toBeInTheDocument();
    expect(
      screen.getByText(/Múi giờ tính ngày\/tuần\/tháng hiện là Asia\/Ho_Chi_Minh/),
    ).toBeInTheDocument();
  });

  it('đọc giá trị hiệu lực của server (không phải mặc định) — 50/30/20, trễ 24 giờ, thẻ chưa gán 0,5', async () => {
    listItems = [
      BOARD_LIMITS,
      TASK_LIMITS,
      PM_ITEM,
      {
        ...CONTRIBUTION_ITEM,
        stored: { weights: { points: 50, onTime: 30, peer: 20 } },
        effective: {
          weights: { points: 50, onTime: 30, peer: 20 },
          onTimeGraceHours: 24,
          unestimatedPoints: 0.5,
        },
      },
    ] as ConfigItem[];
    renderTab();

    await screen.findByText('Đóng góp — mặc định cho bảng mới');
    expect(points()).toHaveValue('50');
    expect(onTime()).toHaveValue('30');
    expect(grace()).toHaveValue('24');
    expect(unestimated()).toHaveValue('0.5');
  });

  it('chỉ xem (thiếu system-config:update) ⇒ không nút lưu/khôi phục, giá trị hiện dạng chữ', async () => {
    signIn(['system-config:view']);
    renderTab();

    expect(await screen.findByText('Đóng góp — mặc định cho bảng mới')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Lưu' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Điểm thẻ \(story points\)/)).not.toBeInTheDocument();
    expect(screen.getByText('100 / 100')).toBeInTheDocument();
  });

  it('BE chưa khai khoá đóng góp ⇒ không có thẻ, các thẻ khác vẫn hoạt động', async () => {
    listItems = [BOARD_LIMITS, TASK_LIMITS, PM_ITEM];
    renderTab();

    expect(await screen.findByText('Bảng công việc')).toBeInTheDocument();
    expect(await screen.findByText('Cột mặc định khi tạo bảng')).toBeInTheDocument();
    expect(screen.queryByText('Đóng góp — mặc định cho bảng mới')).not.toBeInTheDocument();
  });

  it('khoá đóng góp chỉ có field json ⇒ không thành thẻ nhóm thường (không lặp một thẻ thứ hai)', async () => {
    renderTab();
    await screen.findByText('Đóng góp — mặc định cho bảng mới');

    // Ba thẻ nhóm thường (bảng, thẻ, múi giờ của khoá `pm`) — không có thẻ nào thuộc khoá đóng góp.
    expect(screen.getAllByText('Đóng góp — mặc định cho bảng mới')).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Lưu nhóm' })).toHaveLength(3);
  });
});

describe('PmTab — thẻ Đóng góp: kiểm tra', () => {
  it('trọng số 60/20/30 ⇒ lỗi tại dòng tổng (110), KHÔNG mở hộp thoại, KHÔNG gửi', async () => {
    renderTab();
    const user = userEvent.setup();
    await screen.findByText('Đóng góp — mặc định cho bảng mới');

    await setNumber(user, peer(), '30');

    expect(await screen.findByText('110 / 100')).toBeInTheDocument();
    expect(screen.getByText('Tổng trọng số phải bằng 100 (hiện là 110).')).toHaveAttribute(
      'role',
      'alert',
    );
    await user.click(saveButton());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(puts).toHaveLength(0);
  });

  it('sửa lại về 60/20/20 ⇒ lỗi dòng tổng biến mất ngay', async () => {
    renderTab();
    const user = userEvent.setup();
    await screen.findByText('Đóng góp — mặc định cho bảng mới');

    await setNumber(user, peer(), '30');
    expect(await screen.findByText(/Tổng trọng số phải bằng 100/)).toBeInTheDocument();
    await setNumber(user, peer(), '20');

    await waitFor(() =>
      expect(screen.queryByText(/Tổng trọng số phải bằng 100/)).not.toBeInTheDocument(),
    );
    expect(screen.getByText('100 / 100')).toBeInTheDocument();
  });

  it('điểm thẻ chưa gán 0,3 (không phải bội của 0,5) ⇒ lỗi tại ô, không gửi', async () => {
    renderTab();
    const user = userEvent.setup();
    await screen.findByText('Đóng góp — mặc định cho bảng mới');

    await setNumber(user, unestimated(), '0.3');
    await user.click(saveButton());

    expect(await screen.findByText('Điểm phải là bội của 0,5')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(puts).toHaveLength(0);
  });

  it('ô trọng số để trống ⇒ lỗi "Nhập một số", không gửi', async () => {
    renderTab();
    const user = userEvent.setup();
    await screen.findByText('Đóng góp — mặc định cho bảng mới');

    await user.clear(onTime());
    await user.click(saveButton());

    expect(await screen.findByText('Nhập một số')).toBeInTheDocument();
    expect(puts).toHaveLength(0);
  });
});

describe('PmTab — thẻ Đóng góp: lưu', () => {
  it('50/30/20 + trễ 24 giờ → hộp thoại có so sánh trước/sau → lý do ≥ 10 ký tự → PUT { weights, onTimeGraceHours, unestimatedPoints, expectedVersion, reason }', async () => {
    renderTab();
    const user = userEvent.setup();
    await screen.findByText('Đóng góp — mặc định cho bảng mới');

    await setNumber(user, points(), '50');
    await setNumber(user, onTime(), '30');
    await setNumber(user, grace(), '24');
    expect(screen.getByText('100 / 100')).toBeInTheDocument();
    await user.click(saveButton());

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Trước: Trọng số 60 \/ 20 \/ 20/)).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Sau: Trọng số 50 \/ 30 \/ 20 .* cho phép trễ 24 giờ/),
    ).toBeInTheDocument();

    // Lý do ngắn bị chặn.
    await user.type(within(dialog).getByLabelText(/Lý do/), 'ngắn');
    await user.click(within(dialog).getByRole('button', { name: 'Lưu cấu hình' }));
    expect(await screen.findByText('Lý do tối thiểu 10 ký tự')).toBeInTheDocument();
    expect(puts).toHaveLength(0);

    await user.clear(within(dialog).getByLabelText(/Lý do/));
    await user.type(within(dialog).getByLabelText(/Lý do/), 'Nhóm học kỳ mới chú trọng đúng hạn');
    await user.click(within(dialog).getByRole('button', { name: 'Lưu cấu hình' }));

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({
      key: 'pm.contribution',
      value: {
        weights: { points: 50, onTime: 30, peer: 20 },
        onTimeGraceHours: 24,
        unestimatedPoints: 1,
      },
      expectedVersion: 3,
      reason: 'Nhóm học kỳ mới chú trọng đúng hạn',
    });
    // Lưu xong: form theo bản mới, nút Lưu tắt lại.
    await waitFor(() => expect(saveButton()).toBeDisabled());
    expect(points()).toHaveValue('50');
  });

  it('điểm thẻ chưa gán 0,5 được gửi đúng số thập phân', async () => {
    renderTab();
    const user = userEvent.setup();
    await screen.findByText('Đóng góp — mặc định cho bảng mới');

    await setNumber(user, unestimated(), '0.5');
    await user.click(saveButton());
    await confirmWithReason(user, 'Thẻ chưa ước lượng tính nửa điểm');

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].value).toEqual({
      weights: { points: 60, onTime: 20, peer: 20 },
      onTimeGraceHours: 0,
      unestimatedPoints: 0.5,
    });
  });

  it('409 RES_003 ⇒ banner "vừa được người khác thay đổi", giữ giá trị đang nhập', async () => {
    putStatus = { status: 409, code: 'RES_003' };
    renderTab();
    const user = userEvent.setup();
    await screen.findByText('Đóng góp — mặc định cho bảng mới');

    await setNumber(user, grace(), '12');
    await user.click(saveButton());
    await confirmWithReason(user, 'Cho trễ nửa ngày với bảng nhóm');

    expect(await screen.findByText('Cấu hình vừa được người khác thay đổi')).toBeInTheDocument();
    expect(grace()).toHaveValue('12');
    expect(puts).toHaveLength(1);
  });

  it('"Khôi phục mặc định" chỉ bật khi đã có override; cần lý do rồi POST reset { expectedVersion, reason }', async () => {
    listItems = [
      BOARD_LIMITS,
      TASK_LIMITS,
      PM_ITEM,
      {
        ...CONTRIBUTION_ITEM,
        stored: { onTimeGraceHours: 24 },
        effective: { ...CONTRIBUTION_ITEM.effective, onTimeGraceHours: 24 },
      },
    ] as ConfigItem[];
    renderTab();
    const user = userEvent.setup();
    await screen.findByText('Đóng góp — mặc định cho bảng mới');

    const restore = screen
      .getAllByRole('button', { name: 'Khôi phục mặc định' })
      .at(-1) as HTMLButtonElement;
    expect(restore).toBeEnabled();
    await user.click(restore);
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Lý do/), 'Quay về công thức gốc của hệ thống');
    await user.click(within(dialog).getByRole('button', { name: 'Khôi phục mặc định' }));

    await waitFor(() => expect(resets).toHaveLength(1));
    expect(resets[0]).toEqual({
      key: 'pm.contribution',
      expectedVersion: 3,
      reason: 'Quay về công thức gốc của hệ thống',
    });
  });
});

describe('PmTab — đổi múi giờ (thẻ "Dự án")', () => {
  it('đổi múi giờ → "Lưu nhóm" → hộp thoại lý do có cảnh báo tính lại heatmap và báo cáo tuần/tháng', async () => {
    renderTab();
    const user = userEvent.setup();
    await screen.findByText('Đóng góp — mặc định cho bảng mới');

    await user.click(screen.getByRole('combobox', { name: /Múi giờ tính ngày\/tuần\/tháng/ }));
    await user.click(await screen.findByRole('option', { name: 'Asia/Bangkok' }));
    const save = screen
      .getAllByRole('button', { name: 'Lưu nhóm' })
      .find((b) => !(b as HTMLButtonElement).disabled);
    await user.click(save as HTMLElement);

    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(/Đổi múi giờ làm dịch ranh giới ngày, tuần và tháng/),
    ).toBeInTheDocument();
    expect(within(dialog).getByText(/được tính lại theo múi giờ mới/)).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText(/Lý do/), 'Chuyển hệ thống sang giờ Bangkok');
    await user.click(within(dialog).getByRole('button', { name: 'Lưu cấu hình' }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toMatchObject({
      key: 'pm',
      value: { timezone: 'Asia/Bangkok' },
      expectedVersion: 4,
    });
  });

  it('thẻ Đóng góp không có ô múi giờ riêng — chỉ nhắc múi giờ hiện hành', async () => {
    renderTab();
    await screen.findByText('Đóng góp — mặc định cho bảng mới');

    expect(screen.getAllByRole('combobox', { name: /Múi giờ/ })).toHaveLength(1);
  });
});
