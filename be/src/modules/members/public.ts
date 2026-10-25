/**
 * Barrel công khai của module `members` — NGOẠI LỆ CÓ CHỦ ĐÍCH giống
 * `assets`/`devices`/`notifications` (`.claude/rules/architecture.md` §"Shared
 * module services"). `workspaces/workspaces.routes.ts` (p1-01) dùng
 * `createMembershipLifecyclePort()` để `WorkspaceLifecycleService#leave()`
 * uỷ quyền qua `MembershipLifecyclePort` thay vì tự viết lại logic revoke
 * (be.md p1-02 §1).
 */
import { PrismaMembershipRepository } from "./repositories";
import { MembershipLifecycleService } from "./services/membership-lifecycle.service";
import type { MembershipLifecyclePort } from "../../shared/ports/membership-lifecycle.port";
import type { WorkspaceMembershipPort } from "../../shared/ports/workspace-membership.port";
import { createChannelGrantPort } from "../channels";
import { WorkspaceMembershipPortImpl } from "./adapters/workspace-membership.port.impl";

export function createMembershipLifecyclePort(): MembershipLifecyclePort {
  return new MembershipLifecycleService(new PrismaMembershipRepository());
}

/** p6-03 — `mentor` cấp/gia hạn/thu hồi khách có hạn qua cổng này (kiểu ở `shared/ports/workspace-membership.port`). */
export function createWorkspaceMembershipPort(): WorkspaceMembershipPort {
  return new WorkspaceMembershipPortImpl(createChannelGrantPort(), new MembershipLifecycleService(new PrismaMembershipRepository()));
}
