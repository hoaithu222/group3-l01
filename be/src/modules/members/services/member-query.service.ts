import { NotFoundError, ScopeForbiddenError } from "../../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import { getStates } from "../../presence/presence.service";
import { NO_CONTACT_ABILITY, type MemberContactAbility, type MemberContactPort } from "../../../shared/ports/member-contact.port";
import type { IMembershipRepository } from "../repositories/membership.repository.interface";
import type { ListMembersParams, MemberCard, MemberRow, WorkspaceRoleValue } from "../entities/member.interface";
import { toMemberCard, toMemberRow } from "./member.presenter";

export interface MemberListResult {
  data: MemberRow[];
  total: number;
}

/**
 * Danh sách + thẻ thành viên, kèm hiện diện (be.md p1-02 §5.7). `contact` (tuỳ chọn, `createMemberContactPort()` ở routes/container) tính
 * `MemberCard.actions.canMessage/canCall` — không truyền (unit test cũ) thì hai cờ đó là `false`.
 */
export class MemberQueryService {
  constructor(
    private readonly repo: IMembershipRepository,
    private readonly contact?: MemberContactPort
  ) {}

  async list(
    viewerId: string,
    viewerRole: WorkspaceRoleValue,
    workspaceId: string,
    params: ListMembersParams
  ): Promise<MemberListResult> {
    if (params.status === "BANNED" && viewerRole !== "OWNER" && viewerRole !== "ADMIN") {
      throw new ScopeForbiddenError(ErrorMessages[ErrorCode.PERM_001], ErrorCode.PERM_001);
    }
    const { data, total } = await this.repo.listMembers(workspaceId, params);
    const presenceMap = await getStates(viewerId, data.map((row) => row.user.id));
    const rows = data.map((row) => toMemberRow(row, viewerId, presenceMap[row.user.id]?.state ?? "OFFLINE", viewerRole));
    return { data: rows, total };
  }

  async getCard(
    viewerId: string,
    viewerRole: WorkspaceRoleValue,
    workspaceId: string,
    targetUserId: string
  ): Promise<MemberCard> {
    const found = await this.repo.findWithUser(workspaceId, targetUserId);
    if (!found) throw new NotFoundError();
    const presenceMap = await getStates(viewerId, [targetUserId]);
    const guestChannelIds =
      found.membership.role === "GUEST" && (viewerRole === "OWNER" || viewerRole === "ADMIN")
        ? await this.repo.listGuestChannelIds(workspaceId, targetUserId)
        : undefined;
    const contact = await this.contactAbility(viewerId, found.membership.status, targetUserId);
    return toMemberCard(found, viewerId, viewerRole, presenceMap[targetUserId]?.state ?? "OFFLINE", guestChannelIds, contact);
  }

  /** Chỉ tính cho thành viên ACTIVE khác chính mình; lỗi tính (DB/Redis) → không hứa gì (`false`) thay vì làm hỏng cả thẻ. */
  private async contactAbility(viewerId: string, targetStatus: string, targetUserId: string): Promise<MemberContactAbility> {
    if (!this.contact || targetStatus !== "ACTIVE" || targetUserId === viewerId) return NO_CONTACT_ABILITY;
    try {
      return await this.contact.evaluate(viewerId, targetUserId);
    } catch {
      return NO_CONTACT_ABILITY;
    }
  }
}
