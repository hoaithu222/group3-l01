/**
 * Barrel của module `channels` — export factory bootstrap kênh mặc định dùng
 * bởi `workspaces`/`members` (p1-01/p1-02 be.md §1) + `registerChannelModule()`
 * (p1-03 be.md §1). `modules/workspaces`/`modules/members` KHÔNG import gì
 * khác trong `channels/` ngoài file này (ngoại lệ có chủ đích, giống
 * `@modules/assets/public` — ghi vào `reuse-first.md`).
 */
import { ChannelBootstrapService } from "./services/channel-bootstrap.service";
import { ChannelGrantPortService } from "./services/channel-grant-port.service";
import type { ChannelBootstrapPort } from "../../shared/ports/channel-bootstrap.port";
import type { ChannelGrantPort } from "../../shared/ports/channel-grant.port";
import type { ChannelCreationPort } from "../../shared/ports/channel-creation.port";
import { ChannelService } from "./services/channel.service";
import { PrismaChannelRoleAudience } from "./services/channel-role-audience";
import { createChannelMessageScopeAdapter } from "./services/channel-message-scope.adapter";
import { registerMessageScope } from "../messages/public";
import type { ChannelAdminPort } from "../../shared/ports/moderation-actions.port";
import { ChannelLifecycleService } from "./services/channel-lifecycle.service";
import { ChannelOverviewContributor } from "./services/channel-overview.contributor";
import { registerWorkspaceOverviewContributor } from "../../shared/ports/workspace-overview.port";
import { PrismaChannelRepository, PrismaChannelMembershipRepository, PrismaChannelGrantRepository } from "./repositories";
import { prisma } from "../../infrastructure/database";
import { getResolver, registerScopeResolver, type ScopeRef, type ScopeResolver } from "../../core/permission";

/**
 * p1-08 `ChannelAdminPort` — `modules/moderation` lưu trữ kênh PUBLIC cấp nền tảng qua đây
 * (`ChannelLifecycleService.platformArchive`: `CH_012` kênh riêng tư, `CH_005` kênh mặc định).
 */
export function createChannelAdminPort(): ChannelAdminPort {
  const service = new ChannelLifecycleService(
    new PrismaChannelRepository(),
    new PrismaChannelMembershipRepository(),
    new PrismaChannelGrantRepository()
  );
  return {
    async platformArchive(adminId, channelId, reason) {
      await service.platformArchive(adminId, channelId, reason);
    },
  };
}

/**
 * p5-04 `ChannelCreationPort` — `workspace-templates` tạo kênh theo mẫu qua `ChannelService.create` (đủ kiểm hạn mức/cờ loại kênh/tên trùng,
 * outbox `channel.created`, audit `channel.create`), không import `channels` trực tiếp. Quy trình gọi + lỗi có thể gặp: `shared/ports/channel-creation.port.ts`.
 */
export function createChannelCreationPort(): ChannelCreationPort {
  const service = new ChannelService(
    new PrismaChannelRepository(),
    new PrismaChannelMembershipRepository(),
    new PrismaChannelGrantRepository(),
    new PrismaChannelRoleAudience()
  );
  return {
    async create(input) {
      const channel = await service.create(input.actorId, input.workspaceId, {
        name: input.name,
        description: input.description,
        type: input.type,
        visibility: input.visibility,
        postingPolicy: input.postingPolicy,
        initialMemberIds: [],
      });
      return { id: channel.id, name: channel.name };
    },
  };
}

export function createChannelBootstrap(): ChannelBootstrapPort {
  return new ChannelBootstrapService();
}

/**
 * p3-04 `ChannelGrantPort` — `modules/workspaces`/`members` (khách, lời mời email) cấp/thu hồi grant kênh DIRECT trong
 * transaction của họ qua đây, không import chéo `channels`. Quy trình gọi + chữ ký: `shared/ports/channel-grant.port.ts`.
 */
export function createChannelGrantPort(): ChannelGrantPort {
  return new ChannelGrantPortService();
}

/**
 * be.md p1-03 §5.6 — đăng ký `MessageScope` CHANNEL cho message engine
 * (p1-04, đã build) vào registry của `modules/messages` qua
 * `@modules/messages/public` (ngoại lệ "shared module service" đã xác nhận,
 * giống cách `messages` sẽ import `@modules/assets/public` — không phải kiểu
 * "core/permission scope resolver" registry đã có sẵn cho tầng authorization
 * chung, đây là registry RIÊNG của message engine, mục 7 "critical facts").
 *
 * Gọi ở `channels.routes.ts` KHÔNG hợp lý (đăng ký `MessageScope` không cần
 * instance repo cụ thể theo scope request nào — nó là 1 side-effect boot
 * "toàn cục" giống `registerMessageScope`/`registerScopeResolver` khác) nên
 * vẫn giữ nguyên vị trí `channels/index.ts#registerChannelModule()` mà p1-03
 * để dành — gọi 1 lần lúc `router.ts` import `channelsRoutes`/`channels/index.ts`
 * (`router.ts` đã import `channels/index.ts` gián tiếp qua
 * `channels.routes.ts`; để side-effect này CHẮC CHẮN chạy dù thứ tự import
 * nào, `router.ts` gọi thẳng `registerChannelModule()` ngay sau khi import —
 * xem `router.ts`).
 */
/** Đánh dấu resolver WORKSPACE đã bọc `children()` để gọi lại `registerChannelModule()` không bọc chồng. */
const wrappedWorkspaceResolvers = new WeakSet<ScopeResolver>();

/**
 * `revokeScope({ scope: WORKSPACE })` chỉ lan xuống scope con khi resolver WORKSPACE có `children()`. Resolver đó thuộc module
 * `workspaces` (không import chéo) ⇒ bọc lại qua registry của `core/permission` (cùng cách `projects` thêm BOARD): thêm mọi KÊNH
 * của workspace vào danh sách con để thu hồi (loại/chặn/rời/KHÁCH HẾT HẠN) bump version + ĐÁ socket khỏi `ch:*` — không để người
 * vừa mất quyền còn nhận tin realtime của kênh (p3-04 RB-04 "bị socketsLeave"). Gọi SAU khi `workspaces` đã đăng ký resolver.
 */
function extendWorkspaceChildrenWithChannels(): void {
  const base = getResolver("WORKSPACE");
  if (!base || wrappedWorkspaceResolvers.has(base)) return;
  const extended: ScopeResolver = {
    ...base,
    async children(workspaceId: string): Promise<ScopeRef[]> {
      const own = base.children ? await base.children(workspaceId) : [];
      const channels = await prisma.channel.findMany({ where: { workspaceId }, select: { id: true } });
      return [...own, ...channels.map((c): ScopeRef => ({ type: "CHANNEL", id: c.id }))];
    },
  };
  wrappedWorkspaceResolvers.add(extended);
  registerScopeResolver(extended);
}

export function registerChannelModule(): void {
  extendWorkspaceChildrenWithChannels();
  registerMessageScope("CHANNEL", createChannelMessageScopeAdapter());
  // p1-01 §5.7/p1-03 điểm mở #2 — khối "Kênh của bạn" (đã lọc theo grant) của trang tổng
  // quan workspace, đăng ký qua cổng `shared/ports/workspace-overview.port.ts` (không
  // import `modules/workspaces`).
  registerWorkspaceOverviewContributor(
    new ChannelOverviewContributor(
      new PrismaChannelRepository(),
      new PrismaChannelMembershipRepository(),
      new PrismaChannelGrantRepository()
    )
  );
}
