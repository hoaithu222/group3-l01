import { env } from "../config";

export const MODULES = {
  COMMUNICATION: "communication",
  VOICE: "voice",
  PROJECT: "project",
  STUDY: "study",
  LIVE_QUIZ: "live-quiz",
  COLLAB: "collab",
  INTEGRATION: "integration",
  CUSTOM_ROLES: "custom-roles",
  MENTOR: "mentor",
  WALLET: "wallet",
  O2O: "o2o",
  PLAGIARISM: "plagiarism",
  GAMIFICATION: "gamification",
  COINS: "coins",
  BURNOUT: "burnout",
  CAREER: "career",
  AI: "ai",
  AI_ASSISTANT: "ai-assistant",
  KNOWLEDGE: "knowledge",
  PUSH: "push",
  /** Phase 2 — lịch họp/phòng họp (p0-07 §9: thêm cờ mới, chưa có mã). */
  MEETING: "meeting",
  /** p1-03 §9 — kênh loại POMODORO (mặc định tắt, mã thật ở p5-02). */
  POMODORO: "pomodoro",
  /** p4-07 — Lộ trình học (môn → tháng → buổi), điểm vào trong "Học". */
  ROADMAP: "roadmap",
} as const;
export type ModuleId = (typeof MODULES)[keyof typeof MODULES];

/** Mặc định tất cả tắt; bật qua FEATURE_FLAGS khi module có mã. AI luôn tắt khi D-13 còn hiệu lực. */
export const DEFAULT_FEATURE_FLAGS: Record<ModuleId, boolean> = Object.fromEntries(
  Object.values(MODULES).map((m) => [m, false])
) as Record<ModuleId, boolean>;

/**
 * Module có mã (BE cập nhật tay theo phase) — capabilities/`RuntimeConfigService`
 * trả `available` để admin khoá toggle. `push` (p0-06) là module Phase 0 đầu
 * tiên có mã thật — thêm id khi module merge (p1-01 → communication,
 * p2-01 → voice, p2-04 → meeting, theo README p0-07 §7).
 */
export const AVAILABLE_MODULES: readonly ModuleId[] = [
  MODULES.PUSH,
  MODULES.WALLET,
  MODULES.LIVE_QUIZ,
  MODULES.POMODORO,
  MODULES.INTEGRATION,
  // Đã có mã + app đã có màn hình; bật thật vẫn phải qua `FEATURE_FLAGS` hoặc admin (mặc định TẮT).
  MODULES.COMMUNICATION,
  MODULES.VOICE,
  MODULES.MEETING,
  MODULES.STUDY,
  MODULES.GAMIFICATION,
  MODULES.PROJECT,
  // p4-07 — Lộ trình học. Mặc định TẮT; bật thật cần `db push` model Roadmap* trước + chạy import nội dung.
  MODULES.ROADMAP,
  // p6-03 — Mentor Connect đã có mã (BE + app + admin kiểm duyệt); bật thật cần `db push` model Mentor* trước.
  MODULES.MENTOR,
  // p6-06 — huy hiệu kỹ năng (nền `career` cho p6-07/p6-08). Mặc định TẮT; bật thật sau CR-01..08 + văn bản chính sách dữ liệu sinh viên (Phase 6 README §5).
  MODULES.CAREER,
  // p6-05 — in ấn O2O & địa điểm (BE + admin `o2o`/`partner` + app). Mặc định TẮT; bật khi có ≥ 1 tiệm đối tác thật (Phase 6 README §5).
  // Cần `db push` model Location/LocationReview/PrintShop/PrintOrder + `npm run db:ensure-indexes` (2dsphere) trước.
  MODULES.O2O,
  // p6-01 — Real-time Docs: module BE `documents` + service `collab/` (Hocuspocus). Mặc định TẮT; bật khi service `collab/` chạy + có COLLAB_URL/COLLAB_INTERNAL_URL/COLLAB_SHARED_SECRET
  // (validate-runtime) + đã `db push` model Document/DocumentCollaborator/DocumentSnapshot; nghiệm thu CW-01..06 (Phase 6 README §5).
  MODULES.COLLAB,
  // p7-02 — kinh tế ảo Coins (ví xu, sổ cái, cửa hàng vật phẩm hồ sơ, nhiệm vụ ngày). Mặc định TẮT; bật cần `gamification` (validate-runtime) + đã `db push` model Coin*/ShopItem/
  // UserInventory/UserQuestProgress + seed luật/vật phẩm đề xuất đã duyệt (`seedCoins`). Chợ tài liệu (P1) ĐÃ có mã (BE + app + admin) nhưng công tắc `economy.marketplaceEnabled` MẶC ĐỊNH TẮT (chờ điều khoản bản quyền); loại RESOURCE mới ghi nhận quyền mua.
  MODULES.COINS,
  // p7-03 — burnout radar / sức khoẻ học tập (bộ luật, OPT-IN, riêng tư — chỉ người dùng thấy dữ liệu của mình, admin chỉ thấy số liệu ẩn danh ≥ 20 người). Mặc định TẮT; bật cần `gamification`
  // (validate-runtime) + đã `db push` model WellbeingSetting/WellbeingDaily/BurnoutAssessment + văn bản chính sách dữ liệu sức khoẻ học tập. Chia sẻ mức với trưởng nhóm (P1) ĐÃ có mã (`wellbeing-share.service.ts`, app `ShareWithWorkspaceList`).
  MODULES.BURNOUT,
  // p7-05 — Quét trùng lặp nội bộ (k-gram + winnowing tự viết, KHÔNG gọi mô hình/API ngoài — D-13 vẫn hiệu lực). Mặc định
  // TẮT cho tới khi ai đó bật thủ công để kiểm (task Wave 2 p7-05) — cần `db push` model DocumentFingerprint/
  // PlagiarismScan/PlagiarismResult/PlagiarismSection trước.
  MODULES.PLAGIARISM,
];

