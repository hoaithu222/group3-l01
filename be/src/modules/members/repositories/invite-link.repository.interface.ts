import type { InviteLink } from "../entities/invite.interface";

export interface InviteLinkListParams {
  cursor?: string;
  limit: number;
}

/**
 * Đọc + đếm `InviteLink` — TẠO/CHẤP NHẬN (CAS `remainingUses`) đi qua
 * `withTransaction` trực tiếp trong `invite.service.ts` (be.md §5.1/§5.3),
 * không qua repo này (cùng mẫu `workspace.service.ts`).
 */
export interface IInviteLinkRepository {
  findByTokenHash(tokenHash: string): Promise<InviteLink | null>;
  findById(id: string): Promise<InviteLink | null>;
  countActive(workspaceId: string, now: Date): Promise<number>;
  listByWorkspace(workspaceId: string, params: InviteLinkListParams): Promise<{ data: InviteLink[]; hasMore: boolean }>;
}
