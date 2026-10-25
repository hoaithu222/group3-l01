import type { ColumnKindValue, LabelColorToken } from "../../../core/constants/project";
import type { BoardTemplateCode } from "../dtos";

export interface BoardTemplate {
  code: BoardTemplateCode;
  /** Tên hiển thị của mẫu; cũng là tên bảng mặc định khi người dùng không đặt tên. */
  name: string;
  description: string;
  columns: { title: string; kind: ColumnKindValue; wipLimit?: number | null }[];
  labels: { name: string; color: LabelColorToken }[];
}

/**
 * Mẫu bảng dựng sẵn (dữ liệu tĩnh, KHÔNG I/O). Mỗi mẫu có đúng MỘT cột DONE, ít nhất một cột TODO (cột mặc định của thẻ mới) và số cột/nhãn trong trần
 * (`columnsMax`, `labelsMax`, độ dài tên) — test `board-templates.test.ts` khoá các bất biến này để mẫu không bao giờ tạo ra bảng sai luật.
 */
export const BOARD_TEMPLATES: readonly BoardTemplate[] = [
  {
    code: "COURSE_PROJECT",
    name: "Đồ án",
    description: "Bảng cho đồ án nhóm: từ ý tưởng, thực hiện đến báo cáo và bảo vệ.",
    columns: [
      { title: "Ý tưởng", kind: "TODO" },
      { title: "Cần làm", kind: "TODO" },
      { title: "Đang làm", kind: "IN_PROGRESS" },
      { title: "Chờ xem xét", kind: "REVIEW" },
      { title: "Hoàn thành", kind: "DONE" },
    ],
    labels: [
      { name: "Báo cáo", color: "blue" },
      { name: "Lập trình", color: "green" },
      { name: "Thiết kế", color: "purple" },
      { name: "Thuyết trình", color: "orange" },
      { name: "Cần gấp", color: "red" },
    ],
  },
  {
    code: "LIGHT_SCRUM",
    name: "Scrum nhẹ",
    description: "Bảng Scrum gọn cho nhóm nhỏ: backlog, sprint, kiểm thử và hoàn thành.",
    columns: [
      { title: "Backlog", kind: "TODO" },
      { title: "Sprint", kind: "TODO" },
      { title: "Đang làm", kind: "IN_PROGRESS" },
      { title: "Kiểm thử", kind: "REVIEW" },
      { title: "Hoàn thành", kind: "DONE" },
    ],
    labels: [
      { name: "Tính năng", color: "green" },
      { name: "Lỗi", color: "red" },
      { name: "Cải tiến", color: "blue" },
      { name: "Kỹ thuật", color: "purple" },
      { name: "Tài liệu", color: "gray" },
    ],
  },
];

export function findBoardTemplate(code: BoardTemplateCode): BoardTemplate {
  const template = BOARD_TEMPLATES.find((t) => t.code === code);
  if (!template) throw new Error(`Mẫu bảng không tồn tại: ${code}`);
  return template;
}
