import { PHASE3_NOTIFICATION_TYPES } from "../../../core/constants/notification-types";
import { getNotificationType, registerNotificationType } from "../../notifications/public";
import type { NotificationTypeDef } from "../../notifications/public";

/**
 * Loại thông báo của p3-04 (lời mời, duyệt tham gia, khách sắp hết hạn) — mẫu push tiếng Việt đã có sẵn ở
 * `notifications/services/push-templates.vi.ts` (foundation D-28). `refs` chỉ chứa id + tên nhóm (không nội dung riêng tư).
 * Đăng ký lúc import (side-effect, giống `registerScopeResolver`); job file của worker cũng import file này.
 */
const BASE = {
  inbox: true,
  inboxFilter: "all",
  androidChannel: "default",
  respectMute: "ALWAYS",
  bypassDnd: false,
} as const;

const TYPES: NotificationTypeDef[] = [
  {
    ...BASE,
    type: PHASE3_NOTIFICATION_TYPES.WORKSPACE_INVITED,
    pushType: PHASE3_NOTIFICATION_TYPES.WORKSPACE_INVITED,
    priority: 3,
    batchable: false,
    // Người nhận chưa là thành viên nên không có scope để kiểm quyền — chỉ ghi vào hộp thư của chính họ.
    readAction: null,
  },
  {
    ...BASE,
    type: PHASE3_NOTIFICATION_TYPES.JOIN_REQUESTED,
    pushType: PHASE3_NOTIFICATION_TYPES.JOIN_REQUESTED,
    priority: 2,
    // NT: gộp theo workspace trong 10 giây/10 phút do cơ chế `batchable` của engine (không phải trách nhiệm module này).
    batchable: true,
    readAction: "workspace.join-request.decide",
  },
  {
    ...BASE,
    type: PHASE3_NOTIFICATION_TYPES.JOIN_APPROVED,
    pushType: PHASE3_NOTIFICATION_TYPES.JOIN_APPROVED,
    priority: 3,
    batchable: false,
    readAction: "workspace.read",
  },
  {
    ...BASE,
    type: PHASE3_NOTIFICATION_TYPES.JOIN_REJECTED,
    pushType: PHASE3_NOTIFICATION_TYPES.JOIN_REJECTED,
    priority: 2,
    batchable: false,
    // Bị từ chối → không còn là thành viên, không có scope để kiểm quyền.
    readAction: null,
  },
  {
    ...BASE,
    type: PHASE3_NOTIFICATION_TYPES.MEMBER_ADDED,
    // Chỉ hộp thư (như `workspace.invite-accepted`): app chưa có mẫu push riêng; nhóm hiện ngay ở tab Nhóm nhờ `member:updated`.
    pushType: null,
    priority: 2,
    batchable: false,
    readAction: "workspace.read",
  },
  {
    ...BASE,
    type: PHASE3_NOTIFICATION_TYPES.GUEST_EXPIRING,
    pushType: PHASE3_NOTIFICATION_TYPES.GUEST_EXPIRING,
    priority: 3,
    batchable: false,
    readAction: "workspace.read",
  },
];

/** `workspace.invite-accepted` do `invite.service.ts` đăng ký lúc import; job worker không import file đó nên bảo đảm ở đây. */
const INVITE_ACCEPTED: NotificationTypeDef = {
  type: "workspace.invite-accepted",
  inbox: true,
  inboxFilter: "all",
  pushType: null,
  androidChannel: "default",
  priority: 1,
  respectMute: "ALWAYS",
  bypassDnd: false,
  batchable: false,
  readAction: "workspace.member.invite",
};

export function registerAccessNotificationTypes(): void {
  for (const def of TYPES) registerNotificationType(def);
  if (!getNotificationType(INVITE_ACCEPTED.type)) registerNotificationType(INVITE_ACCEPTED);
}

registerAccessNotificationTypes();
