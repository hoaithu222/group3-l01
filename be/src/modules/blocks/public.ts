/**
 * Barrel CÔNG KHAI của module `blocks` (p1-08) — NGOẠI LỆ CÓ CHỦ ĐÍCH của luật
 * "modules KHÔNG import chéo module" (`.claude/rules/architecture.md` "Shared
 * module services"), cùng cơ chế `@modules/assets/public`/`@modules/messages/public`.
 * Module cần biết "A/B có chặn nhau không" (conversations, presence, notifications
 * p1-07, calls p2-01) import `getBlockPort()` TỪ ĐÂY — KHÔNG đọc collection
 * `UserBlock` hay khoá Redis `block:*` trực tiếp.
 */
import type { BlockPort } from "../../shared/ports/block.port";
import { BlockPortImpl } from "./block-port.impl";
import { PrismaBlocksRepo } from "./blocks.repo";

export type { BlockPort } from "../../shared/ports/block.port";

/** Instance MỚI (test/DI tường minh). Production dùng `getBlockPort()` để chia sẻ 1 instance/tiến trình. */
export function createBlockPort(): BlockPort {
  return new BlockPortImpl(new PrismaBlocksRepo());
}

let singleton: BlockPort | null = null;

/** Singleton theo tiến trình — cache nằm ở Redis nên việc chia sẻ instance chỉ để tiết kiệm khởi tạo. */
export function getBlockPort(): BlockPort {
  if (!singleton) singleton = createBlockPort();
  return singleton;
}
