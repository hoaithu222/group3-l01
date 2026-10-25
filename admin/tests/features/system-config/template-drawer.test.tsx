/**
 * Ngăn kéo sửa mẫu nhóm (p5-04 admin.md §2.1, §4): dữ liệu hiện đúng, kiểm Zod (khoá/tên trùng sau chuẩn hoá, "Chung"),
 * khoá loại kênh Thoại/Pomodoro theo `capabilities`, lưu bắt buộc lý do + `expectedVersion`, 409 giữ nguyên dữ liệu đang
 * nhập rồi "Tải bản mới", 400 gắn đúng ô, 404 đóng ngăn kéo, chỉ có quyền xem thì form chỉ đọc. Mock ở tầng HTTP (MSW).
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import TemplatesTab from '@/features/system-config/templates/TemplatesTab';
import type { WorkspaceTemplate } from '@/features/system-config/templates/types/templates.types';
import { ERROR_CODE_MESSAGES } from '@/shared/constants/error-codes';
import { useToastStore } from '@/shared/ui/overlays/toast-store';

import { renderWithDataRouter, signIn } from './p3-config-fixtures';
import { channel, COURSE, newTemplateState, templateHandlers } from './template-fixtures';

const state = newTemplateState();
const server = setupServer(...templateHandlers(state));

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers(...templateHandlers(state)));
afterAll(() => server.close());

beforeEach(() => {
  Object.assign(state, newTemplateState());
  useToastStore.setState({ toasts: [] });
  signIn(['system-config:view', 'system-config:update']);
});

type User = ReturnType<typeof userEvent.setup>;

const toastTitles = () => useToastStore.getState().toasts.map((t) => t.title);

/** Mở ngăn kéo của một mẫu từ bảng ("Sửa mẫu …", hoặc "Xem mẫu …" khi chỉ có quyền xem). */
async function openDrawer(templateName: string, verb: 'Sửa' | 'Xem' = 'Sửa'): Promise<User> {
  const user = userEvent.setup();
  renderWithDataRouter(<TemplatesTab />);
  await screen.findByText(templateName);
  await user.click(screen.getByRole('button', { name: `${verb} mẫu ${templateName}` }));
  await screen.findByText(`Mẫu nhóm — ${templateName}`);
  return user;
}

// Nhãn ô bắt buộc có dấu "*" và số hàng ("Khoá kênh 1" là tiền tố của "Khoá kênh 10") ⇒ khớp tiền tố + chặn chữ số kế tiếp.
const rowField = (label: string, n: number) =>
  screen.getByLabelText(new RegExp(`^${label} ${n}(?!\\d)`)) as HTMLInputElement;
const typeSelect = (n: number) =>
  screen.getByRole('combobox', { name: new RegExp(`Loại kênh ${n}(?!\\d)`) });
const templateName = () => screen.getByLabelText(/^Tên mẫu/) as HTMLInputElement;
const saveButton = () => screen.getByRole('button', { name: 'Lưu thay đổi' });

async function setText(user: User, el: HTMLElement, value: string) {
  await user.clear(el);
  await user.type(el, value);
}

/** Bấm Lưu → hộp thoại lý do → nhập lý do → xác nhận. */
async function saveWithReason(user: User, reason: string, name = 'Nhóm môn học') {
  await user.click(saveButton());
  await screen.findByText(`Lưu mẫu "${name}"`);
  await user.type(screen.getByLabelText(/Lý do/), reason);
  await user.click(screen.getByRole('button', { name: 'Lưu mẫu' }));
}

/** Người khác vừa lưu mẫu `course`: phiên bản nhảy lên, có thể kèm nội dung khác. */
const bumpCourse = (over: Partial<WorkspaceTemplate> = {}) => {
  state.templates = state.templates.map((t) =>
    t.code === 'course' ? { ...t, ...over, version: t.version + 1 } : t,
  );
};

