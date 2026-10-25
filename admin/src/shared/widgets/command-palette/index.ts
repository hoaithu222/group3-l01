/**
 * Command Palette widget — public API.
 *
 *   import { CommandPalette, CommandPaletteTrigger } from '@/shared/widgets/command-palette';
 *
 * `CommandPalette` render MỘT LẦN ở gốc layout (xem `BackgroundLayout.tsx`
 * qua `AppCommandPalette`); `CommandPaletteTrigger` đặt vào slot `actions` của
 * `<Header>`. Cả hai đồng bộ qua `command-palette-store.ts`, không cần prop
 * nối trực tiếp giữa hai nơi.
 */
export { default as CommandPalette } from './CommandPalette';
export type {
  CommandPaletteGroup,
  CommandPaletteItem,
  CommandPaletteProps,
} from './CommandPalette';

export { default as CommandPaletteTrigger } from './CommandPaletteTrigger';
export type { CommandPaletteTriggerProps } from './CommandPaletteTrigger';

export { useCommandPaletteStore } from './command-palette-store';
