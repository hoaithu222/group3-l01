/**
 * Mặt tiền công khai của feature `resources` (p3-01 Resource Hub).
 *
 * ⚠️ CỐ Ý không xuất màn hình: route (`app/(app)/workspaces/[wsId]/resources/**`)
 * import thẳng `@/features/resources/screens/*` như các feature khác, còn barrel
 * này được HUB workspace nạp cho `ResourcesHubCard` — xuất màn hình ở đây là kéo
 * cả cây xem trước (prism, expo-video…) vào ngay lúc mở tổng quan nhóm.
 */
export { ResourcesHubCard } from './components/ResourcesHubCard';
export type { ResourcesHubCardProps } from './components/ResourcesHubCard';
export { resetResourceStores } from './store/reset-resource-stores';
