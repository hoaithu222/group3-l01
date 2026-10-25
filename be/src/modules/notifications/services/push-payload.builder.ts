import { callIdToUuid } from "../../../core/utils/call-uuid";
import type { PushPayload, AndroidChannel, VoipPayload } from "../../../infrastructure/push";
import { buildTemplate } from "./push-templates.vi";
import { getNotificationType } from "./notification-types";

/**
 * `callId` → UUID v5 tất định (be.md §5.6) — dùng làm `apns-id` và `data.callUuid` để CallKit dùng cùng UUID. Cài đặt + namespace (`env.CALL_UUID_NAMESPACE`,
 * mặc định giữ giá trị đã phát hành) nằm ở `core/utils/call-uuid.ts` để `calls` (`CallDto.callUuid`) dùng chung; re-export giữ import cũ.
 */
export { callIdToUuid };

const CALL_PUSH_MAX_TTL_SECONDS = 60;

/**
 * Hạn gửi push `call.incoming` (p2-02 be.md §5.1): `min(60 s, expiresAt − now)` — không giữ chuông quá hạn đổ chuông của cuộc gọi. `expiresAt` (ISO, do dispatcher
 * gắn vào `refs`) thiếu/không hợp lệ ⇒ 60 s như trước. Đã quá hạn ⇒ 1 s (sender coi `0` là "không đặt TTL" = mặc định của FCM là 4 tuần — tệ hơn nhiều);
 * đường VoIP còn bỏ hẳn lượt gửi khi đã quá hạn (`push.voip`).
 */
export function callPushTtlSeconds(refs: Record<string, unknown>, nowMs: number = Date.now()): number {
  const expiresMs = Date.parse(String(refs["expiresAt"] ?? ""));
  if (!Number.isFinite(expiresMs)) return CALL_PUSH_MAX_TTL_SECONDS;
  return Math.max(1, Math.min(CALL_PUSH_MAX_TTL_SECONDS, Math.floor((expiresMs - nowMs) / 1000)));
}

type Refs = Record<string, unknown>;

/**
 * Mức xem trước màn hình khoá cho CUỘC GỌI (p2-02 be.md §5.3), suy từ `NotificationPreference.lockScreenLevel` của tài khoản:
 *  · `FULL` — tên người gọi + tên nhóm (mặc định của cuộc gọi khi người dùng CHƯA chọn — khác tin nhắn mặc định HIDDEN, vì cuộc gọi cần biết ai gọi);
 *  · `NAME_ONLY` (= `SENDER`) — tên người gọi, không tên nhóm;
 *  · `HIDDEN` — không tên (CallKit/ConnectionService hiện "Cuộc gọi Super App", app tự lấy tên sau khi mở khoá bằng `GET /calls/:id`); push `call.missed` chung chung.
 */
export type CallPreviewLevel = "FULL" | "NAME_ONLY" | "HIDDEN";

export function callPreviewLevelOf(level: "HIDDEN" | "SENDER" | "FULL" | null | undefined): CallPreviewLevel {
  if (level === "HIDDEN") return "HIDDEN";
  if (level === "SENDER") return "NAME_ONLY";
  return "FULL";
}

/** Bản sao `refs` đã lược thông tin nhận diện theo mức xem trước: HIDDEN → `callerName: ""` + bỏ ảnh/tên nhóm; NAME_ONLY → bỏ tên nhóm. FULL giữ nguyên. */
function applyCallPreview(refs: Refs, level: CallPreviewLevel): Refs {
  if (level === "FULL") return refs;
  const copy: Refs = { ...refs };
  delete copy["scopeTitle"];
  if (level === "HIDDEN") {
    delete copy["callerAvatar"];
    copy["callerName"] = "";
  }
  return copy;
}

interface PushTypeSpec {
  ttlSeconds: number | ((refs: Refs) => number);
  collapseKey: (refs: Refs, scopeId?: string) => string;
  /** Khoá lấy từ `refs`, ép string, gộp vào `data` — KHÔNG bao giờ chứa nội dung/tên riêng tư ngoài danh sách này (be.md §6.2). */
  dataKeys: string[];
  androidChannel: AndroidChannel;
}

const DAY = 24 * 3600;

function str(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  return String(v);
}

