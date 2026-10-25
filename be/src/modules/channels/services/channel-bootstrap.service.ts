import type { Prisma } from "@prisma/client";
import { normalizeSearch } from "../../../core/utils/normalize";
import type {
  ChannelBootstrapPort,
  ChannelBootstrapInput,
  ChannelBootstrapResult,
} from "../../../shared/ports/channel-bootstrap.port";
import { ChannelRoleAccessService } from "./channel-role-access.service";

/**
 * Cài đặt `ChannelBootstrapPort` — CHỈ phần tạo kênh mặc định "Chung" dùng
 * bởi `workspaces.create()` (p1-01 be.md §1/§5.1). Đi thẳng `tx.channel.*`
 * (không qua repository, giống `AssetLinkService.attach`) vì đây là thao tác
 * xuyên collection PHẢI atomic với transaction tạo workspace của module gọi.
 * CRUD/grant/archive kênh đầy đủ (routes, controller, service khác) sẽ thêm
 * khi tới lượt module `channels` (p1-03) — KHÔNG mở rộng file này trước đó.
 */
export class ChannelBootstrapService implements ChannelBootstrapPort {
  constructor(private readonly roleAccess: ChannelRoleAccessService = new ChannelRoleAccessService()) {}

  async createDefault(
    tx: Prisma.TransactionClient,
    input: ChannelBootstrapInput
  ): Promise<ChannelBootstrapResult> {
    const channel = await tx.channel.create({
      data: {
        workspaceId: input.workspaceId,
        name: input.name,
        normalizedName: normalizeSearch(input.name),
        type: "TEXT",
        visibility: "PUBLIC",
        postingPolicy: "MEMBERS",
        isDefault: true,
        memberCount: 1,
        createdBy: input.createdBy,
      },
    });

    await tx.channelMembership.create({
      data: {
        channelId: channel.id,
        workspaceId: input.workspaceId,
        userId: input.createdBy,
      },
    });

    await tx.counter.create({ data: { key: `ch:${channel.id}`, seq: 0 } });

    return { id: channel.id, name: channel.name };
  }

  async joinDefault(tx: Prisma.TransactionClient, channelId: string, userId: string): Promise<void> {
    const channel = await tx.channel.findUniqueOrThrow({ where: { id: channelId } });
    const existing = await tx.channelMembership.findUnique({
      where: { channelId_userId: { channelId, userId } },
    });
    // idempotent — accept() có thể chạy lại cho người LEFT/REMOVED quay lại
    if (!existing) {
      await tx.channelMembership.create({
        data: { channelId, workspaceId: channel.workspaceId, userId },
      });
      await tx.channel.update({ where: { id: channelId }, data: { memberCount: { increment: 1 } } });
    }

    // p3-04: thành viên mới (đã ACTIVE trong transaction này) cũng nhận `ChannelMembership` của các kênh riêng tư đã cấp
    // theo VAI TRÒ phủ tới họ — chạy cả khi đã có membership kênh mặc định (idempotent).
    await this.roleAccess.reconcileUser(tx, channel.workspaceId, userId);
  }
}
