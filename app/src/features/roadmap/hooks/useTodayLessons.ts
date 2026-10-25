import { useRoadmapToday } from '../queries/roadmap.queries';

/**
 * Thẻ "Hôm nay học gì" (README §4 luồng 5) — bọc `useRoadmapToday` với `items: []` ổn định để `TodayLessonCard`
 * không phải tự `?? []` ở nhiều chỗ. Một người có thể đang học NHIỀU môn cùng lúc (Fullstack + Tiếng Anh) nên
 * `items` là MẢNG, không phải một buổi duy nhất — màn Của tôi vẽ mỗi phần tử một thẻ nhỏ.
 *
 * ⚠️ Cố ý KHÔNG có trạng thái tải/lỗi riêng: app.md §3 nói thẻ này "Ẩn khi không có enrollment" và "không thêm
 * khung xương" — `TodayLessonCard` chỉ vẽ khi `items.length > 0`, coi cả lúc đang tải lẫn lúc lỗi như "chưa có gì
 * để hiện" (không có gì để tự làm khó chịu người dùng ở đầu tab Của tôi vì một widget PHỤ).
 */
export function useTodayLessons() {
  const query = useRoadmapToday();
  return { items: query.data ?? [] };
}
