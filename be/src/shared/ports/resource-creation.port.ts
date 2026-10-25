import type { AuthUser } from "../../core/types/express";

/**
 * Cổng "lưu tệp của một tin nhắn vào Resource Hub" (p7-04 be.md §5.6) — `chat-extensions` gọi mà KHÔNG import `modules/resources`. `modules/resources` (p3-01) cài đặt bằng
 * `ResourceCreationPortImpl` (`modules/resources/services/resource-creation.port.impl.ts`, export qua `modules/resources/public.ts`): tạo `Resource` trỏ CÙNG `assetId` +
 * `AssetLink(targetType RESOURCE)` (không nhân file), tính hạn mức dung lượng nhóm. `chat-extensions` vẫn nhận cổng qua constructor tuỳ chọn (test truyền fake) — thiếu cổng → `to-resource`
 * trả 501 `SYS_501`; container thật (`chat-extensions.container.ts`) luôn nối `createResourceCreationPort()` nên API không rơi vào nhánh này.
 * ⚠ (2026-09-29) Vòng đời tệp dùng chung CHƯA được đảm bảo trọn vẹn: `ResourcePurgeService.purgeOne` (module `resources`) xoá object storage + đánh dấu `Asset` `DELETED` vô điều kiện khi
 * dọn thùng rác — KHÔNG kiểm asset còn `AssetLink(MESSAGE)` (hay đích khác) hay không. Xoá vĩnh viễn một `Resource` tạo từ tin nhắn qua cổng này có thể làm hỏng tệp đính kèm gốc của tin.
 * Cần sửa ở `resources/services/resource-purge.service.ts` (ngoài phạm vi cổng này).
 */
export interface ResourceCreationInput {
  actor: AuthUser;
  workspaceId: string;
  /** Vắng → gốc kho. */
  folderId?: string;
  assetId: string;
  /** Tên hiển thị (mặc định lấy từ tệp đính kèm của tin). */
  name: string;
  /** Tin nguồn đã được người gọi kiểm quyền đọc — cho phép nới luật "asset chưa có AssetLink" của `resources`. */
  source: { messageId: string };
}

export interface ResourceCreationResult {
  id: string;
  assetId: string;
  name: string;
}

export interface IResourceCreationPort {
  /** Quyền `workspace.resource.upload` ở nhóm đích (404/403 của `resources`). */
  assertCanUpload(actor: AuthUser, workspaceId: string): Promise<void>;
  /** `RSC_003` khi tệp đã là tài liệu (mỗi asset một `Resource`). */
  createFromExistingAsset(input: ResourceCreationInput): Promise<ResourceCreationResult>;
}
