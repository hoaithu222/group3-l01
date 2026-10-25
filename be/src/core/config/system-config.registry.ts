/**
 * @file system-config.registry.ts
 * @description Nguồn sự thật DUY NHẤT cho các khoá `SystemConfig` hợp lệ
 * (p0-07 be.md §3) — mỗi khoá có schema Zod (validate `PUT`), danh sách field
 * kèm mặc định/`floor`/`ceil` (admin UI sinh form + `RuntimeConfigService`
 * merge/clamp), và `affects` (khoá này ảnh hưởng `capabilities` và/hoặc chỉ
 * đọc runtime nội bộ).
 *
 * Trần cứng (`floor`/`ceil`) đọc từ `LIMITS`/env — `SystemConfig` chỉ được
 * override TRONG khoảng này, không vượt năng lực hạ tầng đã đo (be.md §2).
 */
import { z } from "zod";
import { env } from "./env.schema";
import { LIMITS } from "../constants/limits";
import {
  MODULES,
  MODULE_LABELS,
  FEATURE_FLAGS,
  SUB_FEATURE_IDS,
  SUB_FEATURE_LABELS,
  subFeatureDefault,
  type ModuleId,
  type SubFeatureId,
} from "../constants/modules";
import { COLUMN_KINDS, DEFAULT_BOARD_COLUMNS } from "../constants/project";
import {
  CONTRIBUTION_DEFAULTS_CONFIG_KEY,
  CONTRIBUTION_GRACE_HOURS_MAX,
  CONTRIBUTION_UNESTIMATED_POINTS_MAX,
  CONTRIBUTION_WEIGHT_TOTAL,
  DEFAULT_CONTRIBUTION_CONFIG,
} from "../constants/contribution";
import {
  INTEGRATION_KEY_TO_PROVIDER,
  INTEGRATION_PROVIDER_KEYS,
  INTEGRATION_PROVIDER_LABELS,
  INTEGRATIONS_CONFIG_KEY,
} from "../constants/integration";
import { BURNOUT_RULES_CONFIG_KEY, DEFAULT_BURNOUT_RULE_SET, burnoutRuleSetSchema } from "../constants/burnout";
import { DEFAULT_TIME_ZONE, safeTimeZone } from "../utils/local-date";
import { parseSize } from "../utils/size";

/**
 * `enum` (p1-07): một giá trị trong `options` (vd chế độ thông báo `ALL|MENTIONS_AND_THREADS|MUTED`) — KHÔNG floor/ceil;
 * `schema` Zod của khoá kiểm hợp lệ, admin UI sinh `<select>` từ `options`.
 *
 * `json` (Phase 3): giá trị có cấu trúc (mảng/object) — KHÔNG floor/ceil; chỉ `schema` Zod của khoá kiểm hợp lệ.
 * Admin UI cần editor riêng cho kind này (vd `pm.defaultColumns`, `resource.quotaOverrides`).
 */
export type ConfigFieldKind = "int" | "bool" | "string[]" | "bytes" | "json" | "enum";

export interface ConfigField {
  /** Đường dẫn field TRONG `value` của khoá (hỗ trợ 1 cấp lồng, vd "appLock.enabled"). */
  path: string;
  label: string;
  kind: ConfigFieldKind;
  default: unknown;
  /** Chỉ áp dụng cho kind "int"/"bytes". */
  floor?: number;
  /** Số cố định hoặc hàm tính trần theo env (đọc tại thời điểm dùng, không cache lúc import). */
  ceil?: number | (() => number);
  unit?: "s" | "ms" | "bytes" | "count" | "min" | "days";
  /** Chỉ kind "enum" — danh sách giá trị hợp lệ theo thứ tự hiển thị. */
  options?: readonly string[];
}

export type ConfigTab = "limits" | "features" | "auth" | "storage" | "notifications" | "media" | "jobs" | "pm";

export interface ConfigKeyDef {
  key: string;
  tab: ConfigTab;
  label: string;
  schema: z.ZodTypeAny;
  fields: ConfigField[];
  affects: ("capabilities" | "runtime")[];
}

/** Cờ bật/tắt một nhà cung cấp tích hợp (p5-03) — khoá lạ trong nhánh này bị từ chối (`.strict()`). */
const PROVIDER_TOGGLE = z.object({ enabled: z.boolean() }).partial().strict();

const MODULE_IDS = Object.values(MODULES) as ModuleId[];
/** Khoá hợp lệ của `features`: phân hệ + cờ phụ của tiện ích (p5-04) — cờ phụ mặc định BẬT. */
const FEATURE_KEYS = [...MODULE_IDS, ...SUB_FEATURE_IDS] as [ModuleId | SubFeatureId, ...(ModuleId | SubFeatureId)[]];
const NOTIFY_MODE_OPTIONS = ["ALL", "MENTIONS_AND_THREADS", "MUTED"] as const;
const LOCK_SCREEN_OPTIONS = ["HIDDEN", "SENDER", "FULL"] as const;
/** Gợi ý cho select ở admin; `PUT` vẫn nhận mọi múi giờ IANA hợp lệ (schema kiểm bằng `safeTimeZone`). */
const PM_TIMEZONE_OPTIONS = [DEFAULT_TIME_ZONE, "Asia/Bangkok", "Asia/Singapore", "Asia/Tokyo", "Asia/Seoul", "Europe/London", "America/New_York", "UTC"] as const;
/** Lịch hằng tuần `phút giờ * * thứ(0–6)` — KHỚP `weeklyCronSchema`/`parseWeeklyCron` của `modules/wallet` (core không import module; test đối chiếu hai bản). */
export const WALLET_WEEKLY_CRON_RE = /^([0-5]?\d) ([01]?\d|2[0-3]) \* \* ([0-6])$/;
/** Gợi ý lịch nhắc nợ cho select admin (thứ Sáu 09:00 là mặc định của mã). */
const WALLET_CRON_OPTIONS = ["0 9 * * 5", "0 18 * * 5", "0 9 * * 1", "0 9 * * 6"] as const;
/** Họ ngôn ngữ mã nguồn của lexer quét trùng lặp (p7-05 be.md §9) — khớp `CodeLanguage` của `modules/plagiarism/lib/types.ts`. */
const PLAGIARISM_CODE_LANGUAGE_OPTIONS = ["c-like", "python", "sql", "markup"] as const;

