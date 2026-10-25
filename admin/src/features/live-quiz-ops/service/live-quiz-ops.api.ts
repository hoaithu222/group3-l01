/**
 * Đường dẫn admin Live Quiz — nối sau `appConfig.apiBaseUrl` (đã chứa `/v1`). Khớp `be/src/modules/live-quiz/live-quiz.admin.routes.ts`:
 * mọi route cần cờ `live-quiz` (tắt → `404 CFG_005`); xem `gamification:view`, kết thúc khẩn cấp `gamification:update`.
 */

/** `id` từ BE đi vào đường dẫn → mã hoá để không chèn được `/`, `?`, `#`. */
const seg = encodeURIComponent;

export const liveQuizOpsApi = {
  /** GET `?page&limit&status` (`gamification:view`) — metadata, không PIN/đáp án. */
  sessions: '/admin/live-quiz/sessions',
  /** GET (`gamification:view`) — chi tiết + bảng kết quả bền (nếu đã lưu); `QUIZ_001` không tồn tại. */
  session: (id: string) => `/admin/live-quiz/sessions/${seg(id)}`,
  /** POST `{ reason }` (`gamification:update`) — CANCELLED/`ADMIN_ENDED`, audit `live-quiz.admin-end`; `QUIZ_007` phiên đã đóng. */
  end: (id: string) => `/admin/live-quiz/sessions/${seg(id)}/end`,
} as const;
