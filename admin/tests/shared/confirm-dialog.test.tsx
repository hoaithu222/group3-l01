/**
 * `ConfirmDialog` (kit2) — nhãn nút hành động MẶC ĐỊNH theo từng mức.
 *
 * Mức `info` từng mặc định nhãn "OK": tiếng Anh giữa giao diện tiếng Việt và không nói nút làm gì
 * (`interaction-ux.md §6` cấm nhãn "OK"). Nay là "Đồng ý"; nơi gọi biết ngữ cảnh thì truyền `actionLabel`.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ConfirmDialog, type ConfirmDialogVariant } from '@/shared/ui';

const renderDialog = (props: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) =>
  render(
    <ConfirmDialog
      description="Nội dung xác nhận"
      open
      title="Tiêu đề"
      onOpenChange={() => undefined}
      {...props}
    />,
  );

describe('ConfirmDialog — nhãn nút hành động mặc định', () => {
  it('mức info: "Đồng ý", không còn "OK"', () => {
    renderDialog({ variant: 'info' });

    expect(screen.getByRole('button', { name: 'Đồng ý' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'OK' })).not.toBeInTheDocument();
  });

  it.each<[ConfirmDialogVariant, string]>([
    ['confirm', 'Xác nhận'],
    ['delete', 'Xóa'],
    ['success', 'Xác nhận'],
    ['warning', 'Tiếp tục'],
    ['info', 'Đồng ý'],
  ])('mức %s mặc định nhãn "%s"', (variant, label) => {
    renderDialog({ variant });
    expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
  });

  it('`actionLabel` theo ngữ cảnh ghi đè nhãn mặc định', () => {
    renderDialog({ actionLabel: 'Đã hiểu', variant: 'info' });

    expect(screen.getByRole('button', { name: 'Đã hiểu' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Đồng ý' })).not.toBeInTheDocument();
  });

  it('bấm nút hành động gọi onConfirm', async () => {
    const onConfirm = vi.fn();
    renderDialog({ onConfirm, variant: 'info' });

    await userEvent.setup().click(screen.getByRole('button', { name: 'Đồng ý' }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