/** Bảng §6.2 — 13 loại push chuẩn. Loại chưa đăng ký (`getNotificationType` trả `undefined`) dùng {@link FALLBACK_SPEC}. */
const TYPE_SPECS: Record<string, PushTypeSpec> = {
  "message.new": {
    ttlSeconds: 3600,
    collapseKey: (_r, scopeId) => `msg:${scopeId ?? "-"}`,
    dataKeys: ["messageId", "count"],
    androidChannel: "default",
  },
  mention: {
    ttlSeconds: 3600,
    collapseKey: (r) => `mention:${str(r["messageId"]) ?? "-"}`,
    dataKeys: ["messageId", "threadId"],
    androidChannel: "mentions",
  },
  "thread.reply": {
    ttlSeconds: 3600,
    collapseKey: (r) => `thread:${str(r["threadId"]) ?? "-"}`,
    dataKeys: ["messageId", "threadId"],
    androidChannel: "mentions",
  },
  "call.cancelled": {
    ttlSeconds: 60,
    collapseKey: (r) => `call:${str(r["callId"]) ?? "-"}`,
    dataKeys: ["callId", "callUuid", "reason", "callVersion", "originDeviceId"],
    androidChannel: "calls",
  },
  "call.answered-elsewhere": {
    ttlSeconds: 60,
    collapseKey: (r) => `call:${str(r["callId"]) ?? "-"}`,
    dataKeys: ["callId", "callUuid", "deviceId", "callVersion", "originDeviceId"],
    androidChannel: "calls",
  },
  "call.missed": {
    ttlSeconds: DAY,
    collapseKey: (r) => `missed:${str(r["callId"]) ?? "-"}`,
    dataKeys: ["callId", "callerId", "callVersion"],
    androidChannel: "default",
  },
  "meeting.invited": {
    ttlSeconds: DAY,
    collapseKey: (r) => `meeting:${str(r["meetingId"]) ?? "-"}`,
    dataKeys: ["meetingId", "startAt"],
    androidChannel: "default",
  },
  "meeting.reminder": {
    ttlSeconds: (r) => {
      const startAt = str(r["startAt"]);
      if (!startAt) return 300;
      return Math.max(0, Math.floor((new Date(startAt).getTime() - Date.now()) / 1000));
    },
    collapseKey: (r) => `meeting-reminder:${str(r["meetingId"]) ?? "-"}`,
    dataKeys: ["meetingId", "startAt", "minutesBefore"],
    androidChannel: "mentions",
  },
  "meeting.started": {
    ttlSeconds: 3600,
    collapseKey: (r) => `meeting:${str(r["meetingId"]) ?? "-"}`,
    dataKeys: ["meetingId"],
    androidChannel: "mentions",
  },
  "meeting.updated": {
    ttlSeconds: DAY,
    collapseKey: (r) => `meeting:${str(r["meetingId"]) ?? "-"}`,
    dataKeys: ["meetingId", "version"],
    androidChannel: "default",
  },
  "meeting.cancelled": {
    ttlSeconds: DAY,
    collapseKey: (r) => `meeting:${str(r["meetingId"]) ?? "-"}`,
    dataKeys: ["meetingId"],
    androidChannel: "default",
  },
  "meeting.recap-published": {
    ttlSeconds: 3 * DAY,
    collapseKey: (r) => `recap:${str(r["meetingId"]) ?? "-"}`,
    dataKeys: ["meetingId", "recapId"],
    androidChannel: "default",
  },
  "system.test": {
    ttlSeconds: 300,
    collapseKey: () => "system-test",
    dataKeys: [],
    androidChannel: "default",
  },
};

/**
 * Định tuyến push của các loại "foundation" Phase 3 mà module sở hữu (`projects`) chưa tự khai `push` ở def: id để app mở ĐÚNG THẺ
 * (`workspaceId` đã có ở khoá chung; thêm `boardId`, `taskId`, `commentId`). `androidChannel` lấy từ chính def (không lặp ở đây).
 * Module khai `push` ở def thì khai báo đó THẮNG bảng này. Chỉ id, KHÔNG nội dung (tiêu đề thẻ do mẫu `push-templates.vi.ts` xử lý theo `lockScreenPreview`).
 */
