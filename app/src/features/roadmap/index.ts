/**
 * Mặt tiền công khai của feature `roadmap` (p4-07 Lộ trình học).
 *
 * ⚠️ CỐ Ý không xuất màn hình: route (`app/(app)/study/roadmap/**`) import thẳng `@/features/roadmap/screens/*`;
 * barrel này chỉ để `study` (feature NGOÀI, qua ngoại lệ `study → roadmap` khai ở `scripts/feature-boundaries.json`)
 * ghép tab "Lộ trình" + thẻ "Hôm nay học gì" vào `StudyHomeScreen` của CHÍNH nó — cùng khuôn `study/index.ts`.
 *
 * ⛔ KHÔNG xuất `roadmapLessonHref` cho `core/notifications` nữa (2026-09-29): `core/notifications` tự dựng Href —
 * `roadmap-route.ts` theo đúng khuôn `contribution-route.ts`, không file sản phẩm nào ở đó import feature. Nhờ vậy
 * `core/` (thuộc cây module GỐC qua `PushTapRouter`) không kéo cả feature này vào lúc nạp gốc. Lý do đầy đủ kèm
 * cảnh báo "giả thuyết ban đầu sai" ghi ở đầu `core/notifications/roadmap-route.ts`.
 */
export { RoadmapTab } from './components/home/RoadmapTab';
export { TodayLessonCard } from './components/home/TodayLessonCard';
export { roadmapKeys } from './queries/roadmap.keys';
