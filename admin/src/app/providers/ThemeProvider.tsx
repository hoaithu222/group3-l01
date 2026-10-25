import { memo, useEffect, type ReactNode } from 'react';
import { ToastContainer } from '@/shared/ui';
import { ProgressCenter } from '@/shared/widgets/upload-center';
import { useDisplayStore, useThemeStore } from '../store';

const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const theme = useThemeStore((s) => s.theme);
  // TV mode ÉP dark: màn hình lớn nhìn từ xa, nền sáng gây chói. Đọc ở đây thay
  // vì tự set class trong `DisplayProvider` để class `dark` chỉ có DUY NHẤT một
  // nơi ghi — hai effect cùng ghi sẽ đá nhau theo thứ tự chạy.
  const isTv = useDisplayStore((s) => s.mode === 'tv');

  /**
   * ⛔ KHÔNG dò `prefers-color-scheme` nữa — đừng dựng lại.
   *
   * Trước đây lần mở đầu tiên (chưa có `theme-storage`) sẽ ghi đè theme bằng màu
   * của HỆ ĐIỀU HÀNH. Máy nào đang để light là vào app ra light, trong khi màu
   * khởi tạo của hệ thống đã chốt là `dark` (xem `store/slices/theme`) — đúng
   * triệu chứng "vào trang thấy theme light".
   *
   * Màu mặc định nay CHỈ do `initialState` của theme store quyết định; user đổi
   * ý thì bật light bằng tay qua UserMenu và lựa chọn đó được `persist` giữ lại.
   */

  // Apply / remove 'dark' class whenever theme (or TV mode) changes.
  // KHÔNG ghi ngược vào `theme-storage` — tắt TV phải quay lại đúng theme user chọn.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isTv || theme === 'dark');
  }, [theme, isTv]);

  return (
    <>
      <ToastContainer />
      {/*
        Rail thẻ tiến trình — mount MỘT lần cho cả app, cùng chỗ với toast.
        Không có việc nào đang chạy thì nó render `null`, nên đặt sẵn ở đây
        không tốn gì mà màn nghiệp vụ khỏi phải nhớ mount.
      */}
      <ProgressCenter />
      {children}
    </>
  );
};

export default memo(ThemeProvider);
