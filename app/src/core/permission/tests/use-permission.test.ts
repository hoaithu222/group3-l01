import { renderHook } from '@testing-library/react-native';

import { useCan, usePermission } from '../use-permission';

/**
 * `usePermission`/`useCan` — app.md §4 của p0-02: UI ẩn/hiện nút theo mảng
 * `myPermissions` do BACKEND trả, KHÔNG tự suy từ `role`. Test ở đây chỉ cần
 * xác nhận đúng hành vi bao/không bao gồm action — không test lại thứ
 * TypeScript đã bảo đảm (kiểu tham số).
 *
 * ⚠️ `renderHook()` là BẤT ĐỒNG BỘ ở RNTL 14 (giống `render()`) — thiếu `await`
 * thì `result` không tồn tại trên `Promise` chưa resolve.
 */
describe('usePermission', () => {
  it('action CÓ trong myPermissions ⇒ true', async () => {
    const { result } = await renderHook(() =>
      usePermission(['conversation.message.send', 'conversation.member.add'], 'conversation.member.add'),
    );
    expect(result.current).toBe(true);
  });

  it('action KHÔNG có trong myPermissions ⇒ false', async () => {
    const { result } = await renderHook(() =>
      usePermission(['conversation.message.send'], 'conversation.dissolve'),
    );
    expect(result.current).toBe(false);
  });

  it('myPermissions === undefined (chưa tải xong DTO) ⇒ false, không ném lỗi', async () => {
    const { result } = await renderHook(() => usePermission(undefined, 'conversation.dissolve'));
    expect(result.current).toBe(false);
  });
});

describe('useCan', () => {
  it('trả về HÀM kiểm tra nhiều action trên CÙNG một myPermissions', async () => {
    const { result } = await renderHook(() => useCan(['conversation.member.add', 'conversation.edit']));

    expect(result.current('conversation.member.add')).toBe(true);
    expect(result.current('conversation.edit')).toBe(true);
    expect(result.current('conversation.dissolve')).toBe(false);
  });

  it('myPermissions === undefined ⇒ hàm trả về LUÔN false', async () => {
    const { result } = await renderHook(() => useCan(undefined));
    expect(result.current('conversation.dissolve')).toBe(false);
  });
});