const FOUNDATION_PRESENTATION: Record<string, Omit<PushTypeSpec, "androidChannel">> = {
  "task.assigned": { ttlSeconds: 3600, collapseKey: (r) => `task:${str(r["taskId"]) ?? "-"}`, dataKeys: ["boardId", "taskId"] },
  "task.comment": {
    ttlSeconds: 3600,
    collapseKey: (r) => `task-comment:${str(r["commentId"]) ?? str(r["taskId"]) ?? "-"}`,
    dataKeys: ["boardId", "taskId", "commentId"],
  },
  "task.comment-mention": {
    ttlSeconds: 3600,
    collapseKey: (r) => `task-comment:${str(r["commentId"]) ?? str(r["taskId"]) ?? "-"}`,
    dataKeys: ["boardId", "taskId", "commentId"],
  },
  "task.due-soon": { ttlSeconds: DAY, collapseKey: (r) => `task-due:${str(r["taskId"]) ?? "-"}`, dataKeys: ["boardId", "taskId"] },
};

const FALLBACK_SPEC: PushTypeSpec = {
  ttlSeconds: 3600,
  collapseKey: (_r, scopeId) => `notif:${scopeId ?? "-"}`,
  dataKeys: [],
  androidChannel: "default",
};

/**
 * Hợp nhất cách định tuyến push của 1 loại (p1-07 — mở rộng KHÔNG sửa lõi): khai báo `push` của module lúc
 * `registerNotificationType` > bảng lõi `TYPE_SPECS` > `FALLBACK_SPEC`. Loại chưa có trong bảng lõi lấy
 * `androidChannel` từ chính `NotificationTypeDef` (trước đây rơi về `default` dù def khai `mentions`).
 */
function resolveSpec(type: string): PushTypeSpec {
  const def = getNotificationType(type);
  const core = TYPE_SPECS[type];
  const base =
    core ?? { ...FALLBACK_SPEC, ...FOUNDATION_PRESENTATION[type], androidChannel: def?.androidChannel ?? FALLBACK_SPEC.androidChannel };
  const ext = def?.push;
  if (!ext) return base;
  return {
    ttlSeconds: ext.ttlSeconds ?? base.ttlSeconds,
    collapseKey: ext.collapseKey ?? base.collapseKey,
    dataKeys: ext.dataKeys ?? base.dataKeys,
    androidChannel: base.androidChannel,
  };
}

export interface BuildPushPayloadInput {
  type: string;
  targetUserId: string;
  notificationId?: string;
  scopeType?: string;
  scopeId?: string;
  workspaceId?: string;
  /** id tham chiếu — KHÔNG chứa nội dung (be.md §2 `Notification.refs`). */
  refs?: Refs;
  lockScreenPreview: boolean;
  /** Mức xem trước cho loại `call.*` (`callPreviewLevelOf(pref.lockScreenLevel)`); vắng = FULL. Không ảnh hưởng loại khác. */
  callPreview?: CallPreviewLevel;
  /** > 1 khi gộp burst (be.md §5.4 bước 7) — tiêu đề đổi thành "N thông báo mới". */
  batchCount?: number;
  badge?: number;
}

/**
 * Build payload FCM chuẩn (be.md §6.2) cho MỌI loại (kể cả `call.incoming` —
 * dùng cho nhánh Android data-only; nhánh iOS dùng {@link buildVoipPayload}
 * riêng, KHÔNG hiển thị).
 */
