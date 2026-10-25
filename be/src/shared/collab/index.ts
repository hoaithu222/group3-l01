/**
 * Barrel dịch vụ cộng tác DÙNG CHUNG (p6-01 `documents`, p6-02 `whiteboards`) — đặt ở `shared/` để hai module KHÔNG import chéo nhau
 * (`.claude/rules/architecture.md`): token collab, máy khách BE → collab, ma trận quyền thuần, thao tác Yjs thuần, bảng màu.
 */
export { CollabTokenService, collabDocumentName, toWebSocketUrl, COLLAB_TOKEN_AUDIENCE, COLLAB_TOKEN_ISSUER } from "./collab-token.service";
export type { CollabKind, IssueCollabTokenInput, IssuedCollabToken } from "./collab-token.service";
export { HttpCollabClient, NoopCollabClient, getCollabClient, setCollabClientForTests } from "./collab.client";
export type { CollabCallResult, CollabHealth, CollabKickInput, ICollabClient } from "./collab.client";
export { resolveCollabAbilities, collabModeOf } from "./collab-access";
export type { CollabAbility, CollabAccessInput, CollabCollaboratorRole, CollabVisibility, CollabWorkspaceRole } from "./collab-access";
export { DOCUMENT_FRAGMENT, mergeYjsStates, replaceFragmentContent } from "./yjs-state";
export type { FragmentReplacement } from "./yjs-state";
export { COLLAB_COLORS, collabColorFor } from "./collab-colors";
