/**
 * Kiểu dữ liệu của bộ seed "nhóm đông người" (`npm run db:seed:rich-demo`). Nội dung từng nhóm nằm ở `content/*.ts`
 * và chỉ khai báo bằng các kiểu dưới đây — phần ghi DB nằm ở `lib/*.ts`.
 */

/** Khoá người trong `people.ts` (vd `"minhanh"`). Khoá đặc biệt `"thu"` = tài khoản thật thu601925@gmail.com. */
export type PersonKey = string;

export type ColorToken = "gray" | "red" | "orange" | "yellow" | "green" | "teal" | "blue" | "purple" | "pink";

export interface PollSpec {
  options: string[];
  /** `votes[i]` = những người đã chọn `options[i]`. */
  votes: PersonKey[][];
  multi?: boolean;
  /** Hạn đóng (ngày kể từ lúc đăng); bỏ trống = không hạn. */
  closesInDays?: number;
}

export interface LineOpts {
  /** Trả lời dòng thứ n (0-based) TRƯỚC ĐÓ trong cùng kịch bản. */
  reply?: number;
  /** emoji → những người thả. */
  react?: Record<string, PersonKey[]>;
  pin?: boolean;
  edited?: boolean;
  /** Luồng trả lời (thread) dưới tin này: [người gửi, nội dung][]. Chỉ dùng cho kênh, không dùng cho hội thoại. */
  thread?: Array<[PersonKey, string]>;
  /** Có `poll` ⇒ dòng này là tin khảo sát, `text` là câu hỏi. */
  poll?: PollSpec;
}

/**
 * Một dòng chat: [người gửi, nội dung, tuỳ chọn]. Nhắc tên viết `{@khoá}` (vd `"Nhờ {@minhanh} xem giúp nhé"`).
 * Nội dung là văn bản thuần (có thể kèm emoji và đường link).
 */
export type Line = [by: PersonKey, text: string, opts?: LineOpts];

export interface ChannelSpec {
  /** Tên hiển thị. Kênh trùng tên (đã chuẩn hoá) đã có trong nhóm sẽ được dùng lại, không tạo mới. */
  name: string;
  description?: string;
  /** Mặc định TEXT. VOICE/POMODORO không có tin nhắn (bỏ `lines`). */
  type?: "TEXT" | "VOICE" | "POMODORO";
  /** Có ⇒ kênh RIÊNG TƯ; danh sách người được cấp quyền (chủ nhóm luôn là quản lý). */
  private?: PersonKey[];
  /** Kênh công khai: ai đã tham gia (thêm vào những người có tin trong `lines`). `"all"` = mọi thành viên. */
  followers?: PersonKey[] | "all";
  /** Kịch bản hội thoại theo thứ tự thời gian. */
  lines?: Line[];
  /** Số tin cuối chưa đọc của `thu` (chỉ tính tin người khác gửi). Mặc định 0. */
  unreadForThu?: number;
}

export interface ColumnSpec {
  title: string;
  kind: "TODO" | "IN_PROGRESS" | "REVIEW" | "DONE";
  wipLimit?: number;
}

export interface TaskSpec {
  title: string;
  /** Chỉ số cột trong `columns`. */
  col: number;
  desc?: string;
  /** Tên nhãn (phải có trong `labels` của bảng). */
  labels?: string[];
  assignees?: PersonKey[];
  points?: number;
  /** Hạn chót so với hôm nay (ngày; âm = quá hạn). */
  dueInDays?: number;
  startInDays?: number;
  checklist?: Array<[text: string, done: boolean]>;
  comments?: Array<[by: PersonKey, text: string]>;
  /** Người tạo thẻ (mặc định chủ nhóm). */
  by?: PersonKey;
}

export interface BoardSpec {
  /** Bảng trùng tên (đã chuẩn hoá) đã có trong nhóm sẽ được dùng lại (cột lấy từ DB, chỉ thêm thẻ chưa có). */
  name: string;
  description?: string;
  columns: ColumnSpec[];
  labels: Array<[name: string, color: ColorToken]>;
  tasks: TaskSpec[];
}

export type StudyItemSpec =
  | { type: "FLASHCARD"; prompt: string; answerText: string; tags?: readonly string[] }
  | { type: "MULTIPLE_CHOICE"; prompt: string; options: readonly string[]; correctIndex: number; explanation?: string; tags?: readonly string[] }
  | { type: "TRUE_FALSE"; prompt: string; correct: boolean; explanation?: string; tags?: readonly string[] }
  | { type: "FILL_BLANK"; prompt: string; accepted: readonly string[]; explanation?: string; tags?: readonly string[] };

export interface StudySetSpec {
  /** Khoá ổn định (lưu vào tag `seed-rich:<slug>`) — KHÔNG đổi sau khi đã seed. Duy nhất toàn bộ seed. */
  slug: string;
  title: string;
  description: string;
  tags: readonly string[];
  language: "vi" | "en";
  visibility: "WORKSPACE" | "PUBLIC";
  owner: PersonKey;
  items: readonly StudyItemSpec[];
}

export interface ExpenseSpec {
  paidBy: PersonKey;
  /** Số tiền VND (nguyên). */
  amount: number;
  description: string;
  /** Khớp `LIMITS.wallet.categories` của backend. */
  category: "FOOD" | "PRINTING" | "SERVER" | "TRANSPORT" | "MATERIAL" | "OTHER";
  /** Chia đều cho những người này (gồm cả người trả nếu họ cùng hưởng). */
  among: PersonKey[];
  daysAgo: number;
}

export interface WorkspaceSpec {
  /** Khoá ổn định của nhóm trong seed (dùng đặt khoá chống trùng cho tin/thẻ). */
  key: string;
  /** Tên nhóm. Nhóm cùng chủ + cùng tên (đã chuẩn hoá) đã có thì được dùng lại và bổ sung thêm dữ liệu. */
  name: string;
  description: string;
  cover: "violet" | "amber" | "ocean" | "forest" | "sunset" | "rose" | "slate";
  owner: PersonKey;
  admins: PersonKey[];
  members: PersonKey[];
  /** Mặc định OPEN. APPROVAL ⇒ có thể kèm `pending`. */
  joinPolicy?: "OPEN" | "APPROVAL";
  /** Yêu cầu xin vào nhóm đang chờ duyệt: [người, lời nhắn]. */
  pending?: Array<[PersonKey, string]>;
  /** Lời mời qua email đang chờ chấp nhận. */
  invitations?: Array<{ email: string; message?: string }>;
  /** Nhóm mới tạo cách đây bao nhiêu ngày (bỏ qua với nhóm đã tồn tại). Mặc định 20. */
  createdDaysAgo?: number;
  channels: ChannelSpec[];
  boards: BoardSpec[];
  studySets: StudySetSpec[];
  expenses?: ExpenseSpec[];
}

/** Hội thoại 1-1 giữa `thu` và `peer`. `by` của mỗi dòng chỉ là `"thu"` hoặc `peer`. */
export interface DmSpec {
  peer: PersonKey;
  lines: Line[];
  /** Số tin cuối chưa đọc của `thu`. */
  unreadForThu?: number;
  pinned?: boolean;
}

/** Nhóm chat (không phải kênh) — gắn với một nhóm làm việc. */
export interface GroupChatSpec {
  title: string;
  /** Khoá `WorkspaceSpec.key` mà nhóm chat thuộc về. */
  workspace: string;
  owner: PersonKey;
  members: PersonKey[];
  lines: Line[];
  unreadForThu?: number;
}
