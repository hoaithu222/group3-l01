import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import { UnauthorizedError } from "../../../core/exceptions";
import type { ResolvedAccess } from "../../../core/permission";
import type { ChannelService, ListChannelsParams } from "../services/channel.service";
import type { ChannelLifecycleService } from "../services/channel-lifecycle.service";
import type { ChannelGrantService } from "../services/channel-grant.service";
import type {
  CreateChannelDto,
  UpdateChannelDto,
  ArchiveChannelDto,
  RestoreChannelDto,
  ChannelMeDto,
  ListChannelsQueryDto,
  ListChannelMembersQueryDto,
  SearchChannelNamesQueryDto,
} from "../dtos";

function requireUser(req: Request) {
  if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
  return req.user;
}

function requireChannelAccess(req: Request): ResolvedAccess {
  const access = req.access?.CHANNEL;
  if (!access) {
    throw new Error("[channels] Thiếu req.access.CHANNEL — route quên gắn requireChannelAccess()");
  }
  return access;
}

function paginationMeta(page: number, limit: number, total: number) {
  return { page, limit, total, totalPages: Math.ceil(total / limit) || 1, hasNext: page * limit < total, hasPrev: page > 1 };
}

export function createChannelController(
  channelService: ChannelService,
  lifecycleService: ChannelLifecycleService,
  grantService: ChannelGrantService
) {
  const create = catchAsync(async (req: Request, res: Response) => {
    const user = requireUser(req);
    const detail = await channelService.create(user.id, req.params.workspaceId, req.body as CreateChannelDto);
    ResponseUtils.success(res, detail, "Tạo kênh thành công", 201);
  });

  const list = catchAsync(async (req: Request, res: Response) => {
    const user = requireUser(req);
    const query = req.query as unknown as ListChannelsQueryDto;
    const params: ListChannelsParams = { include: query.include, type: query.type, status: query.status };
    const result = await channelService.list(user.id, req.params.workspaceId, params, { guest: req.access?.WORKSPACE?.role === "GUEST" });
    ResponseUtils.success(res, result);
  });

  const search = catchAsync(async (req: Request, res: Response) => {
    const user = requireUser(req);
    const { q } = req.query as unknown as SearchChannelNamesQueryDto;
    const result = await channelService.searchNames(user.id, req.params.workspaceId, q, { guest: req.access?.WORKSPACE?.role === "GUEST" });
    ResponseUtils.success(res, result);
  });

  const get = catchAsync(async (req: Request, res: Response) => {
    const user = requireUser(req);
    const access = requireChannelAccess(req);
    const detail = await channelService.get(req.params.channelId, user.id, access);
    ResponseUtils.success(res, detail);
  });

  const patch = catchAsync(async (req: Request, res: Response) => {
    const user = requireUser(req);
    const access = requireChannelAccess(req);
    const detail = await channelService.patch(user.id, req.params.channelId, req.body as UpdateChannelDto, access);
    ResponseUtils.success(res, detail, "Cập nhật thành công");
  });

  const archive = catchAsync(async (req: Request, res: Response) => {
    const user = requireUser(req);
    const detail = await lifecycleService.archive(user.id, req.params.channelId, req.body as ArchiveChannelDto);
    ResponseUtils.success(res, detail, "Đã lưu trữ kênh");
  });

  const restore = catchAsync(async (req: Request, res: Response) => {
    const user = requireUser(req);
    const detail = await lifecycleService.restore(user.id, req.params.channelId, req.body as RestoreChannelDto);
    ResponseUtils.success(res, detail, "Đã khôi phục kênh");
  });

  const join = catchAsync(async (req: Request, res: Response) => {
    const user = requireUser(req);
    const item = await channelService.join(user.id, req.params.channelId);
    ResponseUtils.success(res, item, "Đã tham gia kênh");
  });

  const leave = catchAsync(async (req: Request, res: Response) => {
    const user = requireUser(req);
    await channelService.leave(user.id, req.params.channelId);
    ResponseUtils.success(res, null, "Đã rời kênh");
  });

  const updateMe = catchAsync(async (req: Request, res: Response) => {
    const user = requireUser(req);
    const result = await channelService.me(user.id, req.params.channelId, req.body as ChannelMeDto);
    ResponseUtils.success(res, result);
  });

  const members = catchAsync(async (req: Request, res: Response) => {
    const user = requireUser(req);
    const query = req.query as unknown as ListChannelMembersQueryDto;
    const { data, total } = await grantService.members(user.id, req.params.channelId, query);
    ResponseUtils.paginated(res, { data, meta: paginationMeta(query.page, query.limit, total) });
  });

  return { create, list, search, get, patch, archive, restore, join, leave, updateMe, members };
}