/**
 * Chặn cứng theo quyết định dự án (D-13) — KHÔNG được bật dù có mã hay không,
 * validateRuntime()/RuntimeConfigService.isFeatureEnabled() đều tra bảng này
 * thay vì liệt kê rời rạc từng nơi.
 */
export const AI_BLOCKED: ReadonlySet<ModuleId> = new Set([
  MODULES.AI,
  MODULES.AI_ASSISTANT,
  MODULES.KNOWLEDGE,
]);

/**
 * Cờ PHỤ của tiện ích trong một phân hệ (p5-04 README §7) — lưu chung khoá `features` của `SystemConfig` nhưng KHÔNG phải `ModuleId`:
 * mặc định BẬT, chỉ có hiệu lực khi phân hệ cha bật (`isSubFeatureEnabled`). Không đi qua `FEATURE_FLAGS` env / `AVAILABLE_MODULES`.
 */
export const SUB_FEATURES = {
  /** Tìm toàn workspace (`GET /workspaces/:id/search`). */
  WORKSPACE_SEARCH: "workspaceSearch",
  /** Mẫu workspace (tạo nhóm từ mẫu, áp mẫu cho nhóm đã có). */
  WORKSPACE_TEMPLATES: "workspaceTemplates",
  /** Xác nhận đã đọc thông báo kênh. */
  READ_CONFIRM: "readConfirm",
  /** Ghi hình cuộc họp (p2-06) — còn cần storage S3 + LiveKit Egress (`capabilities.features.meetingRecording.available`). */
  MEETING_RECORDING: "meetingRecording",
  /** Khảo sát trong kênh/hội thoại (p7-04). */
  POLLS: "polls",
  /** Tin hẹn giờ (p7-04). */
  SCHEDULED_MESSAGES: "scheduledMessages",
  /** Nhắc lại tin (p7-04). */
  MESSAGE_REMINDERS: "messageReminders",
  /** Chuyển tin thành thẻ công việc (p7-04) — cha là `project` (cần bảng để tạo thẻ). */
  MESSAGE_TO_TASK: "messageToTask",
  /** Lưu tệp của tin vào kho tài liệu (p7-04) — cha là `project` (kho tài liệu p3-01 gắn cờ `project`). */
  MESSAGE_TO_RESOURCE: "messageToResource",
  /** GIF/sticker qua nhà cung cấp ngoài (p7-04 P2) — MẶC ĐỊNH TẮT, chưa có nhà cung cấp/mã (xem `SUB_FEATURE_DEFAULT_OFF`). */
  GIF: "gif",
} as const;
export type SubFeatureId = (typeof SUB_FEATURES)[keyof typeof SUB_FEATURES];

/**
 * Cờ phụ MẶC ĐỊNH TẮT (chưa từng cấu hình → tắt): tính năng chưa có mã/nhà cung cấp nên không được tự bật theo phân hệ cha. Admin vẫn bật được bằng `SystemConfig features.<id>`,
 * nhưng `capabilities` báo `available: false` cho tới khi có mã (`SUB_FEATURE_UNAVAILABLE`).
 */
export const SUB_FEATURE_DEFAULT_OFF: ReadonlySet<SubFeatureId> = new Set<SubFeatureId>([SUB_FEATURES.GIF]);

/** Giá trị mặc định của cờ phụ khi chưa cấu hình: BẬT, trừ `SUB_FEATURE_DEFAULT_OFF`. */
export const subFeatureDefault = (id: SubFeatureId): boolean => !SUB_FEATURE_DEFAULT_OFF.has(id);

/** Cờ phụ CHƯA có mã (bật cũng không có gì để dùng) — `capabilities.features.<id>.available = false`. */
export const SUB_FEATURE_UNAVAILABLE: ReadonlySet<SubFeatureId> = new Set<SubFeatureId>([SUB_FEATURES.GIF]);

