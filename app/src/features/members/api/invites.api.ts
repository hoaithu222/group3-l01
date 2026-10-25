/** Đường dẫn endpoint `invites` (be.md p1-02 §4) — quản lý (theo workspace) + công khai. */
export function workspaceInvitesPath(workspaceId: string): string {
  return `/workspaces/${workspaceId}/invites`;
}

export function workspaceInvitePath(workspaceId: string, inviteId: string): string {
  return `${workspaceInvitesPath(workspaceId)}/${inviteId}`;
}

/** ⛔ `token` KHÔNG log/đưa vào analytics (app.md p1-02 §3) — xem `core/api/client.ts`. */
export function invitePreviewPath(token: string): string {
  return `/invites/${token}`;
}

export function inviteAcceptPath(token: string): string {
  return `/invites/${token}/accept`;
}