export const SYSTEM_CONFIG_REGISTRY: Record<string, ConfigKeyDef> = {
  "limits.message": {
    key: "limits.message",
    tab: "limits",
    label: "Tin nhắn",
    affects: ["capabilities", "runtime"],
    schema: z
      .object({
        maxChars: z.number().int(),
        attachmentsMax: z.number().int(),
        editWindowSeconds: z.number().int(),
        voiceNoteMaxSeconds: z.number().int(),
      })
      .partial(),
    fields: [
      {
        path: "maxChars",
        label: "Số ký tự tối đa",
        kind: "int",
        default: LIMITS.message.maxChars,
        floor: 100,
        ceil: LIMITS.message.maxChars,
        unit: "count",
      },
      {
        path: "attachmentsMax",
        label: "Tệp/tin tối đa",
        kind: "int",
        default: LIMITS.message.attachmentsMax,
        floor: 1,
        ceil: 10,
        unit: "count",
      },
      {
        path: "editWindowSeconds",
        label: "Cửa sổ sửa tin",
        kind: "int",
        default: LIMITS.message.editWindowSeconds,
        floor: 0,
        ceil: 86400,
        unit: "s",
      },
      {
        path: "voiceNoteMaxSeconds",
        label: "Voice note tối đa",
        kind: "int",
        default: LIMITS.message.voiceNoteMaxSeconds,
        floor: 30,
        ceil: 600,
        unit: "s",
      },
    ],
  },

  "limits.conversation": {
    key: "limits.conversation",
    tab: "limits",
    label: "Hội thoại/kênh",
    affects: ["capabilities", "runtime"],
    schema: z
      .object({
        titleMax: z.number().int(),
        membersMax: z.number().int(),
        pinMax: z.number().int(),
        forwardTargetsMax: z.number().int(),
      })
      .partial(),
    fields: [
      { path: "titleMax", label: "Độ dài tiêu đề", kind: "int", default: LIMITS.conversation.titleMax, floor: 10, ceil: 200 },
      { path: "membersMax", label: "Số thành viên tối đa", kind: "int", default: LIMITS.conversation.membersMax, floor: 2, ceil: 200 },
      { path: "pinMax", label: "Số tin ghim tối đa", kind: "int", default: LIMITS.conversation.pinMax, floor: 1, ceil: 20 },
      {
        path: "forwardTargetsMax",
        label: "Số đích chuyển tiếp tối đa",
        kind: "int",
        default: LIMITS.conversation.forwardTargetsMax,
        floor: 1,
        ceil: 10,
      },
    ],
  },

  "limits.call": {
    key: "limits.call",
    tab: "limits",
    label: "Cuộc gọi",
    affects: ["capabilities", "runtime"],
    schema: z
      .object({
        ringTimeoutSeconds: z.number().int(),
        ringMaxInvitees: z.number().int(),
        maxParticipants: z.number().int(),
        reconnectGraceSeconds: z.number().int(),
        tokenTtlSeconds: z.number().int(),
      })
      .partial(),
    fields: [
      { path: "ringTimeoutSeconds", label: "Thời gian đổ chuông", kind: "int", default: LIMITS.call.ringTimeoutSeconds, floor: 20, ceil: 60, unit: "s" },
      { path: "ringMaxInvitees", label: "Số người mời tối đa", kind: "int", default: LIMITS.call.ringMaxInvitees, floor: 2, ceil: 16 },
      { path: "maxParticipants", label: "Số người tham gia tối đa", kind: "int", default: LIMITS.call.maxParticipants, floor: 2, ceil: 16 },
      {
        path: "reconnectGraceSeconds",
        label: "Thời gian chờ kết nối lại",
        kind: "int",
        default: LIMITS.call.reconnectGraceSeconds,
        floor: 10,
        ceil: 60,
        unit: "s",
      },
      { path: "tokenTtlSeconds", label: "TTL token media", kind: "int", default: LIMITS.call.tokenTtlSeconds, floor: 300, ceil: 3600, unit: "s" },
    ],
  },

  "limits.meeting": {
    key: "limits.meeting",
    tab: "limits",
    label: "Cuộc họp",
    affects: ["capabilities", "runtime"],
    schema: z
      .object({
        titleMax: z.number().int(),
        agendaMax: z.number().int(),
        remindersMax: z.number().int(),
        attendeesMax: z.number().int(),
        joinWindowMinutes: z.number().int(),
        maxParticipants: z.number().int(),
        maxMinutes: z.number().int(),
        restartWindowMinutes: z.number().int(),
      })
      .partial(),
    // Thứ tự = bảng admin.md p2-04 §2.2 (form admin dựng theo thứ tự này). Trần = `LIMITS.meeting` (mã thật của DTO).
    fields: [
      { path: "titleMax", label: "Độ dài tiêu đề", kind: "int", default: LIMITS.meeting.titleMax, floor: 1, ceil: 255 },
      { path: "agendaMax", label: "Độ dài nội dung cuộc họp", kind: "int", default: LIMITS.meeting.agendaMax, floor: 0, ceil: 2000 },
      { path: "remindersMax", label: "Số lời nhắc tối đa", kind: "int", default: LIMITS.meeting.remindersMax, floor: 0, ceil: 3 },
      // Sàn 2 (admin.md p2-04 §2.2): chủ trì + ít nhất một người được mời. Sàn cũ 1 chỉ còn chủ trì → không mời được ai.
      { path: "attendeesMax", label: "Số người mời tối đa", kind: "int", default: LIMITS.meeting.attendeesMax, floor: 2, ceil: 200 },
      {
        path: "joinWindowMinutes",
        label: "Cửa sổ tham gia trước giờ họp",
        kind: "int",
        default: LIMITS.meeting.joinWindowMinutes,
        floor: 0,
        ceil: 60,
        unit: "min",
      },
      { path: "maxParticipants", label: "Số người tham gia tối đa", kind: "int", default: LIMITS.meeting.maxParticipants, floor: 2, ceil: 50 },
      { path: "maxMinutes", label: "Thời lượng tối đa", kind: "int", default: LIMITS.meeting.maxMinutes, floor: 15, ceil: 480, unit: "min" },
      {
        path: "restartWindowMinutes",
        label: "Thời hạn bắt đầu lại sau khi kết thúc",
        kind: "int",
        default: LIMITS.meeting.restartWindowMinutes,
        floor: 0,
        ceil: 240,
        unit: "min",
      },
    ],
  },

  "limits.upload": {
    key: "limits.upload",
    tab: "limits",
    label: "Tải tệp",
    affects: ["capabilities", "runtime"],
    schema: z.object({ maxFileBytes: z.number().int() }).partial(),
    fields: [
      {
        path: "maxFileBytes",
        label: "Kích thước tệp tối đa",
        kind: "bytes",
        default: Math.min(LIMITS.upload.maxFileBytes, parseSize(env.MAX_FILE_SIZE)),
        floor: 1024 * 1024,
        // Trần = min(LIMITS gốc, MAX_FILE_SIZE env) — đọc lại mỗi lần dùng,
        // phòng khi env đổi giữa các lần deploy (be.md §2 "Trần cứng").
        ceil: () => Math.min(LIMITS.upload.maxFileBytes, parseSize(env.MAX_FILE_SIZE)),
        unit: "bytes",
      },
    ],
  },

  "limits.invite": {
    key: "limits.invite",
    tab: "limits",
    label: "Lời mời",
    affects: ["runtime"],
    schema: z.object({ defaultMaxUses: z.number().int(), maxUsesMax: z.number().int() }).partial(),
    fields: [
      {
        path: "defaultMaxUses",
        label: "Số lượt dùng mặc định",
        kind: "int",
        default: LIMITS.invite.defaultMaxUses,
        floor: LIMITS.invite.maxUsesMin,
        ceil: LIMITS.invite.maxUsesMax,
      },
      {
        path: "maxUsesMax",
        label: "Số lượt dùng tối đa cho phép",
        kind: "int",
        default: LIMITS.invite.maxUsesMax,
        floor: LIMITS.invite.maxUsesMin,
        ceil: 100,
      },
    ],
  },

  "limits.wallet": {
    key: "limits.wallet",
    tab: "limits",
    label: "Ví nhóm",
    affects: ["capabilities", "runtime"],
    schema: z.object({ expenseMax: z.number().int(), participantsMax: z.number().int(), reminderMinDebt: z.number().int() }).partial(),
    fields: [
      {
        path: "expenseMax",
        label: "Số tiền tối đa mỗi khoản chi",
        kind: "int",
        default: LIMITS.wallet.expenseMax,
        floor: 1_000,
        ceil: LIMITS.wallet.expenseMax,
        unit: "count",
      },
      {
        path: "participantsMax",
        label: "Số người tham gia tối đa mỗi khoản chi",
        kind: "int",
        default: LIMITS.wallet.participantsMax,
        floor: 2,
        ceil: LIMITS.wallet.participantsMax,
        unit: "count",
      },
      {
        path: "reminderMinDebt",
        label: "Nợ tối thiểu để bị nhắc (đồng)",
        kind: "int",
        default: LIMITS.wallet.reminderMinDebt,
        floor: 0,
        ceil: LIMITS.wallet.reminderMinDebtMax,
        unit: "count",
      },
    ],
  },

  /**
   * Kinh tế xu (p7-02 be.md §9) — admin chỉ HẠ được hai trần chống lạm phát/lạm dụng: xu nhận từ sự kiện mỗi ngày và mức điều chỉnh tối đa một lần. Service `coins` đọc RUNTIME qua
   * `runtimeConfig` (`coins/services/coins-limits.ts`); DTO Zod dùng trần cứng `LIMITS.coins`. `dailyEarnCap` sàn 0 = tắt nhận xu từ sự kiện (khẩn cấp) mà không tắt cả phân hệ.
   * ⚠ `balanceMax` KHÔNG ở đây (giới hạn kỹ thuật Int32, không phải chính sách).
   */
  "limits.coins": {
    key: "limits.coins",
    tab: "limits",
    label: "Kinh tế xu",
    affects: ["runtime"],
    schema: z.object({ dailyEarnCap: z.number().int(), adjustMax: z.number().int() }).partial(),
    fields: [
      { path: "dailyEarnCap", label: "Xu nhận từ sự kiện tối đa mỗi ngày", kind: "int", default: LIMITS.coins.dailyEarnCap, floor: 0, ceil: LIMITS.coins.dailyEarnCap, unit: "count" },
      { path: "adjustMax", label: "Mức admin điều chỉnh xu tối đa một lần", kind: "int", default: LIMITS.coins.adjustMax, floor: 1, ceil: LIMITS.coins.adjustMax, unit: "count" },
    ],
  },

  /**
   * Chợ tài liệu (p7-02 README §7, P1) — khoá NHÓM `economy` (đọc bằng `runtimeConfig.getEffective("economy")` ở `coins/services/marketplace.ports.ts`). `marketplaceEnabled` MẶC ĐỊNH TẮT
   * (chủ dự án phải duyệt điều khoản bản quyền tài liệu bán trước khi bật ở môi trường có người dùng thật, README §10 "Rủi ro và điểm mở"). `marketplaceFeePercent`/`sellerMinLevel` chỉ có
   * hiệu lực khi chợ đã bật. Đọc RUNTIME nội bộ, không vào `capabilities`.
   */
  economy: {
    key: "economy",
    tab: "features",
    label: "Chợ tài liệu (Coins)",
    affects: ["runtime"],
    schema: z.object({ marketplaceEnabled: z.boolean(), marketplaceFeePercent: z.number().int().min(0).max(50), sellerMinLevel: z.number().int().min(1).max(200) }).partial(),
    fields: [
      { path: "marketplaceEnabled", label: "Bật chợ tài liệu (cần điều khoản bản quyền đã duyệt)", kind: "bool", default: false },
      { path: "marketplaceFeePercent", label: "Phí nền tảng mỗi giao dịch (%)", kind: "int", default: 10, floor: 0, ceil: 50, unit: "count" },
      { path: "sellerMinLevel", label: "Cấp độ tối thiểu để tin niêm yết được duyệt tự động", kind: "int", default: 5, floor: 1, ceil: 200, unit: "count" },
    ],
  },

  /**
   * Tài liệu cộng tác (p6-01 admin.md §2.2 nhóm "Tài liệu") — admin chỉ HẠ được so với trần cứng `LIMITS.document`. `stateMaxBytes` KHÔNG có ở đây (phụ thuộc giới hạn 16 MB
   * của Mongo — chỉ đọc). Service `documents` đọc runtime qua `runtimeConfig` (`documents/services/document-limits.ts`); `concurrentEditorsMax` được gửi cho service
   * `collab/` qua `GET /internal/documents/:id/access` (`limits.maxConnections`) nên đổi có hiệu lực không cần triển khai lại collab.
   */
  "limits.document": {
    key: "limits.document",
    tab: "limits",
    label: "Tài liệu cộng tác",
    affects: ["capabilities", "runtime"],
    schema: z
      .object({
        titleMax: z.number().int(),
        collaboratorsMax: z.number().int(),
        concurrentEditorsMax: z.number().int(),
        snapshotsAuto: z.number().int(),
        snapshotsManualMax: z.number().int(),
        perWorkspaceMax: z.number().int(),
      })
      .partial(),
    fields: [
      { path: "titleMax", label: "Độ dài tiêu đề tối đa", kind: "int", default: LIMITS.document.titleMax, floor: 20, ceil: LIMITS.document.titleMax, unit: "count" },
      { path: "collaboratorsMax", label: "Số người cộng tác tối đa / tài liệu", kind: "int", default: LIMITS.document.collaboratorsMax, floor: 1, ceil: LIMITS.document.collaboratorsMax, unit: "count" },
      { path: "concurrentEditorsMax", label: "Số người mở đồng thời tối đa / tài liệu", kind: "int", default: LIMITS.document.concurrentEditorsMax, floor: 2, ceil: LIMITS.document.concurrentEditorsMax, unit: "count" },
      { path: "snapshotsAuto", label: "Số bản lưu tự động giữ lại", kind: "int", default: LIMITS.document.snapshotsAuto, floor: 1, ceil: LIMITS.document.snapshotsAuto, unit: "count" },
      { path: "snapshotsManualMax", label: "Số bản lưu thủ công tối đa / tài liệu", kind: "int", default: LIMITS.document.snapshotsManualMax, floor: 1, ceil: LIMITS.document.snapshotsManualMax, unit: "count" },
      { path: "perWorkspaceMax", label: "Số tài liệu đang dùng tối đa / nhóm", kind: "int", default: LIMITS.document.perWorkspaceMax, floor: 1, ceil: LIMITS.document.perWorkspaceMax, unit: "count" },
    ],
  },

  /**
   * Bộ học (p4-01 admin.md §2.2 nhóm "Học tập") — CHỈ các trần mà service `study` đọc runtime qua `runtimeConfig` (`study/services/study-limits.ts`): số mục/bộ,
   * số bộ/người, số lựa chọn/câu. Trần cứng = `LIMITS.study` (DTO Zod dùng trần cứng; admin chỉ HẠ được). ⚠ Dung lượng ảnh mục học (`LIMITS.upload.scopeRestrict.STUDY`)
   * KHÔNG nằm ở đây: `mime-policy` đọc tĩnh nên khoá chỉnh được sẽ không có hiệu lực.
   */
  "limits.study": {
    key: "limits.study",
    tab: "limits",
    label: "Học tập (bộ học)",
    affects: ["runtime"],
    schema: z.object({ itemsPerSetMax: z.number().int(), setsPerUserMax: z.number().int(), optionsMax: z.number().int() }).partial(),
    fields: [
      { path: "itemsPerSetMax", label: "Số mục tối đa / bộ", kind: "int", default: LIMITS.study.itemsPerSetMax, floor: 10, ceil: LIMITS.study.itemsPerSetMax, unit: "count" },
      { path: "setsPerUserMax", label: "Số bộ tối đa / người", kind: "int", default: LIMITS.study.setsPerUserMax, floor: 1, ceil: LIMITS.study.setsPerUserMax, unit: "count" },
      { path: "optionsMax", label: "Số lựa chọn tối đa / câu hỏi", kind: "int", default: LIMITS.study.optionsMax, floor: LIMITS.study.optionsMin, ceil: LIMITS.study.optionsMax, unit: "count" },
    ],
  },

  /**
   * Mở rộng chat (p7-04 be.md §9) — admin chỉ HẠ được so với trần cứng `LIMITS.poll|scheduledMessage|reminder` (DTO Zod dùng trần cứng; service `chat-extensions` đọc runtime qua
   * `chat-extensions/services/chat-extensions-limits.ts`). Số lựa chọn TỐI THIỂU (`optionsMin`), độ dài hạn tối thiểu và nhịp emit KHÔNG chỉnh được (bất biến giao thức).
   */
  "limits.poll": {
    key: "limits.poll",
    tab: "limits",
    label: "Khảo sát trong chat",
    affects: ["capabilities", "runtime"],
    schema: z.object({ optionsMax: z.number().int(), questionMax: z.number().int(), optionMax: z.number().int(), closesInMaxDays: z.number().int() }).partial(),
    fields: [
      { path: "optionsMax", label: "Số lựa chọn tối đa / khảo sát", kind: "int", default: LIMITS.poll.optionsMax, floor: LIMITS.poll.optionsMin, ceil: LIMITS.poll.optionsMax, unit: "count" },
      { path: "questionMax", label: "Độ dài câu hỏi tối đa", kind: "int", default: LIMITS.poll.questionMax, floor: 20, ceil: LIMITS.poll.questionMax, unit: "count" },
      { path: "optionMax", label: "Độ dài mỗi lựa chọn tối đa", kind: "int", default: LIMITS.poll.optionMax, floor: 10, ceil: LIMITS.poll.optionMax, unit: "count" },
      { path: "closesInMaxDays", label: "Hạn chốt tối đa", kind: "int", default: LIMITS.poll.closesInMaxDays, floor: 1, ceil: LIMITS.poll.closesInMaxDays, unit: "days" },
    ],
  },
  "limits.scheduledMessage": {
    key: "limits.scheduledMessage",
    tab: "limits",
    label: "Tin nhắn hẹn giờ",
    affects: ["capabilities", "runtime"],
    schema: z.object({ pendingPerUserMax: z.number().int(), sendAtMaxDays: z.number().int() }).partial(),
    fields: [
      { path: "pendingPerUserMax", label: "Số tin đang chờ tối đa / người", kind: "int", default: LIMITS.scheduledMessage.pendingPerUserMax, floor: 1, ceil: LIMITS.scheduledMessage.pendingPerUserMax, unit: "count" },
      { path: "sendAtMaxDays", label: "Hẹn xa nhất", kind: "int", default: LIMITS.scheduledMessage.sendAtMaxDays, floor: 1, ceil: LIMITS.scheduledMessage.sendAtMaxDays, unit: "days" },
    ],
  },
  "limits.reminder": {
    key: "limits.reminder",
    tab: "limits",
    label: "Nhắc lại tin nhắn",
    affects: ["capabilities", "runtime"],
    schema: z.object({ pendingPerUserMax: z.number().int(), remindAtMaxDays: z.number().int() }).partial(),
    fields: [
      { path: "pendingPerUserMax", label: "Số lời nhắc đang chờ tối đa / người", kind: "int", default: LIMITS.reminder.pendingPerUserMax, floor: 1, ceil: LIMITS.reminder.pendingPerUserMax, unit: "count" },
      { path: "remindAtMaxDays", label: "Hẹn nhắc xa nhất", kind: "int", default: LIMITS.reminder.remindAtMaxDays, floor: 1, ceil: LIMITS.reminder.remindAtMaxDays, unit: "days" },
    ],
  },

  "limits.presence": {
    key: "limits.presence",
    tab: "limits",
    label: "Trạng thái hoạt động",
    affects: ["runtime"],
    schema: z
      .object({ heartbeatSeconds: z.number().int(), leaseSeconds: z.number().int(), idleAfterMinutes: z.number().int() })
      .partial(),
    fields: [
      { path: "heartbeatSeconds", label: "Chu kỳ heartbeat", kind: "int", default: LIMITS.presence.heartbeatSeconds, floor: 5, ceil: 120, unit: "s" },
      { path: "leaseSeconds", label: "Thời hạn lease", kind: "int", default: LIMITS.presence.leaseSeconds, floor: 30, ceil: 600, unit: "s" },
      {
        path: "idleAfterMinutes",
        label: "Chuyển 'vắng mặt' sau",
        kind: "int",
        default: LIMITS.presence.idleAfterMinutes,
        floor: 1,
        ceil: 60,
        unit: "min",
      },
    ],
  },

  "limits.recording": {
    key: "limits.recording",
    tab: "limits",
    label: "Lưu trữ ghi âm/ghi hình",
    affects: ["capabilities", "runtime"],
    schema: z.object({ retentionDays: z.number().int(), concurrentMax: z.number().int(), maxMinutes: z.number().int() }).partial(),
    fields: [
      { path: "retentionDays", label: "Số ngày lưu trữ", kind: "int", default: LIMITS.recording.retentionDays, floor: 7, ceil: 365, unit: "days" },
      // (p2-06) Số bản ghi hình họp chạy đồng thời toàn hệ thống (mỗi RoomComposite ≈ 2–4 vCPU của node egress); 0 = tạm khoá ghi hình mới.
      { path: "concurrentMax", label: "Số bản ghi hình chạy đồng thời", kind: "int", default: LIMITS.recording.concurrentMax, floor: 0, ceil: 16, unit: "count" },
      // (p2-06) Trần thời lượng MỘT lần ghi — `Asset.size` Int32 nên trần cứng = LIMITS.recording.maxMinutes.
      { path: "maxMinutes", label: "Thời lượng tối đa một lần ghi", kind: "int", default: LIMITS.recording.maxMinutes, floor: 5, ceil: LIMITS.recording.maxMinutes, unit: "min" },
    ],
  },

  /** Biên bản họp (p2-06) — số tệp đính kèm tối đa/biên bản (nội dung tối đa `contentMax` là trần cứng của DTO, không đổi runtime). */
  "limits.meetingRecap": {
    key: "limits.meetingRecap",
    tab: "limits",
    label: "Biên bản họp",
    affects: ["capabilities", "runtime"],
    schema: z.object({ attachmentsMax: z.number().int() }).partial(),
    fields: [{ path: "attachmentsMax", label: "Tệp đính kèm/biên bản", kind: "int", default: LIMITS.meetingRecap.attachmentsMax, floor: 0, ceil: 20, unit: "count" }],
  },

  // ── Phase 3 (foundation) — Dự án & Tài liệu ────────────────────────────────
  // DTO Zod của module dùng TRẦN CỨNG (`LIMITS.*` lúc import); giá trị admin override thấp hơn trần chỉ
  // được kiểm ở SERVICE qua `runtimeConfig.getLimits()` (quy ước reuse-first.md, `SYSTEM_CONFIG_REGISTRY`).

  /** Kho tài liệu (p3-01) — `tab: storage` (admin.md p3-01 §2.2). Hạn mức riêng theo workspace: khoá `resource`. */
  "limits.resource": {
    key: "limits.resource",
    tab: "storage",
    label: "Kho tài liệu",
    affects: ["capabilities", "runtime"],
    schema: z.object({ workspaceQuotaBytes: z.number().int(), trashRetentionDays: z.number().int() }).partial(),
    fields: [
      {
        path: "workspaceQuotaBytes",
        label: "Hạn mức mặc định / nhóm",
        kind: "bytes",
        default: LIMITS.resource.workspaceQuotaBytes,
        floor: 512 * 1024 * 1024,
        ceil: 100 * 1024 * 1024 * 1024,
        unit: "bytes",
      },
      {
        path: "trashRetentionDays",
        label: "Số ngày giữ thùng rác",
        kind: "int",
        default: LIMITS.resource.trashRetentionDays,
        floor: 7,
        ceil: 90,
        unit: "days",
      },
    ],
  },

  /** Hạn mức kho tài liệu RIÊNG theo workspace (p3-01 README §7 `resource.quotaOverrides`) — ghi qua admin `resource-quota`. */
  resource: {
    key: "resource",
    tab: "storage",
    label: "Kho tài liệu — hạn mức riêng",
    affects: ["runtime"],
    schema: z
      .object({
        quotaOverrides: z
          .array(
            z.object({
              workspaceId: z.string().regex(/^[0-9a-fA-F]{24}$/),
              /** 0,5–100 GiB (admin.md p3-01 §2.1). */
              bytes: z
                .number()
                .int()
                .min(512 * 1024 * 1024)
                .max(100 * 1024 * 1024 * 1024),
            })
          )
          .max(500),
      })
      .partial(),
    fields: [{ path: "quotaOverrides", label: "Hạn mức riêng theo nhóm", kind: "json", default: [] }],
  },

  /** Bảng công việc (p3-02) — `tab: pm` (admin `system-config?tab=pm`). `perWorkspaceMax` có thể nâng tới 100 (README p3-02 §10). */
  "limits.board": {
    key: "limits.board",
    tab: "pm",
    label: "Bảng công việc",
    affects: ["capabilities", "runtime"],
    schema: z.object({ columnsMax: z.number().int(), perWorkspaceMax: z.number().int() }).partial(),
    fields: [
      { path: "columnsMax", label: "Số cột tối đa / bảng", kind: "int", default: LIMITS.board.columnsMax, floor: 2, ceil: LIMITS.board.columnsMax, unit: "count" },
      { path: "perWorkspaceMax", label: "Số bảng tối đa / nhóm", kind: "int", default: LIMITS.board.perWorkspaceMax, floor: 1, ceil: 100, unit: "count" },
    ],
  },

  /** Thẻ (p3-02/p3-03) — `tab: pm`. */
  "limits.task": {
    key: "limits.task",
    tab: "pm",
    label: "Thẻ công việc",
    affects: ["capabilities", "runtime"],
    schema: z
      .object({
        perBoardMax: z.number().int(),
        dependenciesMax: z.number().int(),
        dependencyGraphVisitMax: z.number().int(),
        rescheduleSyncMax: z.number().int(),
        rescheduleBulkMax: z.number().int(),
        rescheduleEmitEachMax: z.number().int(),
      })
      .partial(),
    fields: [
      { path: "perBoardMax", label: "Số thẻ tối đa / bảng", kind: "int", default: LIMITS.task.perBoardMax, floor: 100, ceil: LIMITS.task.perBoardMax, unit: "count" },
      // p4-04 (phụ thuộc & dời lịch) — trần cứng = giá trị mã; admin chỉ HẠ được. Service đọc qua `runtimeConfig` (DTO không đọc runtime).
      { path: "dependenciesMax", label: "Số phụ thuộc tối đa / thẻ (mỗi chiều)", kind: "int", default: LIMITS.task.dependenciesMax, floor: 1, ceil: LIMITS.task.dependenciesMax, unit: "count" },
      { path: "dependencyGraphVisitMax", label: "Số cạnh tối đa được duyệt khi kiểm vòng / dựng chuỗi dời lịch", kind: "int", default: LIMITS.task.dependencyGraphVisitMax, floor: 100, ceil: LIMITS.task.dependencyGraphVisitMax, unit: "count" },
      { path: "rescheduleSyncMax", label: "Dời lịch ≤ ngần này thẻ thì áp đồng bộ (lớn hơn → chạy nền)", kind: "int", default: LIMITS.task.rescheduleSyncMax, floor: 1, ceil: LIMITS.task.rescheduleSyncMax, unit: "count" },
      { path: "rescheduleBulkMax", label: "Số thẻ tối đa của một lần dời lịch", kind: "int", default: LIMITS.task.rescheduleBulkMax, floor: 1, ceil: LIMITS.task.rescheduleBulkMax, unit: "count" },
      { path: "rescheduleEmitEachMax", label: "Dời lịch ≤ ngần này thẻ thì phát realtime từng thẻ", kind: "int", default: LIMITS.task.rescheduleEmitEachMax, floor: 0, ceil: LIMITS.task.rescheduleEmitEachMax, unit: "count" },
    ],
  },

  /** Gantt (p4-04, P1) — `tab: pm`. Trần cứng = `LIMITS.gantt`. */
  "limits.gantt": {
    key: "limits.gantt",
    tab: "pm",
    label: "Gantt / đường găng",
    affects: ["capabilities", "runtime"],
    schema: z.object({ rangeMaxDays: z.number().int(), tasksMax: z.number().int() }).partial(),
    fields: [
      { path: "rangeMaxDays", label: "Khoảng ngày tối đa của một lần xem", kind: "int", default: LIMITS.gantt.rangeMaxDays, floor: 7, ceil: LIMITS.gantt.rangeMaxDays, unit: "days" },
      { path: "tasksMax", label: "Số thẻ tối đa trả về (vượt → truncated)", kind: "int", default: LIMITS.gantt.tasksMax, floor: 50, ceil: LIMITS.gantt.tasksMax, unit: "count" },
    ],
  },

  /** Mẫu cột khi tạo bảng (p3-02 be.md §9 `pm.defaultColumns`): 2–12 cột, đúng 1 cột `DONE`. */
  pm: {
    key: "pm",
    tab: "pm",
    label: "Dự án",
    affects: ["runtime"],
    schema: z
      .object({
        defaultColumns: z
          .array(
            z.object({
              title: z.string().trim().min(1).max(LIMITS.board.columnTitleMax),
              kind: z.enum(COLUMN_KINDS),
              wipLimit: z.number().int().min(1).max(500).nullable().optional(),
            })
          )
          .min(2)
          .max(LIMITS.board.columnsMax)
          .refine((cols) => cols.filter((c) => c.kind === "DONE").length === 1, "Phải có đúng một cột Hoàn thành"),
        // p4-04: múi giờ IANA tính "ngày" cho dời lịch/Gantt (p1-01 chưa có `Workspace.timezone` — có thì ưu tiên trường đó).
        timezone: z.string().refine((tz) => safeTimeZone(tz) === tz, "Múi giờ IANA không hợp lệ"),
      })
      .partial(),
    fields: [
      { path: "defaultColumns", label: "Cột mặc định khi tạo bảng", kind: "json", default: DEFAULT_BOARD_COLUMNS },
      { path: "timezone", label: "Múi giờ tính ngày/tuần/tháng (dời lịch, Gantt, báo cáo đóng góp)", kind: "enum", options: PM_TIMEZONE_OPTIONS, default: DEFAULT_TIME_ZONE },
    ],
  },

  /**
   * Chấm chéo (p4-05 README §7) — mặc định cho BẢNG MỚI (bảng đang có giữ cấu hình riêng `Board.review` do chủ nhóm đặt) và các mốc nhắc
   * người chấm. Kế hoạch ghi khoá `pm.review.defaults` nhưng `systemConfigKeyParamSchema` chỉ nhận tối đa 2 đoạn ⇒ dùng `pm.review`.
   * Chỉ đọc RUNTIME nội bộ (`affects: ["runtime"]`); `reminderHours` = 1–3 mốc TĂNG DẦN (giờ kể từ lúc được giao chấm, 1–168).
   */
  "pm.review": {
    key: "pm.review",
    tab: "pm",
    label: "Chấm chéo (mặc định)",
    affects: ["runtime"],
    schema: z
      .object({
        enabledForNewBoards: z.boolean(),
        requiredReviews: z.number().int().min(1).max(LIMITS.review.requiredMax),
        reminderHours: z
          .array(z.number().int().min(1).max(168))
          .min(1)
          .max(3)
          .refine((hours) => hours.every((h, i) => i === 0 || h > hours[i - 1]), "Các mốc nhắc phải tăng dần"),
      })
      .partial(),
    fields: [
      { path: "enabledForNewBoards", label: "Bật chấm chéo cho bảng mới", kind: "bool", default: false },
      { path: "requiredReviews", label: "Số lượt duyệt mặc định", kind: "int", default: 2, floor: 1, ceil: LIMITS.review.requiredMax, unit: "count" },
      { path: "reminderHours", label: "Nhắc người chấm sau (giờ)", kind: "json", default: [24, 72] },
    ],
  },

  /**
   * Mặc định công thức đóng góp cho bảng MỚI (p4-06 README §7; khoá `pm.contribution` vì `systemConfigKeyParamSchema` chỉ nhận 1–2 đoạn) — `tab: pm`. Chỉ đọc RUNTIME nội bộ; bảng đã có
   * giữ công thức đã đóng băng lúc tạo state (không đổi âm thầm). Mọi field `json` nên form chung bỏ qua — admin dùng thẻ riêng
   * (`ContributionDefaultsCard`) có dòng tổng trọng số. Zod kiểm tổng = 100 (`CONTRIB_002` ở tầng nghiệp vụ của bảng; ở đây báo `VAL_001`).
   */
  [CONTRIBUTION_DEFAULTS_CONFIG_KEY]: {
    key: CONTRIBUTION_DEFAULTS_CONFIG_KEY,
    tab: "pm",
    label: "Đóng góp — mặc định cho bảng mới",
    affects: ["runtime"],
    schema: z
      .object({
        weights: z
          .object({
            points: z.number().int().min(0).max(CONTRIBUTION_WEIGHT_TOTAL),
            onTime: z.number().int().min(0).max(CONTRIBUTION_WEIGHT_TOTAL),
            peer: z.number().int().min(0).max(CONTRIBUTION_WEIGHT_TOTAL),
          })
          .refine((w) => w.points + w.onTime + w.peer === CONTRIBUTION_WEIGHT_TOTAL, "Tổng trọng số phải bằng 100"),
        onTimeGraceHours: z.number().int().min(0).max(CONTRIBUTION_GRACE_HOURS_MAX),
        unestimatedPoints: z.number().min(0).max(CONTRIBUTION_UNESTIMATED_POINTS_MAX).multipleOf(0.5),
      })
      .partial(),
    fields: [
      { path: "weights", label: "Trọng số điểm thẻ / đúng hạn / điểm chấm chéo (tổng 100)", kind: "json", default: DEFAULT_CONTRIBUTION_CONFIG.weights },
      { path: "onTimeGraceHours", label: "Cho phép trễ khi tính đúng hạn (giờ, 0–72)", kind: "json", default: DEFAULT_CONTRIBUTION_CONFIG.onTimeGraceHours },
      { path: "unestimatedPoints", label: "Điểm tính cho thẻ chưa gán story points (0–13, bước 0,5)", kind: "json", default: DEFAULT_CONTRIBUTION_CONFIG.unestimatedPoints },
    ],
  },

  /** Khách (p3-04) — `guest.enabledByDefault` (README §7) + các trần của `LIMITS.guest`. */
  "limits.guest": {
    key: "limits.guest",
    tab: "limits",
    label: "Khách (GUEST)",
    affects: ["capabilities", "runtime"],
    schema: z
      .object({
        defaultDays: z.number().int(),
        maxDays: z.number().int(),
        maxPerWorkspace: z.number().int(),
        enabledByDefault: z.boolean(),
      })
      .partial(),
    fields: [
      { path: "defaultDays", label: "Số ngày mặc định của khách", kind: "int", default: LIMITS.guest.defaultDays, floor: 1, ceil: LIMITS.guest.maxDays, unit: "days" },
      { path: "maxDays", label: "Số ngày tối đa của khách", kind: "int", default: LIMITS.guest.maxDays, floor: 1, ceil: LIMITS.guest.maxDays, unit: "days" },
      { path: "maxPerWorkspace", label: "Số khách tối đa / nhóm", kind: "int", default: LIMITS.guest.maxPerWorkspace, floor: 0, ceil: LIMITS.guest.maxPerWorkspace, unit: "count" },
      { path: "enabledByDefault", label: "Bật mời khách mặc định cho nhóm mới", kind: "bool", default: LIMITS.guest.enabledByDefault },
    ],
  },

  /**
   * Gamification (p4-03 README §7) — cấp độ `round(base × n^1.5)` (`gamification/services/level.ts`) và tuổi tối thiểu của thẻ để tính XP
   * (chống farm). Chỉ đọc RUNTIME nội bộ (`affects: ["runtime"]`, không vào `capabilities`); ghi qua `PUT /admin/gamification/levels` (lý do + audit).
   * ⚠ `base × maxLevel^2.5` phải nằm trong Int32 (`UserGamification.xp`) — service kiểm thêm (GAME_005).
   */
  "gamification.level": {
    key: "gamification.level",
    tab: "limits",
    label: "Cấp độ (gamification)",
    affects: ["runtime"],
    schema: z.object({ base: z.number().int(), maxLevel: z.number().int() }).partial(),
    fields: [
      { path: "base", label: "XP cơ sở mỗi cấp", kind: "int", default: 100, floor: 10, ceil: 10_000, unit: "count" },
      { path: "maxLevel", label: "Cấp độ tối đa", kind: "int", default: 100, floor: 10, ceil: 500, unit: "count" },
    ],
  },
  "gamification.minTaskAgeSec": {
    key: "gamification.minTaskAgeSec",
    tab: "limits",
    label: "Tuổi tối thiểu của thẻ để tính XP",
    affects: ["runtime"],
    schema: z.object({ value: z.number().int() }).partial(),
    fields: [
      { path: "value", label: "Giây từ lúc tạo thẻ tới lúc hoàn thành", kind: "int", default: LIMITS.gamification.minTaskAgeSec, floor: 0, ceil: LIMITS.gamification.minTaskAgeSecMax, unit: "s" },
    ],
  },
  /**
   * Bộ luật chấm điểm burnout radar (p7-03 README §7, kế hoạch ghi `burnout.rules`). Đọc RUNTIME nội bộ (`affects: ["runtime"]`, không vào `capabilities`); ghi qua `PUT /admin/wellbeing/rules`
   * (lý do + audit `wellbeing.rules-update`, CAS theo `version` của bộ luật) — schema ở đây chỉ kiểm HÌNH DẠNG (ràng buộc chéo medium < high, id duy nhất… do service kiểm và trả `WELL_003/004`;
   * đọc lúc chạy luôn qua kiểm lại, sai → dùng bộ luật mặc định). `windowDays` là `int` có floor/ceil; `levels`/`rules` là `json`.
   */
  [BURNOUT_RULES_CONFIG_KEY]: {
    key: BURNOUT_RULES_CONFIG_KEY,
    tab: "features",
    label: "Luật chấm điểm sức khoẻ học tập",
    affects: ["runtime"],
    schema: burnoutRuleSetSchema.partial(),
    fields: [
      { path: "version", label: "Phiên bản bộ luật", kind: "int", default: DEFAULT_BURNOUT_RULE_SET.version, floor: 1, ceil: 1_000_000, unit: "count" },
      { path: "windowDays", label: "Cửa sổ đánh giá", kind: "int", default: DEFAULT_BURNOUT_RULE_SET.windowDays, floor: 1, ceil: LIMITS.wellbeing.windowDaysMax, unit: "days" },
      { path: "levels", label: "Ngưỡng mức Trung bình / Cao", kind: "json", default: DEFAULT_BURNOUT_RULE_SET.levels },
      { path: "rules", label: "Danh sách luật", kind: "json", default: DEFAULT_BURNOUT_RULE_SET.rules },
    ],
  },

  /**
   * Portfolio một chạm (p6-07 README §7) — khoá NHÓM `portfolio` (đọc bằng `runtimeConfig.get("portfolio.<field>")`). `enabled` = công tắc khẩn cấp RIÊNG của portfolio (kế hoạch
   * ghi `career.portfolio`; đặt tên `portfolio.enabled` vì nhóm `career` thuộc p6-08) — tắt: mọi route portfolio + trang công khai `/p/*` trả 404; mặc định BẬT (cờ
   * `career` vẫn là cổng chính). `defaultNoindex`: portfolio MỚI tạo có `seoIndexable = !defaultNoindex` (mặc định noindex, người dùng tự bật). `bannedSlugTerms`: từ cấm trong
   * slug — so khớp CHỨA chuỗi sau `normalizeSearch` (`portfolio-slug.service.ts`). Đọc RUNTIME, không vào `capabilities`.
   */
  portfolio: {
    key: "portfolio",
    tab: "features",
    label: "Portfolio một chạm",
    affects: ["runtime"],
    schema: z
      .object({
        enabled: z.boolean(),
        defaultNoindex: z.boolean(),
        bannedSlugTerms: z.array(z.string().trim().min(2).max(LIMITS.portfolio.bannedTermMax)).max(LIMITS.portfolio.bannedTermsMax),
      })
      .partial(),
    fields: [
      { path: "enabled", label: "Cho phép Portfolio công khai (công tắc khẩn cấp)", kind: "bool", default: true },
      { path: "defaultNoindex", label: "Portfolio mới mặc định KHÔNG cho công cụ tìm kiếm lập chỉ mục", kind: "bool", default: true },
      { path: "bannedSlugTerms", label: "Từ cấm trong đường dẫn hồ sơ (chứa chuỗi, không phân biệt dấu/hoa thường)", kind: "json", default: [] },
    ],
  },

  /**
   * Recruiter board (p6-08 README §7) — khoá NHÓM `recruiter` (một đoạn, đọc bằng `runtimeConfig.get("recruiter.<field>")`; kế hoạch ghi `career.recruiter`/`career.consentVersion`
   * nhưng khoá 3 đoạn không PUT được). `enabled` = công tắc RIÊNG của bảng tin nhà tuyển dụng, mặc định TẮT (văn bản chính sách dữ liệu sinh viên phải được chủ dự án duyệt TRƯỚC
   * khi bật ở môi trường có người dùng thật) — tắt: mọi route người dùng/HR của `recruiter` (trừ admin vận hành) trả 404 `CFG_005`. `offerQuotaByTier` = hạn mức lời mời/tháng theo gói
   * (ghi đè từng công ty bằng `Company.offerQuotaOverride`). `consentVersion` = phiên bản chính sách dữ liệu mà sinh viên phải đồng ý khi bật Open to work. Đọc RUNTIME, không vào `capabilities`.
   */
  recruiter: {
    key: "recruiter",
    tab: "features",
    label: "Bảng tin nhà tuyển dụng",
    affects: ["runtime"],
    schema: z
      .object({
        enabled: z.boolean(),
        offerQuotaByTier: z
          .object({ FREE: z.number().int().min(0).max(100_000), PRO: z.number().int().min(0).max(100_000), ENTERPRISE: z.number().int().min(0).max(100_000) })
          .strict(),
        consentVersion: z.string().trim().min(1).max(20),
      })
      .partial(),
    fields: [
      { path: "enabled", label: "Bật bảng tin nhà tuyển dụng (cần văn bản chính sách dữ liệu đã duyệt)", kind: "bool", default: false },
      { path: "offerQuotaByTier", label: "Hạn mức lời mời/tháng theo gói (FREE / PRO / ENTERPRISE)", kind: "json", default: LIMITS.company.offerQuotaByTier },
      { path: "consentVersion", label: "Phiên bản chính sách dữ liệu sinh viên (đồng ý khi bật Open to work)", kind: "json", default: LIMITS.company.defaultConsentVersion },
    ],
  },

  /**
   * Huy hiệu kỹ năng xác thực (p6-06 README §7) — story points tối thiểu để một task được tính (chống farm task rỗng) và bật/tắt cron đối soát 02:30.
   * Chỉ đọc RUNTIME (`career/services/career.ports.ts`), không vào `capabilities`.
   */
  skill: {
    key: "skill",
    tab: "limits",
    label: "Huy hiệu kỹ năng",
    affects: ["runtime"],
    schema: z.object({ creditMinStoryPoints: z.number().int(), nightlyReconcile: z.boolean() }).partial(),
    fields: [
      { path: "creditMinStoryPoints", label: "Story points tối thiểu để task được tính", kind: "int", default: LIMITS.skill.creditMinStoryPoints, floor: 0, ceil: LIMITS.skill.creditMinStoryPointsMax, unit: "count" },
      { path: "nightlyReconcile", label: "Đối soát tiến độ hằng đêm", kind: "bool", default: true },
    ],
  },

  /**
   * Mentor Connect (p6-03 README §7) — khoá NHÓM `mentor` (giống `pm`/`skill`) để đường dẫn `mentor.defaultDurationDays` của kế hoạch đọc được bằng
   * `runtimeConfig.get("mentor.defaultDurationDays")` (hàm `get` tách khoá ở dấu chấm ĐẦU). `defaultDurationDays` = số ngày mặc định của một đợt cố vấn khi người
   * duyệt KHÔNG gửi `durationDays` ở `POST /mentor/applications/:id/accept`. Đọc RUNTIME (`mentor/services/mentor-settings.ts`), không vào `capabilities`.
   * Trần = `LIMITS.mentor.durationDays` (min 7, max 60, mặc định mã 30).
   */
  mentor: {
    key: "mentor",
    tab: "limits",
    label: "Cố vấn (Mentor Connect)",
    affects: ["runtime"],
    schema: z.object({ defaultDurationDays: z.number().int() }).partial(),
    fields: [
      {
        path: "defaultDurationDays",
        label: "Số ngày mặc định của một đợt cố vấn",
        kind: "int",
        default: LIMITS.mentor.durationDays.default,
        floor: LIMITS.mentor.durationDays.min,
        ceil: LIMITS.mentor.durationDays.max,
        unit: "days",
      },
    ],
  },

  /**
   * Ví nhóm (p6-04 README §7) — khoá NHÓM `wallet` (đọc bằng `runtimeConfig.get("wallet.defaultReminderCron" | "wallet.defaultTz")`): lịch nhắc nợ và múi giờ MẶC ĐỊNH của ví
   * TẠO MỚI (`WorkspaceWallet.reminderCron/timezone`); ví đã có giữ cấu hình riêng do OWNER/ADMIN nhóm đặt. Lịch chỉ dạng hằng tuần `phút giờ * * thứ` (cùng luật `weeklyCronSchema`
   * của wallet); `options` chỉ là GỢI Ý cho select (schema nhận mọi lịch/múi giờ hợp lệ, như `pm.timezone`). Ngưỡng nợ tối thiểu ở `limits.wallet`; danh mục chi tiêu
   * (`LIMITS.wallet.categories`) là enum cố định trong DTO + app nên KHÔNG chỉnh được runtime.
   */
  wallet: {
    key: "wallet",
    tab: "limits",
    label: "Ví nhóm — mặc định nhắc nợ",
    affects: ["runtime"],
    schema: z
      .object({
        defaultReminderCron: z.string().trim().regex(WALLET_WEEKLY_CRON_RE, "Lịch nhắc phải có dạng phút giờ * * thứ"),
        defaultTz: z.string().refine((tz) => safeTimeZone(tz) === tz, "Múi giờ IANA không hợp lệ"),
      })
      .partial(),
    fields: [
      { path: "defaultReminderCron", label: "Lịch nhắc nợ mặc định của ví mới (phút giờ * * thứ)", kind: "enum", options: WALLET_CRON_OPTIONS, default: LIMITS.wallet.defaultReminderCron },
      { path: "defaultTz", label: "Múi giờ mặc định của ví mới", kind: "enum", options: PM_TIMEZONE_OPTIONS, default: LIMITS.wallet.defaultTz },
    ],
  },

  /**
   * Tích hợp bên thứ ba (p5-03 README §7) — admin bật/tắt TỪNG nhà cung cấp trên toàn hệ thống: `providers.<github|gitlab|google-calendar|figma>.enabled`
   * (mặc định BẬT; provider còn cần khoá env mới `available`). Tắt → webhook mới của provider được ghi `IGNORED`, kết nối hiện có giữ nguyên, nút kết nối
   * ẩn. Ghi qua `PUT /admin/integrations/providers/:provider` (lý do + audit) — cùng đường `SystemConfigService` nên có kiểm schema, CAS `version` và xoá cache.
   */
  [INTEGRATIONS_CONFIG_KEY]: {
    key: INTEGRATIONS_CONFIG_KEY,
    tab: "features",
    label: "Tích hợp — nhà cung cấp",
    affects: ["runtime"],
    schema: z
      .object({
        providers: z
          .object({
            github: PROVIDER_TOGGLE,
            gitlab: PROVIDER_TOGGLE,
            "google-calendar": PROVIDER_TOGGLE,
            figma: PROVIDER_TOGGLE,
          })
          .partial()
          .strict(),
      })
      .partial()
      .strict(),
    fields: INTEGRATION_PROVIDER_KEYS.map((k) => ({
      path: `providers.${k}.enabled`,
      label: `Bật ${INTEGRATION_PROVIDER_LABELS[INTEGRATION_KEY_TO_PROVIDER[k]]}`,
      kind: "bool" as const,
      default: true,
    })),
  },

  features: {
    key: "features",
    tab: "features",
    label: "Tính năng",
    affects: ["capabilities", "runtime"],
    schema: z.record(z.enum(FEATURE_KEYS), z.boolean()),
    // `default` = cờ env hiện hành (`FEATURE_FLAGS`), KHÔNG phải `false` cứng —
    // thứ tự hợp nhất mã→env→SystemConfig (be.md §2); registry chỉ là tầng
    // cuối (override runtime), không phải nguồn sự thật cho "cờ chưa cấu hình".
    fields: [
      ...MODULE_IDS.map((m) => ({
        path: m,
        label: MODULE_LABELS[m],
        kind: "bool" as const,
        default: FEATURE_FLAGS[m],
      })),
      // Cờ phụ (p5-04): mặc định BẬT (trừ `SUB_FEATURE_DEFAULT_OFF`); hiệu lực khi phân hệ cha bật (`runtimeConfig.isSubFeatureEnabled`).
      ...SUB_FEATURE_IDS.map((id) => ({
        path: id,
        label: SUB_FEATURE_LABELS[id],
        kind: "bool" as const,
        default: subFeatureDefault(id),
      })),
    ],
  },

  /**
   * Cờ xác thực (p0-13) — KHÔNG phải "module" bật/tắt như `features`, nhưng
   * dùng chung cơ chế registry+`requireSystemConfig` để p0-13 có thể tắt
   * đăng nhập sinh trắc học/khoá ứng dụng theo runtime mà không cần deploy.
   */
  auth: {
    key: "auth",
    tab: "auth",
    label: "Xác thực",
    affects: ["capabilities", "runtime"],
    schema: z
      .object({
        biometricLogin: z.object({ enabled: z.boolean() }).partial(),
        appLock: z
          .object({ enabled: z.boolean(), lockAfterBackgroundSeconds: z.number().int() })
          .partial(),
      })
      .partial(),
    fields: [
      { path: "biometricLogin.enabled", label: "Đăng nhập sinh trắc học", kind: "bool", default: true },
      { path: "appLock.enabled", label: "Khoá ứng dụng", kind: "bool", default: true },
      {
        path: "appLock.lockAfterBackgroundSeconds",
        label: "Khoá sau khi chạy nền (giây)",
        kind: "int",
        default: LIMITS.auth.appLock.lockAfterBackgroundSeconds.default,
        floor: LIMITS.auth.appLock.lockAfterBackgroundSeconds.min,
        ceil: LIMITS.auth.appLock.lockAfterBackgroundSeconds.max,
        unit: "s",
      },
    ],
  },

  // storage / notifications / media / jobs — khung tab + cơ chế đăng ký,
  // KHÔNG có field ở p0-07 (ngoài phạm vi README §1) — p0-05/p0-06/p0-08/p0-04
  // bổ sung field khi cần override runtime nhóm của mình.
  storage: { key: "storage", tab: "storage", label: "Lưu trữ", affects: [], schema: z.object({}).partial(), fields: [] },
  notifications: {
    key: "notifications",
    tab: "notifications",
    label: "Thông báo",
    affects: [],
    schema: z.object({}).partial(),
    fields: [],
  },
  /**
   * p1-07 be.md §9 — mặc định cài đặt thông báo khi người dùng chưa chọn (`GET /me/notification-preferences` điền từ
   * đây; `MessagePreferenceResolver` dùng khi tính push). Giá trị mã: `LIMITS.notification.defaults`.
   */
  "notification.defaults": {
    key: "notification.defaults",
    tab: "notifications",
    label: "Mặc định thông báo",
    affects: ["runtime"],
    schema: z
      .object({
        directMode: z.enum(NOTIFY_MODE_OPTIONS),
        groupMode: z.enum(NOTIFY_MODE_OPTIONS),
        channelMode: z.enum(NOTIFY_MODE_OPTIONS),
        lockScreenPreview: z.enum(LOCK_SCREEN_OPTIONS),
        sound: z.boolean(),
      })
      .partial(),
    fields: [
      { path: "directMode", label: "Tin nhắn 1-1", kind: "enum", options: NOTIFY_MODE_OPTIONS, default: LIMITS.notification.defaults.directMode },
      { path: "groupMode", label: "Nhóm chat", kind: "enum", options: NOTIFY_MODE_OPTIONS, default: LIMITS.notification.defaults.groupMode },
      { path: "channelMode", label: "Kênh", kind: "enum", options: NOTIFY_MODE_OPTIONS, default: LIMITS.notification.defaults.channelMode },
      { path: "lockScreenPreview", label: "Xem trước trên màn hình khoá", kind: "enum", options: LOCK_SCREEN_OPTIONS, default: LIMITS.notification.defaults.lockScreenPreview },
      { path: "sound", label: "Âm thanh trong ứng dụng", kind: "bool", default: LIMITS.notification.defaults.sound },
    ],
  },
  /**
   * p1-08 be.md §9 / README §5 — bao lâu sau khi ĐÓNG báo cáo, người kiểm duyệt còn xem được nội dung riêng tư (D-06; quá hạn → `MOD_005`).
   * MỘT giá trị (`value`, giờ) nên đặt tên 2 đoạn (registry chỉ nhận khoá 1–2 đoạn). Đọc runtime ở `PlatformModerationService.accessExpiry`;
   * mặc định = `LIMITS.report.privateViewGraceHours`. Không vào `capabilities`.
   */
  "moderation.privateViewGraceHours": {
    key: "moderation.privateViewGraceHours",
    tab: "limits",
    label: "Xem nội dung riêng tư sau khi đóng báo cáo",
    affects: ["runtime"],
    schema: z.object({ value: z.number().int() }).partial(),
    fields: [
      {
        path: "value",
        label: "Số giờ còn xem được sau khi đóng báo cáo",
        kind: "int",
        default: LIMITS.report.privateViewGraceHours,
        floor: 1,
        ceil: 168,
        unit: "count",
      },
    ],
  },
  /**
   * Quét trùng lặp nội bộ (p7-05 README §7/be.md §9) — khoá NHÓM `plagiarism` (đọc bằng
   * `runtimeConfig.getEffective("plagiarism")`). Ghi qua route RIÊNG `PUT /admin/plagiarism/config`
   * (`plagiarism-config.service.ts`, CAS `version` + audit `plagiarism.config-update`, cùng mẫu
   * `BURNOUT_RULES_CONFIG_KEY`/`SystemConfigRulesAdminPort`) — KHÔNG qua `PUT /system-config/plagiarism` chung (be.md
   * không định nghĩa endpoint đó cho khoá này, chỉ dùng registry này để có schema/floor/ceil/mặc định và hiện trong màn
   * "Cấu hình" chung nếu có). Đọc RUNTIME nội bộ (`affects: ["runtime"]`), không vào `capabilities`. Trần cứng =
   * `LIMITS.plagiarism` — admin chỉ chỉnh trong khoảng này (README §7).
   */
  plagiarism: {
    key: "plagiarism",
    tab: "features",
    label: "Quét trùng lặp nội bộ",
    affects: ["runtime"],
    schema: z
      .object({
        thresholds: z
          .object({ medium: z.number().int().min(1).max(99), high: z.number().int().min(2).max(100) })
          .refine((t) => t.medium < t.high, "Ngưỡng Trung bình phải nhỏ hơn ngưỡng Cao"),
        minSectionTokens: z.number().int().min(8).max(200),
        commonDocFrequencyPercent: z.number().int().min(5).max(100),
        scansPerWorkspacePerDay: z.number().int().min(1).max(LIMITS.plagiarism.scansPerWorkspacePerDay),
        codeLanguages: z.array(z.enum(PLAGIARISM_CODE_LANGUAGE_OPTIONS)),
        boilerplatePhrases: z.array(z.string().trim().min(10).max(300)).max(LIMITS.plagiarism.boilerplatePhrasesMax),
      })
      .partial(),
    fields: [
      { path: "thresholds.medium", label: "Ngưỡng Trung bình (%)", kind: "int", default: LIMITS.plagiarism.thresholds.medium, floor: 1, ceil: 99, unit: "count" },
      { path: "thresholds.high", label: "Ngưỡng Cao (%)", kind: "int", default: LIMITS.plagiarism.thresholds.high, floor: 2, ceil: 100, unit: "count" },
      { path: "minSectionTokens", label: "Độ dài đoạn trùng tối thiểu (token)", kind: "int", default: LIMITS.plagiarism.minSectionTokens, floor: 8, ceil: 200, unit: "count" },
      {
        path: "commonDocFrequencyPercent",
        label: "Tỉ lệ tài liệu để coi là câu chữ phổ biến (%)",
        kind: "int",
        default: LIMITS.plagiarism.commonDocFrequencyPercent,
        floor: 5,
        ceil: 100,
        unit: "count",
      },
      {
        path: "scansPerWorkspacePerDay",
        label: "Số lượt quét tối đa / nhóm / ngày",
        kind: "int",
        default: LIMITS.plagiarism.scansPerWorkspacePerDay,
        floor: 1,
        ceil: LIMITS.plagiarism.scansPerWorkspacePerDay,
        unit: "count",
      },
      { path: "codeLanguages", label: "Ngôn ngữ mã nguồn được quét", kind: "json", default: PLAGIARISM_CODE_LANGUAGE_OPTIONS },
      { path: "boilerplatePhrases", label: "Cụm câu mẫu loại trừ (mỗi dòng một cụm, 10–300 ký tự)", kind: "json", default: [] },
    ],
  },
  media: { key: "media", tab: "media", label: "Media", affects: [], schema: z.object({}).partial(), fields: [] },
  jobs: { key: "jobs", tab: "jobs", label: "Hàng đợi", affects: [], schema: z.object({}).partial(), fields: [] },
};

export type SystemConfigKey = keyof typeof SYSTEM_CONFIG_REGISTRY;
