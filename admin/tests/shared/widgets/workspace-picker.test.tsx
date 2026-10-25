/**
 * `WorkspacePicker` (widget dùng chung) — ô chọn workspace, gộp từ hai bản gần y hệt: `WorkspacePicker` của
 * gamification (bắt buộc chọn một nhóm, có "Tải thêm") và `StorageWorkspaceFilter` của cấu hình hệ thống (bộ lọc có
 * dòng "Toàn hệ thống", chỉ 8 nhóm đầu, không "Tải thêm").
 *
 * Bài này khoá phần RIÊNG của bản gộp: chế độ bộ lọc (`allLabel`) vs chế độ bắt buộc chọn, kiểu `null` của `onChange`,
 * và việc bộ lọc cũng có "Tải thêm". Hành vi tìm/phân trang/lỗi chi tiết đã có ở `leaderboard-tab.test.tsx` và
 * `storage-tab.test.tsx`. Mock ở tầng HTTP (MSW).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { WorkspacePicker, type WorkspaceOption } from '@/shared/widgets/workspace-picker';

const WORKSPACES: WorkspaceOption[] = Array.from({ length: 25 }, (_, i) => ({
  id: `ws-${i + 1}`,
  name: `Nhóm ${String(i + 1).padStart(2, '0')}`,
}));

const calls: URLSearchParams[] = [];

const server = setupServer(
  http.get('*/admin/workspaces', ({ request }) => {
    const q = new URL(request.url).searchParams;
    calls.push(q);
    const page = Number(q.get('page') ?? 1);
    const limit = Number(q.get('limit') ?? 20);
    return HttpResponse.json({
      success: true,
      data: WORKSPACES.slice((page - 1) * limit, page * limit),
      meta: { page, limit, total: WORKSPACES.length, hasNext: page * limit < WORKSPACES.length },
    });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  calls.length = 0;
});
afterAll(() => server.close());

function renderPicker(props: Partial<React.ComponentProps<typeof WorkspacePicker>> = {}) {
  const onChange = vi.fn();
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <WorkspacePicker value={null} onChange={onChange} {...props} />
    </QueryClientProvider>,
  );
  return { onChange, user: userEvent.setup() };
}

describe('WorkspacePicker — nhãn nút', () => {
  it('chưa chọn: "Chọn workspace" (mặc định) hoặc `placeholder` do nơi dùng đặt', () => {
    const { unmount } = render(
      <QueryClientProvider client={new QueryClient()}>
        <WorkspacePicker value={null} onChange={() => undefined} />
      </QueryClientProvider>,
    );
    expect(screen.getByRole('button', { name: 'Chọn workspace' })).toBeInTheDocument();
    unmount();

    renderPicker({ placeholder: 'Chọn nhóm' });
    expect(screen.getByRole('button', { name: 'Chọn nhóm' })).toBeInTheDocument();
  });

  it('có `allLabel` (chế độ bộ lọc): chưa chọn thì nút mang nhãn đó', () => {
    renderPicker({ allLabel: 'Toàn hệ thống' });
    expect(screen.getByRole('button', { name: 'Toàn hệ thống' })).toBeInTheDocument();
  });

  it('đã chọn: nút mang tên nhóm, không phải nhãn mặc định', () => {
    renderPicker({ allLabel: 'Toàn hệ thống', value: WORKSPACES[2] });
    expect(screen.getByRole('button', { name: 'Nhóm 03' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Toàn hệ thống' })).not.toBeInTheDocument();
  });
});

describe('WorkspacePicker — chọn', () => {
  it('chưa mở thì chưa gọi API; mở ra tải trang 1 (20 nhóm sắp theo tên)', async () => {
    const { user } = renderPicker();
    expect(calls).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Chọn workspace' }));

    expect(await screen.findByRole('button', { name: 'Nhóm 20' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nhóm 21' })).not.toBeInTheDocument();
    expect([calls[0]!.get('page'), calls[0]!.get('limit'), calls[0]!.get('sort')]).toEqual([
      '1',
      '20',
      'name',
    ]);
  });

  it('chế độ bắt buộc chọn: KHÔNG có dòng "bỏ chọn"; bấm một nhóm gọi onChange với nhóm đó', async () => {
    const { onChange, user } = renderPicker();
    await user.click(screen.getByRole('button', { name: 'Chọn workspace' }));
    await screen.findByRole('button', { name: 'Nhóm 01' });
    expect(screen.queryByRole('button', { name: 'Toàn hệ thống' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Nhóm 05' }));

    expect(onChange).toHaveBeenCalledWith({ id: 'ws-5', name: 'Nhóm 05' });
  });

  it('chế độ bộ lọc: có dòng "Toàn hệ thống" đầu danh sách; bấm nó gọi onChange(null) và đóng hộp', async () => {
    const { onChange, user } = renderPicker({ allLabel: 'Toàn hệ thống', value: WORKSPACES[0] });
    await user.click(screen.getByRole('button', { name: 'Nhóm 01' }));
    await screen.findByRole('button', { name: 'Nhóm 02' });

    await user.click(screen.getByRole('button', { name: 'Toàn hệ thống' }));

    expect(onChange).toHaveBeenCalledWith(null);
    await waitFor(() =>
      expect(screen.queryByPlaceholderText('Tìm workspace theo tên…')).not.toBeInTheDocument(),
    );
  });

  it('bộ lọc cũng có "Tải thêm" — không còn kẹt ở 8 nhóm đầu như bản cũ của cấu hình hệ thống', async () => {
    const { user } = renderPicker({ allLabel: 'Toàn hệ thống' });
    await user.click(screen.getByRole('button', { name: 'Toàn hệ thống' }));
    await screen.findByRole('button', { name: 'Nhóm 20' });

    await user.click(screen.getByRole('button', { name: 'Tải thêm' }));

    expect(await screen.findByRole('button', { name: 'Nhóm 25' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tải thêm' })).not.toBeInTheDocument();
    expect(calls.map((c) => c.get('page'))).toEqual(['1', '2']);
  });

  it('ô tìm có tên truy cập, không chỉ placeholder', async () => {
    const { user } = renderPicker();
    await user.click(screen.getByRole('button', { name: 'Chọn workspace' }));

    expect(
      await screen.findByRole('textbox', { name: 'Tìm workspace theo tên' }),
    ).toBeInTheDocument();
  });
});
