/**
 * Đường dẫn endpoint theo dõi sức khoẻ học tập (p7-03; `be/src/modules/burnout/burnout.routes.ts`) — nối sau `appConfig.apiBaseUrl`.
 * ⚠️ Cờ `burnout` tắt ⇒ MỌI route trả 404 `CFG_005`, TRỪ hai đường rút lại của người dùng: `PUT` với `optIn: false` và `DELETE …/data` (luôn dùng được). `PUT` là đường DUY NHẤT để bật/tắt; `PATCH` chỉ sửa cài đặt của người đang bật (chưa/đã tắt ⇒ 409 `WELL_001`).
 * Không route nào nhận `userId`: BE lấy từ token, nên app cũng không có chỗ nào gửi định danh.
 */
export const ME_WELLBEING_PATH = '/me/wellbeing';
export const ME_WELLBEING_ASSESSMENTS_PATH = '/me/wellbeing/assessments';
export const ME_WELLBEING_DATA_PATH = '/me/wellbeing/data';
/** P1 — `POST` báo đã nghỉ xong (TakeABreakWidget); chỉ đếm qua rate limiter, không lưu bản ghi. */
export const ME_WELLBEING_BREAK_PATH = '/me/wellbeing/break';
/** P1 — `GET` danh sách nhóm ĐÃ tự chia sẻ; `PUT`/`DELETE` bật/tắt chia sẻ với MỘT nhóm. */
export const ME_WELLBEING_SHARES_PATH = '/me/wellbeing/shares';

export const wellbeingAckPath = (assessmentId: string) =>
  `/me/wellbeing/alerts/${assessmentId}/ack`;

/** P1 — `PUT`/`DELETE /me/wellbeing/shares/:workspaceId`. */
export const wellbeingSharePath = (workspaceId: string) =>
  `${ME_WELLBEING_SHARES_PATH}/${workspaceId}`;

/** P1 — nhóm tôi đang là thành viên, cho danh sách chọn chia sẻ (be.md p1-01 §4; khai lại độc lập, xem `MyWorkspace`). */
export const MY_ACTIVE_WORKSPACES_PATH = '/workspaces';
