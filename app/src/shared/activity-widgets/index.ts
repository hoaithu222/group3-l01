export {
  ActivityWidgetsSlot,
  registerActivityWidget,
  resetActivityWidgets,
} from './activity-widgets';
export type { ActivityWidgetOptions, ActivityWidgetRenderer } from './activity-widgets';
export { ActivityWidgetCard } from './ActivityWidgetCard';
export type { ActivityWidgetCardProps } from './ActivityWidgetCard';
// Hook làm mới-khi-focus nay dùng cho MỌI màn (không chỉ widget) — nhà mới ở `@/shared/hooks`; giữ lối nhập cũ cho widget.
export { useRefetchOnFocus } from '@/shared/hooks/useRefetchOnFocus';
