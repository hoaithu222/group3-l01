/**
 * Store mở/đóng Command Palette — colocated với widget, cùng khuôn với
 * `overlays/toast-store.ts`.
 *
 * Vì sao cần store thay vì `useDisclosure()` cục bộ: nút mở (trong Header, qua
 * `AppHeader`) và hộp thoại (mount ở `BackgroundLayout`, qua `AppCommandPalette`)
 * là HAI cây component riêng biệt — không có React state cha-con nào bắc cầu
 * được giữa chúng. Store toàn cục là điểm nối chung DUY NHẤT, giống hệt cách
 * `showToast()` gọi được từ bất kỳ đâu mà không cần prop-drilling.
 */
import { create } from 'zustand';

interface CommandPaletteStore {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

export const useCommandPaletteStore = create<CommandPaletteStore>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
}));
