import { prisma } from "../../../infrastructure/database";
import type { FanoutScopeContext } from "../entities/message-notification.types";
import type { QuietHours } from "../entities/notification.interface";
import type {
  AccountPreferenceInput,
  AnyNotifyMode,
  MemberOverrideInput,
  WorkspacePreferenceInput,
} from "../services/preference-matrix";
import type { IMessagePreferenceRepository } from "./message-preference.repository.interface";

export class PrismaMessagePreferenceRepository implements IMessagePreferenceRepository {
  async loadAccountPrefs(userIds: string[]): Promise<Map<string, AccountPreferenceInput>> {
    const out = new Map<string, AccountPreferenceInput>();
    if (userIds.length === 0) return out;
    const rows = await prisma.notificationPreference.findMany({
      where: { userId: { in: userIds }, scope: "ACCOUNT", scopeKey: "account" },
    });
    for (const r of rows) {
      out.set(r.userId, {
        directMode: r.directMode,
        groupMode: r.groupMode,
        channelMode: r.channelMode,
        lockScreenLevel: r.lockScreenLevel,
        lockScreenPreviewLegacy: r.lockScreenPreview,
        sound: r.sound,
        dndUntil: r.dndUntil,
        quietHours: (r.quietHours as QuietHours | null) ?? null,
      });
    }
    return out;
  }

  async loadWorkspacePrefs(userIds: string[], workspaceId: string): Promise<Map<string, WorkspacePreferenceInput>> {
    const out = new Map<string, WorkspacePreferenceInput>();
    if (userIds.length === 0) return out;
    const [prefs, memberships] = await Promise.all([
      prisma.notificationPreference.findMany({
        where: { userId: { in: userIds }, scope: "WORKSPACE", scopeKey: workspaceId },
      }),
      prisma.workspaceMembership.findMany({
        where: { workspaceId, userId: { in: userIds }, status: "ACTIVE" },
        select: { userId: true, notifyMode: true },
      }),
    ]);
    for (const m of memberships) out.set(m.userId, { membershipMode: m.notifyMode as AnyNotifyMode });
    for (const p of prefs) {
      out.set(p.userId, { ...(out.get(p.userId) ?? {}), groupMode: p.groupMode, channelMode: p.channelMode });
    }
    return out;
  }

  async loadMemberOverrides(scope: FanoutScopeContext, userIds: string[]): Promise<Map<string, MemberOverrideInput>> {
    const out = new Map<string, MemberOverrideInput>();
    if (userIds.length === 0) return out;
    if (scope.scopeType === "CONVERSATION") {
      const rows = await prisma.conversationMember.findMany({
        where: { conversationId: scope.scopeId, userId: { in: userIds }, status: "ACTIVE" },
        select: { userId: true, notifyMode: true, mutedUntil: true },
      });
      for (const r of rows) out.set(r.userId, { notifyMode: r.notifyMode as AnyNotifyMode, mutedUntil: r.mutedUntil });
      return out;
    }
    const rows = await prisma.channelMembership.findMany({
      where: { channelId: scope.scopeId, userId: { in: userIds } },
      select: { userId: true, notifyMode: true },
    });
    for (const r of rows) out.set(r.userId, { notifyMode: r.notifyMode as AnyNotifyMode });
    return out;
  }
}
