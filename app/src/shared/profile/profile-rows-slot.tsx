import { Fragment, type ReactNode } from 'react';

/**
 * ĐIỂM NỐI thêm HÀNG lối vào vào danh sách của màn Tôi (vd "Cần chấm" của p4-05, có số đếm) mà KHÔNG để `features/me` import feature
 * khác (`feature-structure.md` cấm import chéo). Khác `ProfileExtrasSlot` (MỘT renderer, dành cho thẻ hồ sơ): ở đây nhiều feature
 * cùng thêm hàng, mỗi hàng đăng ký theo `id` — đăng ký lại cùng `id` chỉ ghi đè (an toàn với Fast Refresh), `null` là gỡ.
 *
 * Renderer là HÀM trả `ReactNode` (thường là một `ListItem` kèm `divider`), không phải component: tra component từ registry ngay lúc render
 * bị `react-hooks/static-components` chặn. Chưa đăng ký (test, cờ tắt) ⇒ slot không vẽ gì — danh sách giữ nguyên hình dạng cũ. Nơi lắp ráp
 * import file `register-*` của feature (side-effect) ở layout route `me/_layout.tsx`.
 */
export type ProfileRowRenderer = () => ReactNode;

const rows = new Map<string, ProfileRowRenderer>();

export function registerProfileRow(id: string, renderer: ProfileRowRenderer | null): void {
  if (renderer) rows.set(id, renderer);
  else rows.delete(id);
}

export function ProfileRowsSlot(): ReactNode {
  if (rows.size === 0) return null;
  return (
    <>
      {[...rows.entries()].map(([id, render]) => (
        <Fragment key={id}>{render()}</Fragment>
      ))}
    </>
  );
}

/** Chỉ cho test — trả khe về trạng thái chưa đăng ký. */
export function resetProfileRows(): void {
  rows.clear();
}
