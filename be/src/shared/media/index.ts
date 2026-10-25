/**
 * Barrel ẢNH HIỂN THỊ dùng chung (avatar người dùng/nhóm/nhóm chat, ảnh bìa nhóm) — đặt ở `shared/` để mọi module dựng
 * được `avatarUrl` từ `avatarAssetId` mà KHÔNG import chéo `users`/`assets` (`.claude/rules/architecture.md`).
 */
export { avatarUrlOf, displayImageExpiry, displayImageUrl, verifyDisplayImageSignature } from "./display-image";
export type { DisplayImageVariant } from "./display-image";
