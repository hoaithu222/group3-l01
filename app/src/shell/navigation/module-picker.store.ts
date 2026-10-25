import { create } from 'zustand';

interface ModulePickerState {
  close: () => void;
  open: () => void;
  visible: boolean;
}

/**
 * Trạng thái mở/đóng của danh sách chọn phân hệ (`ModulePickerSheet`).
 *
 * Là store chứ không phải `useState` trong `AppTabBar` vì hai nơi cùng mở nó: giữ nút Trang chủ trên
 * thanh tab, và nút "Tất cả" ở màn Trang chủ (`features/home`). Tấm được mount MỘT lần ở
 * `app/(app)/_layout.tsx`.
 *
 * Chỉ là cờ giao diện tạm — không lưu bền, không theo người dùng: `ModulePickerSheet` tự đóng khi
 * nhóm route `(app)` gỡ (đăng xuất), nên không cần đăng ký vào `resetAllStores`.
 */
export const useModulePickerStore = create<ModulePickerState>((set) => ({
  close: () => set({ visible: false }),
  open: () => set({ visible: true }),
  visible: false,
}));
