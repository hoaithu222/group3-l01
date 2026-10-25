import { registerNotificationType } from "../../notifications/public";
import type { NotificationTypeDef } from "../../notifications/public";

/**
 * Loại thông báo đơn in (README p6-05 §5; tên theo quy ước `module.sự-kiện` của codebase thay cho `PRINT_ORDER_*` trong plan).
 * Không gắn scope (`scope: null`); `refs` chỉ có id + mã đơn — KHÔNG có PIN, tên tệp hay số tiền. Push trỏ app tới `o2o/print/[orderId]`.
 */
export const PRINT_NOTIFICATION = {
  NEW: "print-order.new",
  ACCEPTED: "print-order.accepted",
  REJECTED: "print-order.rejected",
  READY: "print-order.ready",
  PICKED_UP: "print-order.picked-up",
  CANCELLED: "print-order.cancelled",
  EXPIRING: "print-order.expiring",
  EXPIRED: "print-order.expired",
} as const;
export type PrintNotificationType = (typeof PRINT_NOTIFICATION)[keyof typeof PRINT_NOTIFICATION];

const str = (v: unknown): string => (typeof v === "string" || typeof v === "number" ? String(v) : "");

const TEMPLATES: Record<PrintNotificationType, { title: string; body: (code: string) => string; priority: number }> = {
  "print-order.new": { title: "Đơn in mới", body: (c) => `Có đơn in mới ${c} đang chờ tiệm nhận`, priority: 2 },
  "print-order.accepted": { title: "Tiệm đã nhận đơn in", body: (c) => `Đơn ${c} đã được tiệm nhận`, priority: 1 },
  "print-order.rejected": { title: "Tiệm từ chối đơn in", body: (c) => `Đơn ${c} bị từ chối — mở để xem lý do`, priority: 1 },
  "print-order.ready": { title: "Tài liệu đã in xong", body: (c) => `Đơn ${c} đã sẵn sàng — mang mã PIN tới tiệm`, priority: 2 },
  "print-order.picked-up": { title: "Đã nhận tài liệu", body: (c) => `Đơn ${c} đã giao xong`, priority: 1 },
  "print-order.cancelled": { title: "Đơn in đã huỷ", body: (c) => `Đơn ${c} đã bị huỷ`, priority: 1 },
  "print-order.expiring": { title: "Sắp hết hạn nhận tài liệu", body: (c) => `Đơn ${c} sắp hết hạn nhận — ghé tiệm sớm nhé`, priority: 1 },
  "print-order.expired": { title: "Đơn in đã hết hạn", body: (c) => `Đơn ${c} đã hết hạn`, priority: 1 },
};

/** Idempotent (registry là `Map.set`) — gọi lúc import route (API) lẫn file job (worker). */
export function registerO2oNotificationTypes(): void {
  for (const [type, t] of Object.entries(TEMPLATES) as Array<[PrintNotificationType, (typeof TEMPLATES)[PrintNotificationType]]>) {
    const def: NotificationTypeDef = {
      type,
      inbox: true,
      inboxFilter: "all",
      pushType: type,
      androidChannel: "default",
      priority: t.priority,
      respectMute: "ALWAYS",
      bypassDnd: false,
      batchable: false,
      readAction: null,
      personal: true,
      push: {
        ttlSeconds: 24 * 3600,
        collapseKey: (refs) => `print-order:${str(refs["orderId"])}`,
        dataKeys: ["orderId", "code"],
        template: ({ refs }) => ({ title: t.title, body: t.body(str(refs["code"])) }),
      },
    };
    registerNotificationType(def);
  }
}
