import type { OutboxEventInput } from "../../../infrastructure/queue";
import { LIMITS } from "../../../core/constants/limits";
import type { CallEndReasonValue, CallEntity, CallParticipantStateValue } from "../entities/call.interface";

/**
 * Sự kiện outbox của cuộc gọi (p2-01 be.md §6/§7). MỌI tín hiệu (socket + push) đi qua outbox → job `call.signal-dispatch`
 * (KHÔNG `emit` trần trong request). `dedupeKey` là khoá unique của `OutboxEvent` VÀ (sau `toSafeJobId`) là `jobId`
 * BullMQ — mỗi sự kiện có khoá riêng theo (cuộc gọi, người, version) nên retry/ghi lặp không nhân đôi.
 */
export const CALLS_QUEUE = "calls" as const;
export const CALL_SIGNAL_JOB = "call.signal-dispatch";
export const CALL_RING_TIMEOUT_JOB = "call.ring-timeout";
export const CALL_SUMMARY_JOB = "call.summary";

/** Loại tác động của host lên phòng ROOM (payload `call:host-action.type`, p2-03 be.md §5.4/§5.7). */
export type CallHostActionType =
  | "INVITE_SPEAK"
  | "MUTE_REQUEST"
  | "AUDIO_BLOCKED"
  | "AUDIO_UNBLOCKED"
  | "SCREEN_SHARE_ENDED"
  | "REMOVED"
  | "HOST_CHANGED"
  /** Kênh tắt video (`voiceSettings.allowVideo = false`) — không có người đích (`targetUserId: null`), mọi participant bỏ camera. */
  | "VIDEO_DISABLED";

export type CallSignalPayload =
  | {
      event: "ringing";
      callId: string;
      version: number;
      /** Nhóm nhận `call:incoming { ring:true }` + push; `silentIds` chỉ nhận banner `ring:false`. */
      ringIds: string[];
      silentIds: string[];
      expiresAt: string;
      /** Lô mời (P1 `POST /calls/:id/invite`); rỗng cho lượt gọi đầu. */
      batch: string;
    }
  | { event: "answered"; callId: string; version: number; userId: string; deviceId: string }
  | { event: "declined"; callId: string; version: number; userId: string; deviceId: string }
  | {
      event: "host-action";
      callId: string;
      version: number;
      type: CallHostActionType;
      targetUserId: string | null;
      byUserId: string | null;
      reason?: string;
    }
  | {
      event: "participant-changed";
      callId: string;
      version: number;
      userId: string;
      state: CallParticipantStateValue;
    }
  | {
      event: "ended";
      callId: string;
      version: number;
      reason: CallEndReasonValue;
      durationSec: number;
      /** Người đang RINGING/INVITED lúc kết thúc — nhận `call:cancelled` + push `call.cancelled`. */
      ringingUserIds: string[];
      /** Người bị lỡ/bận (không phải người gọi) — nhận push `call.missed` + hộp thư. */
      missedUserIds: string[];
      /** Mọi participant đã/đang tham gia + người gọi — nhận `call:ended`. */
      participantIds: string[];
    };

function signal(callId: string, dedupeKey: string, payload: CallSignalPayload, aggregateVersion?: number): OutboxEventInput {
  return {
    type: `call.${payload.event}`,
    aggregateType: "Call",
    aggregateId: callId,
    queue: CALLS_QUEUE,
    jobName: CALL_SIGNAL_JOB,
    dedupeKey,
    payload: { ...payload, ...(aggregateVersion !== undefined ? { aggregateVersion } : {}) },
  };
}

export const callEvents = {
  ringing(call: Pick<CallEntity, "id" | "version" | "startedAt">, ringIds: string[], silentIds: string[], batch = ""): OutboxEventInput {
    const expiresAt = new Date(call.startedAt.getTime() + LIMITS.call.ringTimeoutSeconds * 1000).toISOString();
    return signal(call.id, `call.ringing:call:${call.id}${batch ? `:${batch}` : ""}`, {
      event: "ringing",
      callId: call.id,
      version: call.version,
      ringIds,
      silentIds,
      expiresAt,
      batch,
    });
  },

  /** Hẹn giờ hết đổ chuông (be.md §5.2 bước 6): `availableAt = now + ringTimeout` để bền qua restart Redis. */
  scheduleTimeout(callId: string, availableAt: Date, batch = ""): OutboxEventInput {
    return {
      type: "call.schedule-timeout",
      aggregateType: "Call",
      aggregateId: callId,
      queue: CALLS_QUEUE,
      jobName: CALL_RING_TIMEOUT_JOB,
      dedupeKey: `call.ring-timeout:call:${callId}${batch ? `:invite:${batch}` : ""}`,
      payload: { callId, batch },
      availableAt,
    };
  },

  answered(callId: string, version: number, userId: string, deviceId: string): OutboxEventInput {
    return signal(callId, `call.answered:call:${callId}:u:${userId}`, { event: "answered", callId, version, userId, deviceId });
  },

  declined(callId: string, version: number, userId: string, deviceId: string): OutboxEventInput {
    return signal(callId, `call.declined:call:${callId}:u:${userId}`, { event: "declined", callId, version, userId, deviceId });
  },

  /** `participantVersion` làm khoá — mỗi thay đổi của 1 participant có version riêng nên không trùng. */
  participantChanged(callId: string, callVersion: number, userId: string, state: CallParticipantStateValue, participantVersion: number): OutboxEventInput {
    return signal(callId, `call.pc:call:${callId}:u:${userId}:v${participantVersion}`, {
      event: "participant-changed",
      callId,
      version: callVersion,
      userId,
      state,
    });
  },

  /** `version` = version MỚI của `Call` sau CAS — mỗi lần host thao tác có version riêng nên khoá không trùng. */
  hostAction(callId: string, version: number, a: { type: CallHostActionType; targetUserId: string | null; byUserId: string | null; reason?: string }): OutboxEventInput {
    return signal(callId, `call.host:call:${callId}:v${version}`, { event: "host-action", callId, version, ...a });
  },

  ended(callId: string, payload: Omit<Extract<CallSignalPayload, { event: "ended" }>, "event" | "callId">): OutboxEventInput {
    return signal(callId, `call.ended:call:${callId}`, { event: "ended", callId, ...payload });
  },

  summary(callId: string): OutboxEventInput {
    return {
      type: "call.summary",
      aggregateType: "Call",
      aggregateId: callId,
      queue: CALLS_QUEUE,
      jobName: CALL_SUMMARY_JOB,
      dedupeKey: `call.summary:call:${callId}`,
      payload: { callId },
    };
  },
};
