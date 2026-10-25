import type { Href } from 'expo-router';

/**
 * Href của Lộ trình học (app.md p4-07 §1) — một chỗ để đổi cây route mà không sửa từng nơi gọi.
 *
 * ⛔ Mỗi hàm trả MỘT `Href` cố định (KHÔNG `cond ? a : b` / `a ?? b` bên trong): union `Href` đã phình theo ~180
 * route, biểu thức ba ngôi trên nó từng làm `tsc` báo TS2590 THẬT (xem `study-routes.ts`, `docs-routes.ts`,
 * `AGENTS.md`). Nơi gọi cần chọn giữa hai đích thì tự viết `if/else`.
 */

/** `subjectId` nhận cả id lẫn slug — route `[subjectId]` không phân biệt (BE `GET /roadmap/subjects/:idOrSlug`). */
export function roadmapSubjectHref(subjectId: string): Href {
  return { params: { subjectId }, pathname: '/study/roadmap/[subjectId]' };
}

export function roadmapLessonHref(subjectId: string, lessonId: string): Href {
  return {
    params: { lessonId, subjectId },
    pathname: '/study/roadmap/[subjectId]/lessons/[lessonId]',
  };
}

/**
 * Route file chỉ khai `[mediaId]` (app.md §1), nhưng be.md không có endpoint "lấy một media theo id" cho người
 * học — chỉ có `GET /roadmap/lessons/:id/media` (theo BUỔI). `lessonId` đi kèm ở đây là tham số PHỤ (không thuộc
 * segment đường dẫn, Expo Router vẫn mang qua `params` như query) để màn xem ảnh gọi ĐÚNG `useRoadmapMedia(lessonId)`
 * — thường ăn thẳng cache đã tải từ màn buổi học, không phải xin lại.
 */
export function roadmapMediaHref(lessonId: string, mediaId: string): Href {
  return { params: { lessonId, mediaId }, pathname: '/study/roadmap/media/[mediaId]' };
}

// ── Luyện tập (p4-07 bước 12, P1) ─────────────────────────────────────────────────────────────────────────────
//
// `lesson.practiceSets[].id` chỉ là ID trả từ BE (`RoadmapPracticeSetSummaryDto`, xem `roadmap.types.ts`) — KHÔNG
// phải kiểu của `features/study`. Bốn hàm dưới đây tự dựng `Href` NGUYÊN VĂN theo shape của
// `features/study/utils/study-routes.ts` (`setHref`/`flashcardsHref`/`quizHref`/`srReviewHref`), chứ KHÔNG import
// hàm đó: chiều `roadmap → study` bị CẤM (`scripts/feature-boundaries.json`, mục `study → roadmap`). Đổi route bên
// `study` thì phải tự sửa CẢ bốn hàm này — chấp nhận trùng lặp để giữ ranh giới, cùng cách `contribution-route.ts`
// (core/notifications) chấp nhận với `features/contribution/utils/contribution-routes.ts`.

/** Mở màn tổng quan bộ (Học thẻ/Quiz/Ôn SR/Thi thử đều có sẵn ở đó) — đích của nút "Luyện tập" khi không cần vào thẳng một chế độ. */
export function roadmapPracticeSetHref(setId: string): Href {
  return { params: { setId }, pathname: '/study/sets/[setId]' };
}

export function roadmapPracticeFlashcardsHref(setId: string): Href {
  return { params: { setId }, pathname: '/study/sets/[setId]/flashcards' };
}

/** Quiz nhanh — chỉ mở được khi `RoadmapPracticeSetSummaryDto.hasQuiz` (bộ có ít nhất một câu chấm được). */
export function roadmapPracticeQuizHref(setId: string): Href {
  return { params: { setId }, pathname: '/study/sets/[setId]/quiz' };
}

/** Ôn theo lịch SM-2 của MỘT bộ — mở `/study/sr` với `setId` (giống `srReviewHref(setId)` phía `study`). */
export function roadmapPracticeSrHref(setId: string): Href {
  return { params: { setId }, pathname: '/study/sr' };
}
