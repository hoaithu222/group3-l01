/**
 * CommandPalette — hộp thoại tìm nhanh toàn cục (⌘K).
 *
 * Bốn điều bài kiểm này khoá lại:
 *  1. Đóng mặc định — không bật `isOpen` từ ngoài thì không render nội dung
 *     (Radix `Dialog.Content` không mount khi `open=false`).
 *  2. Mở qua store thì thấy đúng danh sách `groups` truyền vào.
 *  3. Gõ tìm kiếm BỎ DẤU vẫn lọc đúng (`matchesSearch`) — cùng lớp kiểm
 *     "gõ không dấu vẫn ra kết quả" mà `docs/rules/search-matching.md` yêu cầu.
 *  4. Bấm một mục thì gọi `onSelect` VÀ tự đóng hộp thoại.
 *
 * ⚠️ Mở store TRƯỚC `render()` (không phải sau): mount thẳng ở trạng thái mở
 * tránh phải chạy qua transition đóng→mở của Radix `Presence` giữa lúc test
 * đang chạy — thứ hay kêu "not wrapped in act(...)" trong jsdom vì animation
 * thật không tồn tại ở đó.
 */
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CommandPalette, useCommandPaletteStore } from '@/shared/widgets/command-palette';
import type { CommandPaletteGroup } from '@/shared/widgets/command-palette';

function makeGroups(onSelectHome: () => void, onSelectSettings: () => void): CommandPaletteGroup[] {
  return [
    {
      label: 'Điều hướng chung',
      items: [
        { id: 'home', label: 'Trang chủ', iconName: 'house-outline', onSelect: onSelectHome },
        { id: 'settings', label: 'Cài đặt', iconName: 'gear-outline', onSelect: onSelectSettings },
        { id: 'demo', label: 'Đông Đô Plaza', iconName: 'grid-2-outline', onSelect: vi.fn() },
      ],
    },
  ];
}

describe('CommandPalette', () => {
  afterEach(() => {
    act(() => useCommandPaletteStore.getState().close());
  });

  it('không render khi store đóng', () => {
    render(<CommandPalette groups={makeGroups(vi.fn(), vi.fn())} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('mở qua store thì hiện danh sách groups', async () => {
    act(() => useCommandPaletteStore.getState().open());
    render(<CommandPalette groups={makeGroups(vi.fn(), vi.fn())} />);

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    expect(screen.getByText('Trang chủ')).toBeInTheDocument();
    expect(screen.getByText('Cài đặt')).toBeInTheDocument();
  });

  it('gõ không dấu vẫn lọc ra mục có dấu (matchesSearch)', async () => {
    const user = userEvent.setup();
    act(() => useCommandPaletteStore.getState().open());
    render(<CommandPalette groups={makeGroups(vi.fn(), vi.fn())} />);
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

    await user.type(screen.getByRole('textbox'), 'dong do');

    expect(screen.getByText('Đông Đô Plaza')).toBeInTheDocument();
    expect(screen.queryByText('Trang chủ')).not.toBeInTheDocument();
  });

  it('bấm một mục thì gọi onSelect và tự đóng', async () => {
    const user = userEvent.setup();
    const onSelectHome = vi.fn();
    act(() => useCommandPaletteStore.getState().open());
    render(<CommandPalette groups={makeGroups(onSelectHome, vi.fn())} />);
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

    await user.click(screen.getByText('Trang chủ'));

    expect(onSelectHome).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(useCommandPaletteStore.getState().isOpen).toBe(false));
  });
});
