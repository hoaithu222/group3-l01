import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import { UnauthorizedError } from "../../../core/exceptions";
import type { IChannelRepository } from "../repositories/channel.repository.interface";
import type { ChannelLifecycleService } from "../services/channel-lifecycle.service";
import { toAdminChannelRow } from "../services/channel.presenter";
import type { AdminChannelArchiveDto, AdminListChannelsQueryDto } from "../dtos";

function requireUser(req: Request) {
  if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
  return req.user;
}

export function createAdminChannelController(channelRepo: IChannelRepository, lifecycleService: ChannelLifecycleService) {
  const list = catchAsync(async (req: Request, res: Response) => {
    // be.md §4 response `{ public, privateCount, privateArchivedCount }` —
    // `meta` (phân trang) đưa THÊM vào bên trong `data` (không phá hình dạng
    // đã tả) vì `adminListPublic()` đã tự tính `total` (đếm `Channel` PUBLIC)
    // mà trước đây bị bỏ qua, khiến admin không dựng được phân trang server
    // thật (admin.md §2.1 "Phân trang server") — điểm mở p1-03 README §10.
    // `validateQuery(adminListChannelsQuerySchema)` đã gán lại `req.query` bằng giá trị đã parse (page/limit có mặc định, status/type tuỳ chọn).
    const { page, limit, status, type } = req.query as unknown as AdminListChannelsQueryDto;
    const workspaceId = req.params.workspaceId;

    const [{ data, total }, privateCounts] = await Promise.all([
      channelRepo.adminListPublic(workspaceId, { page, limit, status, type }),
      channelRepo.adminCountPrivate(workspaceId),
    ]);

    ResponseUtils.success(res, {
      public: data,
      privateCount: privateCounts.total,
      privateArchivedCount: privateCounts.archived,
      meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    });
  });

  const archive = catchAsync(async (req: Request, res: Response) => {
    const user = requireUser(req);
    const { reason } = req.body as AdminChannelArchiveDto;
    const channel = await lifecycleService.platformArchive(user.id, req.params.channelId, reason);
    ResponseUtils.success(res, toAdminChannelRow(channel), "Đã lưu trữ kênh");
  });

  const restore = catchAsync(async (req: Request, res: Response) => {
    const user = requireUser(req);
    const { reason } = req.body as AdminChannelArchiveDto;
    const channel = await lifecycleService.platformRestore(user.id, req.params.channelId, reason);
    ResponseUtils.success(res, toAdminChannelRow(channel), "Đã khôi phục kênh");
  });

  return { list, archive, restore };
}
