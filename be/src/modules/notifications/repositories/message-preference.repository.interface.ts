import type { FanoutScopeContext } from "../entities/message-notification.types";
import type {
  AccountPreferenceInput,
  MemberOverrideInput,
  WorkspacePreferenceInput,
} from "../services/preference-matrix";

/** Đọc HÀNG LOẠT cài đặt thông báo cho 1 lô người nhận (be.md §5.3) — tránh N×query khi fan-out nhóm 200 người. */
export interface IMessagePreferenceRepository {
  loadAccountPrefs(userIds: string[]): Promise<Map<string, AccountPreferenceInput>>;
  loadWorkspacePrefs(userIds: string[], workspaceId: string): Promise<Map<string, WorkspacePreferenceInput>>;
  /** `ConversationMember.notifyMode/mutedUntil` hoặc `ChannelMembership.notifyMode` theo `scope.scopeType`. */
  loadMemberOverrides(scope: FanoutScopeContext, userIds: string[]): Promise<Map<string, MemberOverrideInput>>;
}
