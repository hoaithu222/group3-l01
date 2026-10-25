import type { FanoutScopeContext } from "../entities/message-notification.types";
import type { IMessagePreferenceRepository } from "../repositories/message-preference.repository.interface";
import {
  FALLBACK_DEFAULTS,
  resolveEffectiveMessagePreference,
  type EffectiveMessagePreference,
  type NotificationDefaults,
} from "./preference-matrix";

/**
 * `MessagePreferenceResolver` (p1-07 be.md §5.3) — nạp cài đặt HÀNG LOẠT rồi áp ma trận thuần
 * (`resolveEffectiveMessagePreference`). Tách khỏi `PreferenceResolver` p0-06 (`preference.resolver.ts`,
 * từng người, phục vụ `DeliveryPolicy` cho loại phi tin nhắn): pipeline tin nhắn cần lô 500 người và
 * đọc ghi đè theo `ConversationMember`/`ChannelMembership`, không theo `NotificationPreference(CHANNEL|CONVERSATION)`.
 */
export class MessagePreferenceResolver {
  constructor(
    private readonly repo: IMessagePreferenceRepository,
    private readonly getDefaults: () => Promise<NotificationDefaults> = () => Promise.resolve(FALLBACK_DEFAULTS),
    private readonly now: () => Date = () => new Date()
  ) {}

  async resolveMany(scope: FanoutScopeContext, userIds: string[]): Promise<Map<string, EffectiveMessagePreference>> {
    const out = new Map<string, EffectiveMessagePreference>();
    if (userIds.length === 0) return out;

    const [defaults, accounts, workspaces, members] = await Promise.all([
      this.getDefaults(),
      this.repo.loadAccountPrefs(userIds),
      scope.workspaceId ? this.repo.loadWorkspacePrefs(userIds, scope.workspaceId) : Promise.resolve(null),
      this.repo.loadMemberOverrides(scope, userIds),
    ]);

    const now = this.now();
    for (const userId of userIds) {
      out.set(
        userId,
        resolveEffectiveMessagePreference({
          scope,
          defaults,
          account: accounts.get(userId) ?? null,
          workspace: workspaces?.get(userId) ?? null,
          member: members.get(userId) ?? null,
          now,
        })
      );
    }
    return out;
  }

  async resolveOne(scope: FanoutScopeContext, userId: string): Promise<EffectiveMessagePreference> {
    const map = await this.resolveMany(scope, [userId]);
    return map.get(userId) as EffectiveMessagePreference;
  }
}