/** Phân hệ cha của từng cờ phụ — cờ phụ chỉ hiệu lực khi phân hệ cha bật. */
export const SUB_FEATURE_PARENT: Record<SubFeatureId, ModuleId> = {
  [SUB_FEATURES.WORKSPACE_SEARCH]: MODULES.COMMUNICATION,
  [SUB_FEATURES.WORKSPACE_TEMPLATES]: MODULES.COMMUNICATION,
  [SUB_FEATURES.READ_CONFIRM]: MODULES.COMMUNICATION,
  [SUB_FEATURES.MEETING_RECORDING]: MODULES.MEETING,
  [SUB_FEATURES.POLLS]: MODULES.COMMUNICATION,
  [SUB_FEATURES.SCHEDULED_MESSAGES]: MODULES.COMMUNICATION,
  [SUB_FEATURES.MESSAGE_REMINDERS]: MODULES.COMMUNICATION,
  [SUB_FEATURES.MESSAGE_TO_TASK]: MODULES.PROJECT,
  [SUB_FEATURES.MESSAGE_TO_RESOURCE]: MODULES.PROJECT,
  [SUB_FEATURES.GIF]: MODULES.COMMUNICATION,
};

/** Nhãn tiếng Việt cho cờ phụ (dòng trong tab "Tính năng" của admin). */
export const SUB_FEATURE_LABELS: Record<SubFeatureId, string> = {
  [SUB_FEATURES.WORKSPACE_SEARCH]: "Tìm kiếm toàn nhóm",
  [SUB_FEATURES.WORKSPACE_TEMPLATES]: "Mẫu nhóm",
  [SUB_FEATURES.READ_CONFIRM]: "Xác nhận đã đọc thông báo",
  [SUB_FEATURES.MEETING_RECORDING]: "Ghi hình cuộc họp",
  [SUB_FEATURES.POLLS]: "Khảo sát trong chat",
  [SUB_FEATURES.SCHEDULED_MESSAGES]: "Tin nhắn hẹn giờ",
  [SUB_FEATURES.MESSAGE_REMINDERS]: "Nhắc lại tin nhắn",
  [SUB_FEATURES.MESSAGE_TO_TASK]: "Chuyển tin nhắn thành công việc",
  [SUB_FEATURES.MESSAGE_TO_RESOURCE]: "Lưu tệp của tin nhắn vào tài liệu",
  [SUB_FEATURES.GIF]: "GIF/sticker (chưa có nhà cung cấp)",
};

export const SUB_FEATURE_IDS = Object.values(SUB_FEATURES) as SubFeatureId[];

/** Nhãn tiếng Việt cho registry `features` (admin UI sinh form từ đây, be.md p0-07 §9). */
export const MODULE_LABELS: Record<ModuleId, string> = {
  [MODULES.COMMUNICATION]: "Nhắn tin & kênh",
  [MODULES.VOICE]: "Gọi thoại/video",
  [MODULES.PROJECT]: "Quản lý dự án",
  [MODULES.STUDY]: "Học tập",
  [MODULES.LIVE_QUIZ]: "Live quiz",
  [MODULES.COLLAB]: "Tài liệu cộng tác",
  [MODULES.INTEGRATION]: "Tích hợp",
  [MODULES.CUSTOM_ROLES]: "Vai trò tuỳ chỉnh",
  [MODULES.MENTOR]: "Mentor",
  [MODULES.WALLET]: "Ví/chi tiêu nhóm",
  [MODULES.O2O]: "O2O",
  [MODULES.PLAGIARISM]: "Chống đạo văn",
  [MODULES.GAMIFICATION]: "Gamification",
  [MODULES.COINS]: "Coins",
  [MODULES.BURNOUT]: "Burnout",
  [MODULES.CAREER]: "Career",
  [MODULES.AI]: "AI (tạm dừng)",
  [MODULES.AI_ASSISTANT]: "Trợ lý AI (tạm dừng)",
  [MODULES.KNOWLEDGE]: "Cơ sở tri thức (tạm dừng)",
  [MODULES.PUSH]: "Thông báo đẩy",
  [MODULES.MEETING]: "Lịch họp/phòng họp",
  [MODULES.POMODORO]: "Phòng Pomodoro",
  [MODULES.ROADMAP]: "Lộ trình học",
};

export function parseFeatureFlags(raw: string | undefined): {
  flags: Record<ModuleId, boolean>;
  unknown: string[];
} {
  const flags = { ...DEFAULT_FEATURE_FLAGS };
  const unknown: string[] = [];
  for (const pair of (raw ?? "").split(",")) {
    const [k, v] = pair.split("=").map((s) => s.trim());
    if (!k) continue;
    if (!(k in flags)) {
      unknown.push(k);
      continue;
    }
    flags[k as ModuleId] = v === undefined || v === "" || v === "true" || v === "1";
  }
  return { flags, unknown };
}

/** Cờ hiện hành (env ghi đè mặc định) — đọc một lần lúc khởi động. */
const parsed = parseFeatureFlags(env.FEATURE_FLAGS);
export const FEATURE_FLAGS: Readonly<Record<ModuleId, boolean>> = parsed.flags;
export const UNKNOWN_FLAGS: readonly string[] = parsed.unknown;
export const isModuleEnabled = (m: ModuleId): boolean => FEATURE_FLAGS[m];
