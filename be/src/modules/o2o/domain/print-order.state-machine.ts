import type { PrintOrderStatus } from "../entities/o2o.interface";

/**
 * Bảng chuyển trạng thái đơn in (p6-05 be.md §5 "Máy trạng thái") — hàm THUẦN, test table-driven. Mọi ghi đi qua CAS
 * `(id, status: from, version)` ở repository; không khớp → `O2O_004`.
 *
 * | Hành động | Từ | Tới | Ai |
 * | UPDATE_SETTINGS | DRAFT, QUOTED | (giữ — QUOTED khi đã có số trang) | chủ đơn |
 * | SUBMIT | QUOTED | PENDING | chủ đơn |
 * | ACCEPT / REJECT | PENDING | ACCEPTED / REJECTED | tiệm |
 * | CANCEL | DRAFT, QUOTED, PENDING, ACCEPTED | CANCELLED | chủ đơn |
 * | START_PRINTING | ACCEPTED | PRINTING | tiệm |
 * | MARK_READY | PRINTING | READY | tiệm |
 * | PICKUP | READY | PICKED_UP | tiệm (PIN) |
 * | MARK_PAID | READY, PICKED_UP | (giữ) | tiệm |
 * | REGENERATE_PIN | PENDING, ACCEPTED, PRINTING, READY | (giữ) | chủ đơn |
 * | EXPIRE | PENDING (> 24 h), READY (> 7 ngày) | EXPIRED | cron |
 * | NOTIFY_EXPIRING | READY (còn ≤ 24 h tới hạn) | (giữ — ghi `expiringNotifiedAt`) | cron |
 * | ABANDON | DRAFT, QUOTED (bỏ dở quá `draftExpireHours`) | CANCELLED | cron |
 * | ADMIN_CANCEL | mọi trạng thái chưa kết thúc | CANCELLED | vận hành |
 */
export const PRINT_ORDER_ACTIONS = [
  "UPDATE_SETTINGS",
  "SUBMIT",
  "ACCEPT",
  "REJECT",
  "CANCEL",
  "START_PRINTING",
  "MARK_READY",
  "PICKUP",
  "MARK_PAID",
  "REGENERATE_PIN",
  "EXPIRE",
  "NOTIFY_EXPIRING",
  "ABANDON",
  "ADMIN_CANCEL",
] as const;
export type PrintOrderAction = (typeof PRINT_ORDER_ACTIONS)[number];

const ACTIVE: readonly PrintOrderStatus[] = ["DRAFT", "QUOTED", "PENDING", "ACCEPTED", "PRINTING", "READY"];

/** `to: null` = giữ nguyên trạng thái (chỉ đổi dữ liệu, vẫn CAS theo version). */
const TABLE: Record<PrintOrderAction, { from: readonly PrintOrderStatus[]; to: PrintOrderStatus | null }> = {
  UPDATE_SETTINGS: { from: ["DRAFT", "QUOTED"], to: null },
  SUBMIT: { from: ["QUOTED"], to: "PENDING" },
  ACCEPT: { from: ["PENDING"], to: "ACCEPTED" },
  REJECT: { from: ["PENDING"], to: "REJECTED" },
  CANCEL: { from: ["DRAFT", "QUOTED", "PENDING", "ACCEPTED"], to: "CANCELLED" },
  START_PRINTING: { from: ["ACCEPTED"], to: "PRINTING" },
  MARK_READY: { from: ["PRINTING"], to: "READY" },
  PICKUP: { from: ["READY"], to: "PICKED_UP" },
  MARK_PAID: { from: ["READY", "PICKED_UP"], to: null },
  REGENERATE_PIN: { from: ["PENDING", "ACCEPTED", "PRINTING", "READY"], to: null },
  EXPIRE: { from: ["PENDING", "READY"], to: "EXPIRED" },
  NOTIFY_EXPIRING: { from: ["READY"], to: null },
  ABANDON: { from: ["DRAFT", "QUOTED"], to: "CANCELLED" },
  ADMIN_CANCEL: { from: ACTIVE, to: "CANCELLED" },
};

/** Trạng thái đích của `action` khi đang ở `from`; `undefined` = không được phép (→ `O2O_004`). */
export function nextStatus(action: PrintOrderAction, from: PrintOrderStatus): PrintOrderStatus | undefined {
  const rule = TABLE[action];
  if (!rule.from.includes(from)) return undefined;
  return rule.to ?? from;
}

export function canPerform(action: PrintOrderAction, from: PrintOrderStatus): boolean {
  return nextStatus(action, from) !== undefined;
}

export function allowedFrom(action: PrintOrderAction): readonly PrintOrderStatus[] {
  return TABLE[action].from;
}

/** Đơn đã kết thúc (không còn hành động nghiệp vụ nào ngoài xem). */
export function isTerminal(status: PrintOrderStatus): boolean {
  return !ACTIVE.includes(status);
}

/** Trạng thái chủ tiệm được tải tệp in qua `/partner/orders/:id/file` (be.md §4 — IR-11). */
export const FILE_DOWNLOAD_STATUSES: readonly PrintOrderStatus[] = ["ACCEPTED", "PRINTING"];
/** Trạng thái tiệm còn quyền ĐỌC asset theo `AssetLink PRINT_ORDER` (be.md §5 resolver — READY vẫn đọc lại được tới khi giao). */
export const SHOP_FILE_READ_STATUSES: readonly PrintOrderStatus[] = ["ACCEPTED", "PRINTING", "READY"];
/** Trạng thái hiện trong hàng đợi của tiệm (partner). */
export const PARTNER_VISIBLE_STATUSES: readonly PrintOrderStatus[] = [
  "PENDING",
  "ACCEPTED",
  "PRINTING",
  "READY",
  "PICKED_UP",
  "REJECTED",
  "CANCELLED",
  "EXPIRED",
];