describe('ngăn kéo — hiển thị', { timeout: 30_000 }, () => {
  it('hiện dữ liệu của mẫu; mã mẫu chỉ ở tiêu đề (không phải ô nhập); chưa sửa thì nút Lưu khoá', async () => {
    await openDrawer('Nhóm môn học');

    expect(screen.getByText('Mã: course')).toBeInTheDocument();
    expect(templateName()).toHaveValue('Nhóm môn học');
    expect(screen.getByLabelText(/^Mô tả/, { selector: 'textarea' })).toHaveValue(COURSE.description);
    expect(screen.getByText('Kênh của mẫu (3/15)')).toBeInTheDocument();
    expect(rowField('Khoá kênh', 1)).toHaveValue('thong-bao');
    expect(rowField('Tên kênh', 3)).toHaveValue('Bài tập');
    expect(screen.getByRole('combobox', { name: /Chính sách đăng kênh 1/ })).toHaveTextContent(
      'Chỉ quản trị',
    );
    const selected = screen.getAllByRole('checkbox', { name: /Chọn sẵn khi tạo nhóm/ });
    expect(selected).toHaveLength(3);
    expect(selected[0]).toBeChecked();
    expect(selected[2]).not.toBeChecked();
    expect(screen.getByText('Phiên bản 3')).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Mã/)).not.toBeInTheDocument();

    expect(saveButton()).toBeDisabled();
  });

  it('sửa một ô → Lưu mở; gõ lại đúng giá trị cũ (dù thừa khoảng trắng) → khoá lại', async () => {
    const user = await openDrawer('Nhóm môn học');

    await user.type(templateName(), ' K68');
    expect(saveButton()).toBeEnabled();

    await setText(user, templateName(), '  Nhóm môn học  ');
    expect(saveButton()).toBeDisabled();
  });

  it('giới hạn số kênh: 1 kênh thì không xoá được; đầu/cuối danh sách khoá mũi tên; đủ 15 thì khoá "Thêm kênh"', async () => {
    const user = await openDrawer('Nhóm môn học');

    expect(screen.getByRole('button', { name: 'Đưa kênh 1 lên trên' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Đưa kênh 3 xuống dưới' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Đưa kênh 2 lên trên' })).toBeEnabled();

    for (let i = 0; i < 12; i += 1) {
      await user.click(screen.getByRole('button', { name: 'Thêm kênh' }));
    }
    expect(screen.getByText('Kênh của mẫu (15/15)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thêm kênh' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Xoá kênh 15' }));
    expect(screen.getByText('Kênh của mẫu (14/15)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thêm kênh' })).toBeEnabled();
  });

  it('mẫu chỉ có 1 kênh → không xoá được, không có chỗ đổi thứ tự', async () => {
    await openDrawer('Nhóm tự học');

    expect(screen.getByRole('button', { name: 'Xoá kênh 1' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Đưa kênh 1 lên trên' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Đưa kênh 1 xuống dưới' })).toBeDisabled();
  });
});

