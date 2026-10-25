/**
 * Tab "Mẫu nhóm" của `system-config` (p5-04 admin.md §2.1, §4): bảng mẫu (mã mono, tên, số kênh, trạng thái CHỮ, cập nhật
 * lúc/bởi), quyền xem/sửa, trạng thái tải/lỗi/rỗng và KÉO-THẢ đổi thứ tự (hộp thoại lý do → mỗi mẫu đổi chỗ một `PUT`
 * kèm `expectedVersion` riêng; huỷ thì về thứ tự cũ; 409 không ghi đè). Mock ở tầng HTTP (MSW).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { useTemplateReorder } from '@/features/system-config/templates/hooks/useTemplateReorder';
import TemplatesTab from '@/features/system-config/templates/TemplatesTab';
import { ERROR_CODE_MESSAGES } from '@/shared/constants/error-codes';
import { useToastStore } from '@/shared/ui/overlays/toast-store';

import { renderWithDataRouter, signIn } from './p3-config-fixtures';
import { freshTemplates, newTemplateState, templateHandlers } from './template-fixtures';

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

const toastTitles = () => useToastStore.getState().toasts.map((t) => t.title);

describe('bảng mẫu nhóm', { timeout: 30_000 }, () => {
  it('hiện mã (chỉ đọc), tên, số kênh, trạng thái bằng CHỮ, cập nhật lúc/bởi — theo thứ tự `order`', async () => {
    renderWithDataRouter(<TemplatesTab />);

    expect(await screen.findByText('Nhóm môn học')).toBeInTheDocument();
    const rows = screen.getAllByRole('row').slice(1); // bỏ hàng tiêu đề
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('course');
    expect(rows[0]).toHaveTextContent('Nhóm môn học');
    expect(rows[1]).toHaveTextContent('capstone');
    expect(rows[2]).toHaveTextContent('self-study');

    // số kênh
    expect(rows[0]).toHaveTextContent('3');
    expect(rows[1]).toHaveTextContent('2');
    expect(rows[2]).toHaveTextContent('1');
    // trạng thái bằng chữ
    expect(screen.getAllByText('Đang bật')).toHaveLength(2);
    expect(screen.getByText('Đã tắt')).toBeInTheDocument();
    // cập nhật bởi: bản seed vs người sửa (id rút gọn, id đầy đủ ở title)
    expect(screen.getAllByText('Bản seed')).toHaveLength(2);
    expect(screen.getByText('bởi …293a99')).toHaveAttribute('title', '64a1b2c3d4e5f60718293a99');
    // mã mẫu không phải ô nhập
    expect(screen.queryByRole('textbox', { name: /Mã/ })).not.toBeInTheDocument();
  });

  it('có system-config:update → tay cầm kéo ở mỗi dòng và nút "Sửa"', async () => {
    renderWithDataRouter(<TemplatesTab />);
    await screen.findByText('Nhóm môn học');

    expect(screen.getAllByRole('button', { name: 'Kéo để sắp xếp' })).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Sửa mẫu Đồ án' })).toBeInTheDocument();
  });

  it('chỉ có system-config:view → KHÔNG tay cầm kéo, nút đổi thành "Xem"', async () => {
    signIn(['system-config:view']);
    renderWithDataRouter(<TemplatesTab />);
    await screen.findByText('Nhóm môn học');

    expect(screen.queryByRole('button', { name: 'Kéo để sắp xếp' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Sửa mẫu/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xem mẫu Nhóm môn học' })).toBeInTheDocument();
  });

  it('danh sách rỗng → hướng dẫn seed; lỗi tải → "Thử lại" tải lại được', async () => {
    state.templates = [];
    const first = renderWithDataRouter(<TemplatesTab />);
    expect(await screen.findByText('Chưa có mẫu nhóm')).toBeInTheDocument();
    first.unmount();

    state.templates = freshTemplates();
    state.listStatus = 500;
    renderWithDataRouter(<TemplatesTab />);
    expect(await screen.findByText('Không tải được danh sách mẫu nhóm')).toBeInTheDocument();

    state.listStatus = 200;
    await userEvent.setup().click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Nhóm môn học')).toBeInTheDocument();
  });
});

describe('đổi thứ tự (useTemplateReorder)', { timeout: 30_000 }, () => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      {children}
    </QueryClientProvider>
  );
  const setup = (canEdit = true) =>
    renderHook(() => useTemplateReorder(state.templates, canEdit), { wrapper });

  it('thả dòng: bảng hiện thứ tự mới NGAY nhưng chưa ghi; hộp thoại lý do mở kèm thứ tự mới', () => {
    const { result } = setup();
    act(() => result.current.handleReorder('capstone', 'course'));

    expect(result.current.rows.map((t) => t.code)).toEqual(['capstone', 'course', 'self-study']);
    expect(result.current.isOpen).toBe(true);
    expect(result.current.sequence).toBe('Đồ án → Nhóm môn học → Nhóm tự học');
    expect(state.puts).toEqual([]);
  });

  it('xác nhận: PUT TUẦN TỰ chỉ các mẫu đổi `order`, mỗi mẫu kèm expectedVersion và lý do của nó', async () => {
    const { result } = setup();
    act(() => result.current.handleReorder('capstone', 'course'));
    await act(async () => result.current.confirm('Ưu tiên mẫu Đồ án lên đầu danh sách'));

    expect(state.puts.map((p) => [p.code, p.body.order, p.body.expectedVersion, p.body.reason])).toEqual([
      ['capstone', 1, 5, 'Ưu tiên mẫu Đồ án lên đầu danh sách'],
      ['course', 2, 3, 'Ưu tiên mẫu Đồ án lên đầu danh sách'],
    ]);
    expect(state.puts.every((p) => Object.keys(p.body).sort().join() === 'expectedVersion,order,reason')).toBe(true);
    expect(toastTitles()).toContain('Đã lưu thứ tự mẫu và ghi nhật ký');
    // Xong việc: hộp thoại đóng, bản kéo dở bị xoá — bảng lại theo danh sách server (ở tab: được tải lại sau khi ghi).
    expect(result.current.isOpen).toBe(false);
    expect(result.current.rows).toBe(state.templates);
  });

  it('huỷ: về thứ tự cũ, không PUT; thả lại đúng chỗ cũ / khi chỉ có quyền xem → không mở gì', () => {
    const { result } = setup();
    act(() => result.current.handleReorder('self-study', 'course'));
    expect(result.current.isOpen).toBe(true);
    act(() => result.current.cancel());
    expect(result.current.isOpen).toBe(false);
    expect(result.current.rows.map((t) => t.code)).toEqual(['course', 'capstone', 'self-study']);
    expect(state.puts).toEqual([]);

    act(() => result.current.handleReorder('course', 'course'));
    expect(result.current.isOpen).toBe(false);

    const readOnly = setup(false);
    act(() => readOnly.result.current.handleReorder('capstone', 'course'));
    expect(readOnly.result.current.isOpen).toBe(false);
  });

  it('409 giữa chừng: dừng, báo "người khác đã sửa", bỏ bản kéo dở (KHÔNG ghi đè)', async () => {
    const { result } = setup();
    act(() => result.current.handleReorder('capstone', 'course'));
    state.putError = { status: 409, code: 'RES_003' };
    await act(async () => result.current.confirm('Đổi thứ tự khi đang có người khác sửa'));

    expect(state.puts).toHaveLength(1); // dừng ở lỗi đầu tiên
    expect(toastTitles().join(' ')).toMatch(/người khác thay đổi/);
    expect(result.current.rows.map((t) => t.code)).toEqual(['course', 'capstone', 'self-study']);
  });

  it('lỗi khác (403): ném lại để hộp thoại giữ mở và thử lại được; bản kéo dở còn nguyên; toast thông điệp BE', async () => {
    const { result } = setup();
    act(() => result.current.handleReorder('capstone', 'course'));
    state.putError = { status: 403, code: 'AUTH_005' };
    let caught: unknown;
    await act(async () => {
      try {
        await result.current.confirm('Thử lưu khi vừa bị thu quyền sửa');
      } catch (err) {
        caught = err;
      }
    });
    expect(caught).toBeDefined();

    expect(result.current.rows.map((t) => t.code)).toEqual(['capstone', 'course', 'self-study']);
    expect(toastTitles()).toContain(ERROR_CODE_MESSAGES.AUTH_005);
    expect(result.current.isOpen).toBe(true);
  });
});

describe('kéo-thả trên bảng (dnd-kit, bàn phím)', { timeout: 30_000 }, () => {
  /** jsdom không có layout: cho mỗi <tr> một khung chữ nhật xếp dọc để dnd-kit tính được hướng di chuyển. */
  function stubRowRects() {
    return vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const tr = this.closest('tr');
      const index = tr?.parentElement ? Array.from(tr.parentElement.children).indexOf(tr) : 0;
      const top = index * 40;
      return { top, bottom: top + 40, left: 0, right: 600, width: 600, height: 40, x: 0, y: top } as DOMRect;
    });
  }

  it('nhấc bằng Space, ↓, thả bằng Space → hộp thoại lý do với thứ tự mới; xác nhận → PUT', async () => {
    const spy = stubRowRects();
    try {
      const user = userEvent.setup();
      renderWithDataRouter(<TemplatesTab />);
      await screen.findByText('Nhóm môn học');

      const handles = screen.getAllByRole('button', { name: 'Kéo để sắp xếp' });
      handles[0].focus();
      await user.keyboard(' ');
      await user.keyboard('{ArrowDown}');
      await user.keyboard(' ');

      expect(await screen.findByText('Đổi thứ tự mẫu nhóm')).toBeInTheDocument();
      expect(screen.getByText(/Thứ tự mới: Đồ án → Nhóm môn học → Nhóm tự học/)).toBeInTheDocument();
      // Bảng đã hiện thứ tự mới nhưng CHƯA lưu.
      expect(state.puts).toEqual([]);

      await user.type(screen.getByLabelText(/Lý do/), 'Đưa mẫu Đồ án lên trước mẫu môn học');
      await user.click(screen.getByRole('button', { name: 'Lưu thứ tự' }));
      await waitFor(() => expect(state.puts).toHaveLength(2));
      expect(state.puts.map((p) => p.code)).toEqual(['capstone', 'course']);
    } finally {
      spy.mockRestore();
    }
  });

  it('huỷ hộp thoại → bảng trở về thứ tự cũ, không PUT', async () => {
    const spy = stubRowRects();
    try {
      const user = userEvent.setup();
      renderWithDataRouter(<TemplatesTab />);
      await screen.findByText('Nhóm môn học');

      screen.getAllByRole('button', { name: 'Kéo để sắp xếp' })[0].focus();
      await user.keyboard(' ');
      await user.keyboard('{ArrowDown}');
      await user.keyboard(' ');
      await screen.findByText('Đổi thứ tự mẫu nhóm');

      await user.click(screen.getByRole('button', { name: 'Hủy bỏ' }));
      await waitFor(() => expect(screen.queryByText('Đổi thứ tự mẫu nhóm')).not.toBeInTheDocument());
      const rows = screen.getAllByRole('row').slice(1);
      expect(rows[0]).toHaveTextContent('course');
      expect(state.puts).toEqual([]);
    } finally {
      spy.mockRestore();
    }
  });
});