export function buildPushPayload(input: BuildPushPayloadInput): PushPayload {
  const callPreview: CallPreviewLevel = input.type.startsWith("call.") ? (input.callPreview ?? "FULL") : "FULL";
  const refs = applyCallPreview(input.refs ?? {}, callPreview);
  const spec = resolveSpec(input.type);
  const isCallIncoming = input.type === "call.incoming";
  const templateRefs = { ...refs, scopeType: input.scopeType };
  // Khai báo `push.template` của module (nếu có) chỉ áp khi KHÔNG gộp — tiêu đề gộp "N thông báo mới" là chung.
  const customTemplate = getNotificationType(input.type)?.push?.template;
  const template = isCallIncoming
    ? {}
    : customTemplate && !(input.batchCount && input.batchCount > 1)
      ? customTemplate({ refs, lockScreenPreview: input.lockScreenPreview, scopeType: input.scopeType })
      : buildTemplate(input.type, templateRefs, input.lockScreenPreview, input.batchCount);
  // HIDDEN: cuộc gọi nhỡ không lộ người gọi/nhóm trên màn hình khoá (p2-02 §5.3) — tiêu đề chung của app, nội dung chung.
  const shown = callPreview === "HIDDEN" && input.type === "call.missed" ? { title: "Super App", body: "Bạn có cuộc gọi nhỡ" } : template;

  const data: Record<string, string> = {};
  // p2-02: `callVersion` (client bỏ tín hiệu cũ hơn cái đã xử lý — cùng `version` của socket), `expiresAt` (hết hạn đổ chuông), `scopeKind` (1-1/nhóm để vẽ CallKit),
  // `originDeviceId` (máy gây ra sự kiện — máy đó bỏ qua) đều là khoá string phẳng, nhận từ `refs` do dispatcher gắn.
  const dataKeys = isCallIncoming
    ? ["callId", "mediaKind", "callerId", "callerName", "callerAvatar", "scopeTitle", "callVersion", "expiresAt", "scopeKind", "originDeviceId"]
    : spec.dataKeys;
  for (const key of dataKeys) {
    const value = str(refs[key]);
    if (value !== undefined) data[key] = value;
  }
  // Mọi tín hiệu cuộc gọi mang `callUuid` (CallKit kết thúc/cập nhật đúng cuộc gọi) — tính từ `callId`, không phụ thuộc `refs`.
  if (input.type.startsWith("call.")) {
    const callId = str(refs["callId"]);
    if (callId) data["callUuid"] = callIdToUuid(callId);
  }
  const nowMs = Date.now();
  const callTtl = isCallIncoming ? callPushTtlSeconds(refs, nowMs) : undefined;
  if (input.batchCount && input.batchCount > 1) {
    data["type"] = input.type;
    data["count"] = String(input.batchCount);
  }

  return {
    type: input.type,
    targetUserId: input.targetUserId,
    notificationId: input.notificationId,
    scopeType: input.scopeType,
    scopeId: input.scopeId,
    workspaceId: input.workspaceId,
    sentAt: new Date(nowMs).toISOString(),
    title: shown.title,
    body: shown.body,
    data,
    ttlSeconds: callTtl ?? (typeof spec.ttlSeconds === "function" ? spec.ttlSeconds(refs) : spec.ttlSeconds),
    // `apns-expiration` của nhánh APNs trong FCM (sender ánh xạ sang epoch giây) — CHỈ `call.incoming`: chuông không được nằm lại hàng đợi APNs quá hạn.
    ...(callTtl !== undefined && { expiresAt: new Date(nowMs + callTtl * 1000).toISOString() }),
    collapseKey: isCallIncoming ? `call:${str(refs["callId"]) ?? "-"}` : spec.collapseKey(refs, input.scopeId),
    androidChannel: isCallIncoming ? "calls" : spec.androidChannel,
    badge: input.badge,
  };
}

export interface BuildVoipPayloadInput {
  targetUserId: string;
  callId: string;
  refs: Refs;
  scopeType?: string;
  scopeId?: string;
  workspaceId?: string;
  /** Mức xem trước màn hình khoá của người nhận (vắng = FULL) — HIDDEN gửi `callerName: ""` và bỏ ảnh/tên nhóm. */
  callPreview?: CallPreviewLevel;
}

/** Body phẳng gửi APNs VoIP (be.md §5.6/§6.2 `call.incoming`) — KHÔNG hiển thị, client tự vẽ CallKit/UI cuộc gọi. */
export function buildVoipPayload(input: BuildVoipPayloadInput): VoipPayload {
  const refs = applyCallPreview(input.refs, input.callPreview ?? "FULL");
  return {
    type: "call.incoming",
    targetUserId: input.targetUserId,
    callId: input.callId,
    callUuid: callIdToUuid(input.callId),
    mediaKind: str(refs["mediaKind"]) ?? "AUDIO",
    callerId: str(refs["callerId"]) ?? "",
    callerName: str(refs["callerName"]),
    callerAvatar: str(refs["callerAvatar"]),
    scopeTitle: str(refs["scopeTitle"]),
    scopeType: input.scopeType,
    scopeId: input.scopeId,
    workspaceId: input.workspaceId,
    callVersion: str(refs["callVersion"]),
    expiresAt: str(refs["expiresAt"]),
    scopeKind: str(refs["scopeKind"]),
    originDeviceId: str(refs["originDeviceId"]),
    sentAt: new Date().toISOString(),
  };
}
