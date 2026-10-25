import { Stack } from 'expo-router';
import { STACK_SCREEN_OPTIONS } from '@/shell/navigation/stack-screen-options';

/**
 * Ngăn xếp RIÊNG cho "Portfolio" (p6-07) — gộp `index` (tổng quan), `profile`, `appearance`, `preview`, `projects/add` và `projects/[projectId]` thành MỘT nhánh của ngăn xếp `me/career`.
 * Mỗi màn tự dựng `AppBar`. Thiếu file này thì các màn con bị coi là route ngang hàng của `me/career/_layout.tsx` và `projects/*` không gộp vào nhánh portfolio.
 */
export default function PortfolioLayout() {
  return <Stack screenOptions={STACK_SCREEN_OPTIONS} />;
}
