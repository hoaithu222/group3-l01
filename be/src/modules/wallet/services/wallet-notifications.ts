import { registerNotificationType } from "../../notifications/public";
import type { NotificationTypeDef } from "../../notifications/public";

/**
 * Loại thông báo của ví (README p6-04 §5) — side-effect lúc import, giống `invite.service.ts`.
 * `refs` KHÔNG chứa số tiền của người khác; riêng `wallet.debt-reminder` có `amount` của CHÍNH
 * người nhận (hiện trong inbox của họ) nhưng push/màn khoá dùng mẫu chung không nêu số tiền
 * (`push-templates.vi.ts`). Tôn trọng DND/lịch yên lặng (`bypassDnd: false`) — IR-06.
 */
const BASE: Omit<NotificationTypeDef, "type" | "pushType" | "priority" | "inbox"> = {
  inboxFilter: "all",
  androidChannel: "default",
  respectMute: "ALWAYS",
  bypassDnd: false,
  batchable: false,
  readAction: "workspace.read",
};

const TYPES: Pick<NotificationTypeDef, "type" | "pushType" | "priority" | "inbox">[] = [
  { type: "wallet.expense-added", pushType: "wallet.expense-added", priority: 1, inbox: true },
  { type: "wallet.settlement-pending", pushType: "wallet.settlement-pending", priority: 2, inbox: true },
  { type: "wallet.settlement-confirmed", pushType: "wallet.settlement-confirmed", priority: 1, inbox: true },
  { type: "wallet.settlement-rejected", pushType: "wallet.settlement-rejected", priority: 1, inbox: true },
  { type: "wallet.settlement-stale", pushType: "wallet.settlement-stale", priority: 1, inbox: true },
  { type: "wallet.debt-reminder", pushType: "wallet.debt-reminder", priority: 1, inbox: true },
  { type: "wallet.export-ready", pushType: null, priority: 0, inbox: true },
];

for (const def of TYPES) registerNotificationType({ ...BASE, ...def });
