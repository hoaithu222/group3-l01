/**
 * Barrel CÔNG KHAI của module `resources` (p3-01) — NGOẠI LỆ CÓ CHỦ ĐÍCH của luật "modules KHÔNG import chéo module"
 * (`.claude/rules/architecture.md` "Shared module services"), cùng cơ chế `@modules/assets/public`/`@modules/messages/public`.
 */
import { getResourcesContainer } from "./resources.container";

/**
 * p7-04 `IResourceCreationPort` (`shared/ports/resource-creation.port.ts`) — `chat-extensions` lưu tệp của tin nhắn vào kho tài liệu (`to-resource`) qua CHÍNH hạ tầng của `resources`
 * (`ResourceCreationPortImpl`, cùng singleton `getResourcesContainer()` mà `resources.routes.ts` dùng), KHÔNG import `resources/services/*` trực tiếp. Gọi hàm này LƯỜI (lúc dùng đầu, như
 * `createTaskCreationPort()` của `projects`) để import `chat-extensions.container.ts` không kéo theo cả đồ thị DI của `resources`.
 */
import type { IResourceCreationPort } from "../../shared/ports/resource-creation.port";

export type { IResourceCreationPort } from "../../shared/ports/resource-creation.port";
export function createResourceCreationPort(): IResourceCreationPort {
  return getResourcesContainer().resourceCreation;
}
