import { getPushSender, getVoipSender, isPushConfigured, isVoipConfigured } from "../../infrastructure/push";
import { PushNotConfiguredError, PushNoDeviceError } from "../../core/exceptions";
import { isModuleEnabled, MODULES } from "../../core/constants/modules";
import { AuditService } from "../audit-log/audit-log.service";
import { buildPushPayload, buildVoipPayload } from "../notifications/services/push-payload.builder";
import type { DeviceService } from "../devices/public";

export type AdminPushTestType = "message.new" | "call.incoming" | "meeting.reminder";

/** `refs` giả lập tối thiểu để `push-payload.builder.ts` build được payload hợp lệ cho từng loại thử nghiệm. */
function fakeRefsFor(type: AdminPushTestType, actorId: string): Record<string, unknown> {
  switch (type) {
    case "call.incoming":
      return { callId: `admin-test-${Date.now()}`, callerId: actorId, callerName: "Quản trị viên", mediaKind: "AUDIO" };
    case "meeting.reminder":
      return {
        meetingId: `admin-test-${Date.now()}`,
        startAt: new Date(Date.now() + 5 * 60_000).toISOString(),
        minutesBefore: 5,
      };
    default:
      return { messageId: `admin-test-${Date.now()}`, preview: "Đây là thông báo thử từ quản trị viên" };
  }
}

export interface SendTestInput {
  actorId: string;
  actorRole?: string;
  targetUserId: string;
  type: AdminPushTestType;
  reason: string;
}

export interface SendTestResult {
  fcm: { sent: number; failed: number };
  voip: { sent: number; failed: number };
}

/**
 * `POST /admin/push/test` (be.md §4/§8 PUSH-13) — gửi push THẬT ngay lập tức,
 * KHÔNG qua `notify()`/outbox (đây là công cụ chẩn đoán hạ tầng push, không
 * phải nghiệp vụ thông báo — ngoại lệ có ghi chú rõ so với `reuse-first.md`
 * "KHÔNG gọi getPushSender() trực tiếp từ module nghiệp vụ").
 */
export class AdminPushService {
  constructor(
    private readonly devices: DeviceService,
    private readonly audit: AuditService = new AuditService()
  ) {}

  async sendTest(input: SendTestInput): Promise<SendTestResult> {
    if (!isModuleEnabled(MODULES.PUSH) || !isPushConfigured()) {
      throw new PushNotConfiguredError();
    }

    const [fcmTokens, voipTokens] = await Promise.all([
      this.devices.getActiveFcmTokens(input.targetUserId),
      input.type === "call.incoming" ? this.devices.getActiveVoipTokens(input.targetUserId) : Promise.resolve([]),
    ]);
    if (fcmTokens.length === 0 && voipTokens.length === 0) {
      throw new PushNoDeviceError();
    }

    const refs = fakeRefsFor(input.type, input.actorId);
    const result: SendTestResult = { fcm: { sent: 0, failed: 0 }, voip: { sent: 0, failed: 0 } };

    if (fcmTokens.length > 0) {
      const payload = buildPushPayload({
        type: input.type,
        targetUserId: input.targetUserId,
        refs,
        lockScreenPreview: false,
      });
      const sent = await getPushSender().sendMulticast(fcmTokens, payload);
      result.fcm = { sent: sent.successCount, failed: fcmTokens.length - sent.successCount };
      if (sent.invalidTokens.length > 0) {
        await this.devices.revokeTokens(sent.invalidTokens, "FCM_UNREGISTERED");
      }
    }

    if (input.type === "call.incoming" && voipTokens.length > 0) {
      if (!isVoipConfigured()) {
        result.voip = { sent: 0, failed: voipTokens.length };
      } else {
        const voipPayload = buildVoipPayload({ targetUserId: input.targetUserId, callId: String(refs["callId"]), refs });
        const sender = getVoipSender();
        for (const t of voipTokens) {
          const r = await sender.send(t.token, t.environment, t.bundleId ?? "com.mancode.vungnui", voipPayload);
          if (r.ok) result.voip.sent += 1;
          else result.voip.failed += 1;
          if (r.shouldRevoke) await this.devices.revokeTokens([t.token], "APNS_UNREGISTERED");
        }
      }
    }

    await this.audit.record({
      actorId: input.actorId,
      actorRole: input.actorRole,
      action: "push.test",
      targetType: "User",
      targetId: input.targetUserId,
      reason: input.reason,
      metadata: { type: input.type, fcm: result.fcm, voip: result.voip },
    });

    return result;
  }
}
