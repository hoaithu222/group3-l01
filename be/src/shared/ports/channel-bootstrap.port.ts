import type { Prisma } from "@prisma/client";

/**
 * Cổng module `workspaces` (p1-01) dùng để tạo kênh mặc định "Chung" TRONG
 * CÙNG transaction tạo workspace — module `workspaces` KHÔNG được import
 * chéo sang `modules/channels` (luật 3 tầng, `.claude/rules/architecture.md`).
 * `modules/channels` cài đặt cổng này và export factory `createChannelBootstrap()`
 * từ `modules/channels/index.ts` (be.md p1-01 §1); `workspaces.routes.ts` tự
 * `new` factory đó khi wiring DI, giống `createAssetLinkService()`.
 */
export interface ChannelBootstrapInput {
  workspaceId: string;
  createdBy: string;
  name: string;
}

export interface ChannelBootstrapResult {
  id: string;
  name: string;
}

export interface ChannelBootstrapPort {
  /** Tạo kênh TEXT/PUBLIC/MEMBERS mặc định (`isDefault: true`) + membership người tạo + `Counter ch:<id>`. */
  createDefault(tx: Prisma.TransactionClient, input: ChannelBootstrapInput): Promise<ChannelBootstrapResult>;
  /** Thêm 1 người vào kênh mặc định của workspace (p1-02 be.md §5.3, lúc `accept` lời mời) — idempotent. */
  joinDefault(tx: Prisma.TransactionClient, channelId: string, userId: string): Promise<void>;
}
