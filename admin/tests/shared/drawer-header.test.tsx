/**
 * `Drawer` (kit2) — phần đầu (tiêu đề + nút đóng) chỉ biến mất khi THẬT SỰ không có gì để hiện.
 *
 * Bản cũ viết `hasHeader = !!(title ?? showClose)`: `??` chỉ rơi sang `showClose` khi `title` là
 * null/undefined, nên `title=""` (vd drawer chi tiết đang tải, chưa có tên) làm mất CẢ nút đóng — người
 * dùng kẹt trong một ngăn kéo trống, chỉ thoát được bằng Esc.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Drawer } from '@/shared/ui';

describe('Drawer — phần đầu', () => {
  it('title rỗng nhưng còn nút đóng → vẫn có nút đóng', () => {
    render(
      <Drawer open title="" onOpenChange={vi.fn()}>
        Nội dung
      </Drawer>,
    );
    expect(screen.getByRole('button', { name: 'Đóng' })).toBeInTheDocument();
  });

  it('có title → hiện tiêu đề và nút đóng', () => {
    render(
      <Drawer open title="Hồ sơ người dùng" onOpenChange={vi.fn()}>
        Nội dung
      </Drawer>,
    );
    expect(screen.getByRole('dialog', { name: 'Hồ sơ người dùng' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Đóng' })).toBeInTheDocument();
  });

  it('không title và tắt nút đóng → không có phần đầu', () => {
    render(
      <Drawer open showClose={false} onOpenChange={vi.fn()}>
        Nội dung
      </Drawer>,
    );
    expect(screen.queryByRole('button', { name: 'Đóng' })).not.toBeInTheDocument();
    expect(screen.getByText('Nội dung')).toBeInTheDocument();
  });
});