describe('ngăn kéo — kiểm dữ liệu (Zod)', { timeout: 30_000 }, () => {
  it('khoá trùng, khoá sai ký tự, tên "Chung" → lỗi gắn đúng ô; KHÔNG mở hộp thoại lý do, không PUT', async () => {
    const user = await openDrawer('Nhóm môn học');
    await setText(user, rowField('Khoá kênh', 2), 'thong-bao');
    await setText(user, rowField('Khoá kênh', 3), 'Bài Tập');
    await setText(user, rowField('Tên kênh', 3), '  CHÚNG ');
    await user.click(saveButton());

    expect(await screen.findByText('Khoá kênh bị trùng')).toBeInTheDocument();
    expect(screen.getByText('Khoá chỉ gồm a-z, 0-9 và dấu gạch ngang')).toBeInTheDocument();
    expect(
      screen.getByText('Không dùng tên "Chung" — kênh mặc định tự tạo cùng nhóm'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Lưu mẫu "Nhóm môn học"')).not.toBeInTheDocument();
    expect(state.puts).toEqual([]);
  });

  it('tên kênh trùng SAU chuẩn hoá ("Thảo luận" ≡ " thao LUAN ") và tên mẫu để trống → báo lỗi', async () => {
    const user = await openDrawer('Nhóm môn học');
    await setText(user, rowField('Tên kênh', 3), ' thao LUAN ');
    await user.clear(templateName());
    await user.click(saveButton());

    expect(await screen.findByText('Tên kênh bị trùng trong mẫu')).toBeInTheDocument();
    expect(screen.getByText('Nhập tên mẫu')).toBeInTheDocument();
    expect(state.puts).toEqual([]);
  });
});

describe('ngăn kéo — loại kênh theo capabilities', { timeout: 30_000 }, () => {
  it('phân hệ Thoại/Pomodoro tắt → hai loại đó bị khoá kèm lý do; hàng đã mang loại thoại vẫn hiện đúng giá trị', async () => {
    const user = await openDrawer('Đồ án');
    // Hàng 2 của mẫu Đồ án là kênh thoại (bản seed): vẫn hiện nguyên, không bị đổi thầm sang loại khác.
    expect(typeSelect(2)).toHaveTextContent('Thoại');

    await user.click(typeSelect(1));
    expect(await screen.findByRole('option', { name: /^Văn bản/ })).not.toHaveAttribute(
      'data-disabled',
    );
    const voice = screen.getByRole('option', { name: /^Thoại/ });
    expect(voice).toHaveAttribute('data-disabled');
    expect(voice).toHaveTextContent('Phân hệ thoại đang tắt');
    const pomodoro = screen.getByRole('option', { name: /^Pomodoro/ });
    expect(pomodoro).toHaveAttribute('data-disabled');
    expect(pomodoro).toHaveTextContent('Phòng Pomodoro đang tắt');
  });

  it('phân hệ Thoại BẬT → chọn được "Thoại" (Pomodoro vẫn khoá vì phân hệ đó tắt)', async () => {
    state.voiceEnabled = true;
    const user = await openDrawer('Nhóm môn học');

    await user.click(typeSelect(2));
    await waitFor(() =>
      expect(screen.getByRole('option', { name: /^Thoại/ })).not.toHaveAttribute('data-disabled'),
    );
    expect(screen.getByRole('option', { name: /^Pomodoro/ })).toHaveAttribute('data-disabled');

    await user.click(screen.getByRole('option', { name: /^Thoại/ }));
    expect(typeSelect(2)).toHaveTextContent('Thoại');
    expect(saveButton()).toBeEnabled();
  });
});

describe('ngăn kéo — lưu', { timeout: 30_000 }, () => {
  it('bắt buộc lý do ≥ 10 ký tự; chỉ gửi trường đã đổi kèm expectedVersion; xong thì hiện phiên bản mới', async () => {
    const user = await openDrawer('Nhóm môn học');
    await setText(user, templateName(), '  Nhóm môn học K68 ');
    await user.click(saveButton());

    // Hộp thoại nêu tác động và các trường đổi.
    expect(await screen.findByText('Lưu mẫu "Nhóm môn học"')).toBeInTheDocument();
    expect(
      screen.getByText('Chỉ áp dụng cho nhóm tạo sau; nhóm đã tạo không đổi.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Thay đổi: tên.')).toBeInTheDocument();

    // Lý do trống → chặn, không PUT.
    await user.click(screen.getByRole('button', { name: 'Lưu mẫu' }));
    expect(await screen.findByText('Lý do tối thiểu 10 ký tự')).toBeInTheDocument();
    expect(state.puts).toEqual([]);

    await user.type(screen.getByLabelText(/Lý do/), 'Đổi tên mẫu cho khoá K68');
    await user.click(screen.getByRole('button', { name: 'Lưu mẫu' }));

    await waitFor(() => expect(state.puts).toHaveLength(1));
    expect(state.puts[0]).toEqual({
      code: 'course',
      body: { name: 'Nhóm môn học K68', expectedVersion: 3, reason: 'Đổi tên mẫu cho khoá K68' },
    });
    expect(toastTitles()).toContain('Đã lưu mẫu và ghi nhật ký');
    expect(await screen.findByText('Phiên bản 4')).toBeInTheDocument();
    expect(templateName()).toHaveValue('Nhóm môn học K68');
    expect(saveButton()).toBeDisabled(); // form đã khớp bản mới
  });

  it('thêm kênh + đổi thứ tự → PUT `channels` đủ trường, theo thứ tự mới, gồm hàng mới đã cắt khoảng trắng', async () => {
    const user = await openDrawer('Nhóm môn học');
    await user.click(screen.getByRole('button', { name: 'Thêm kênh' }));
    expect(screen.getByText('Kênh của mẫu (4/15)')).toBeInTheDocument();
    await setText(user, rowField('Khoá kênh', 4), 'ho-tro');
    await setText(user, rowField('Tên kênh', 4), ' Hỗ trợ ');
    await user.click(screen.getByRole('button', { name: 'Đưa kênh 4 lên trên' }));
    expect(rowField('Khoá kênh', 3)).toHaveValue('ho-tro');
    expect(rowField('Khoá kênh', 4)).toHaveValue('bai-tap');

    await user.click(saveButton());
    expect(await screen.findByText('Thay đổi: danh sách kênh.')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Lý do/), 'Thêm kênh hỗ trợ trước kênh bài tập');
    await user.click(screen.getByRole('button', { name: 'Lưu mẫu' }));

    await waitFor(() => expect(state.puts).toHaveLength(1));
    const { body } = state.puts[0];
    expect(Object.keys(body).sort()).toEqual(['channels', 'expectedVersion', 'reason']);
    expect(body.expectedVersion).toBe(3);
    expect(body.channels?.map((c) => c.key)).toEqual([
      'thong-bao',
      'thao-luan',
      'ho-tro',
      'bai-tap',
    ]);
    expect(body.channels?.[2]).toEqual(channel('ho-tro', 'Hỗ trợ'));
    expect(body.channels?.[3]).toEqual(COURSE.channels[2]);
  });

  it('409: banner "Dữ liệu đã thay đổi", GIỮ giá trị đang nhập; "Tải bản mới" → lưu tiếp với phiên bản mới', async () => {
    const user = await openDrawer('Nhóm môn học');
    await setText(user, templateName(), 'Nhóm môn học K68');
    // Trong lúc đang sửa, người khác lưu mẫu (v3 → v4) và đổi mô tả.
    bumpCourse({ description: 'Mô tả do quản trị viên khác cập nhật' });
    await saveWithReason(user, 'Đổi tên mẫu cho khoá K68');

    expect(await screen.findByText('Dữ liệu đã thay đổi')).toBeInTheDocument();
    expect(state.puts).toHaveLength(1);
    expect(state.puts[0].body.expectedVersion).toBe(3);
    expect(templateName()).toHaveValue('Nhóm môn học K68'); // không mất chữ đã gõ
    expect(screen.queryByText('Lưu mẫu "Nhóm môn học"')).not.toBeInTheDocument(); // hộp thoại đã đóng
    expect(toastTitles()).toEqual([]); // 409 có giao diện riêng, không toast chung

    await user.click(screen.getByRole('button', { name: 'Tải bản mới' }));
    await waitFor(() => expect(screen.queryByText('Dữ liệu đã thay đổi')).not.toBeInTheDocument());
    // Ô chưa sửa theo bản mới, ô đang sửa giữ nguyên.
    expect(screen.getByLabelText(/^Mô tả/, { selector: 'textarea' })).toHaveValue(
      'Mô tả do quản trị viên khác cập nhật',
    );
    expect(templateName()).toHaveValue('Nhóm môn học K68');
    expect(screen.getByText('Phiên bản 4')).toBeInTheDocument();

    await saveWithReason(user, 'Đổi tên mẫu cho khoá K68 (lần hai)');
    await waitFor(() => expect(state.puts).toHaveLength(2));
    expect(state.puts[1].body).toEqual({
      name: 'Nhóm môn học K68',
      expectedVersion: 4,
      reason: 'Đổi tên mẫu cho khoá K68 (lần hai)',
    });
    expect(await screen.findByText('Phiên bản 5')).toBeInTheDocument();
  });

  it('400 VAL_001 có `details` theo trường → lỗi của BE hiện ngay dưới đúng ô, ngăn kéo vẫn mở', async () => {
    const user = await openDrawer('Nhóm môn học');
    await setText(user, templateName(), 'Nhóm môn học K68');
    state.putError = {
      status: 400,
      code: 'VAL_001',
      message: 'Dữ liệu không hợp lệ',
      details: { name: ['Tên mẫu đã được dùng cho một mẫu khác'] },
    };
    await saveWithReason(user, 'Đổi tên mẫu cho khoá K68');

    expect(await screen.findByText('Tên mẫu đã được dùng cho một mẫu khác')).toBeInTheDocument();
    expect(screen.getByText('Mẫu nhóm — Nhóm môn học')).toBeInTheDocument();
    expect(templateName()).toHaveValue('Nhóm môn học K68');
    expect(toastTitles()).toEqual([]);
  });

  it('400 VAL_001 không chỉ ra trường → thông điệp của BE hiện ở cuối form', async () => {
    const user = await openDrawer('Nhóm môn học');
    await setText(user, templateName(), 'Nhóm môn học K68');
    state.putError = { status: 400, code: 'VAL_001', message: 'Kênh thứ 2 không hợp lệ' };
    await saveWithReason(user, 'Đổi tên mẫu cho khoá K68');

    expect(await screen.findByText('Kênh thứ 2 không hợp lệ')).toHaveAttribute('role', 'alert');
  });

  it('404 TPL_001 (mẫu đã biến mất) → toast và đóng ngăn kéo', async () => {
    const user = await openDrawer('Nhóm môn học');
    await setText(user, templateName(), 'Nhóm môn học K68');
    state.putError = { status: 404, code: 'TPL_001' };
    await saveWithReason(user, 'Đổi tên mẫu cho khoá K68');

    await waitFor(() =>
      expect(screen.queryByText('Mẫu nhóm — Nhóm môn học')).not.toBeInTheDocument(),
    );
    expect(toastTitles()).toContain(ERROR_CODE_MESSAGES.TPL_001);
  });

  it('lỗi khác (403): toast thông điệp BE, hộp thoại GIỮ mở kèm lý do đã gõ → bấm lại là lưu được', async () => {
    const user = await openDrawer('Nhóm môn học');
    await setText(user, templateName(), 'Nhóm môn học K68');
    state.putError = { status: 403, code: 'AUTH_005' };
    await saveWithReason(user, 'Đổi tên mẫu cho khoá K68');

    await waitFor(() => expect(toastTitles()).toContain(ERROR_CODE_MESSAGES.AUTH_005));
    expect(screen.getByText('Lưu mẫu "Nhóm môn học"')).toBeInTheDocument();
    expect(screen.getByLabelText(/Lý do/)).toHaveValue('Đổi tên mẫu cho khoá K68');

    state.putError = null;
    await user.click(screen.getByRole('button', { name: 'Lưu mẫu' }));
    await waitFor(() => expect(state.puts).toHaveLength(2));
    expect(await screen.findByText('Phiên bản 4')).toBeInTheDocument();
  });
});

describe('ngăn kéo — chỉ có quyền xem', { timeout: 30_000 }, () => {
  it('form chỉ đọc: không ô nhập, không Lưu/Thêm/Xoá/Đổi thứ tự; nói rõ cần system-config:update', async () => {
    signIn(['system-config:view']);
    await openDrawer('Nhóm môn học', 'Xem');
    const dialog = within(screen.getByRole('dialog'));

    expect(dialog.getByText(/Bạn chỉ có quyền xem/)).toBeInTheDocument();
    expect(dialog.getByText('Nhóm môn học')).toBeInTheDocument();
    expect(dialog.getByText('thong-bao')).toBeInTheDocument();
    expect(dialog.queryByRole('textbox')).not.toBeInTheDocument();
    expect(dialog.queryByRole('combobox')).not.toBeInTheDocument();
    expect(dialog.queryByRole('button', { name: 'Lưu thay đổi' })).not.toBeInTheDocument();
    expect(dialog.queryByRole('button', { name: 'Thêm kênh' })).not.toBeInTheDocument();
    expect(dialog.queryAllByRole('button', { name: /^(Xoá|Đưa) kênh/ })).toHaveLength(0);
  });
});

describe('ngăn kéo — nhật ký thay đổi', { timeout: 30_000 }, () => {
  // Nút thu gọn/mở rộng phải NÓI trạng thái của nó: chỉ đổi icon mũi tên thì người dùng trình đọc màn hình không biết
  // vùng nhật ký đang đóng hay mở (`ConfigGroupCard`/`JsonConfigCard` đã có `aria-expanded`, ngăn kéo này thì thiếu).
  it('nút "Nhật ký thay đổi" báo thu gọn/mở rộng bằng aria-expanded và đổi theo mỗi lần bấm', async () => {
    signIn(['system-config:view', 'system-config:update', 'audit-log:view']);
    const user = await openDrawer('Đồ án');
    const toggle = screen.getByRole('button', { name: 'Nhật ký thay đổi' });

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('mở "Nhật ký thay đổi" mới gọi /audit-logs, lọc theo targetType=WorkspaceTemplate và targetId=<mã mẫu>', async () => {
    signIn(['system-config:view', 'system-config:update', 'audit-log:view']);
    const user = await openDrawer('Đồ án');
    expect(state.auditSearches).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'Nhật ký thay đổi' }));

    await waitFor(() => expect(state.auditSearches.length).toBeGreaterThan(0));
    const params = new URLSearchParams(state.auditSearches[0]);
    expect(params.get('targetType')).toBe('WorkspaceTemplate');
    expect(params.get('targetId')).toBe('capstone');
  });
});
