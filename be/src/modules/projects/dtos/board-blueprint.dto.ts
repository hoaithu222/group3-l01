import { z } from "zod";
import { LIMITS } from "../../../core/constants/limits";

/** Mã mẫu bảng (p3-02 P1) — hợp đồng API (`GET /board-templates`, `POST /workspaces/:id/boards/from-template`). Dữ liệu mẫu ở `services/board-templates.ts`. */
export const BOARD_TEMPLATE_CODES = ["COURSE_PROJECT", "LIGHT_SCRUM"] as const;
export type BoardTemplateCode = (typeof BOARD_TEMPLATE_CODES)[number];

/**
 * `POST /workspaces/:workspaceId/boards/from-template` (p3-02 P1) — tạo bảng từ mẫu dựng sẵn (cột + nhãn). `name`/`description` vắng ⇒ lấy của mẫu.
 * Cùng quyền/trần với `POST /workspaces/:id/boards` (`workspace.board.create`, `TASK_009`).
 */
export const createBoardFromTemplateSchema = z.object({
  template: z.enum(BOARD_TEMPLATE_CODES),
  name: z.string().trim().min(1, "Tên bảng bắt buộc").max(LIMITS.board.nameMax).optional(),
  description: z.string().trim().max(1000).optional(),
});

/**
 * `POST /boards/:id/duplicate` (p3-02 P1) — sao chép CẤU TRÚC bảng: cột (id mới), nhãn (`includeLabels`), cấu hình chấm chéo (`includeReviewConfig`),
 * mô tả. Thẻ CHỈ sao chép khi `includeTasks` (mặc định tắt): thẻ chưa hoàn thành (không ở cột DONE) sang đúng cột tương ứng của bản sao, giữ thứ tự, nhãn (theo tên),
 * mô tả, ngày bắt đầu/hạn, điểm, checklist (bỏ dấu tích) — KHÔNG người làm, bình luận, tệp, nhật ký, phụ thuộc, trạng thái duyệt; tối đa `LIMITS.board.duplicateTasksMax`.
 * `name` vắng ⇒ "<tên gốc> (bản sao)".
 */
export const duplicateBoardSchema = z.object({
  name: z.string().trim().min(1, "Tên bảng bắt buộc").max(LIMITS.board.nameMax).optional(),
  includeLabels: z.boolean().default(true),
  includeReviewConfig: z.boolean().default(true),
  includeTasks: z.boolean().optional(),
});

export type CreateBoardFromTemplateDto = z.infer<typeof createBoardFromTemplateSchema>;
export type DuplicateBoardDto = z.infer<typeof duplicateBoardSchema>;
