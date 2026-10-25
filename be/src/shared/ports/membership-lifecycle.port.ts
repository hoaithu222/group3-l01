/**
 * Cổng module `members` (p1-02) dùng bởi `workspaces` (p1-01) — `workspace-lifecycle.service.ts#leave`
 * gọi qua đây thay vì tự thao tác `WorkspaceMembership` (module không import
 * chéo module, `.claude/rules/architecture.md`). `modules/members` cài đặt và
 * export factory `createMembershipLifecyclePort()` từ `modules/members/public.ts`.
 */
export interface MembershipLifecyclePort {
  /** OWNER không gọi được (chặn ở `workspace-lifecycle.service.ts` trước khi tới đây, be.md p1-01 §5.6). */
  leave(userId: string, workspaceId: string): Promise<void>;
}
