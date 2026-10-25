import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { WhiteboardsContainer } from "../whiteboards.container";
import type {
  AddCollaboratorsDto,
  ArchiveWhiteboardDto,
  CreateSnapshotDto,
  CreateWhiteboardDto,
  ListSnapshotsQueryDto,
  ListWhiteboardsQueryDto,
  RestoreSnapshotDto,
  UpdateWhiteboardDto,
} from "../dtos";

const actor = (req: Request) => req.user!;

/** Controller factory (api-patterns.md) — chỉ parse request, gọi service, trả response. Quyền kiểm ở service (`permissionService.assert`, scope WHITEBOARD). */
export function createWhiteboardsController(c: WhiteboardsContainer) {
  // ── Bảng trắng ────────────────────────────────────────────────────────────
  const list = catchAsync(async (req: Request, res: Response) => {
    const page = await c.service.list(actor(req), req.params.workspaceId, req.query as unknown as ListWhiteboardsQueryDto);
    ResponseUtils.cursor(res, { data: page.data, meta: { nextCursor: page.nextCursor, hasMore: page.hasMore, limit: page.limit } });
  });
  const create = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await c.service.create(actor(req), req.params.workspaceId, req.body as CreateWhiteboardDto), "Đã tạo bảng trắng", 201);
  });
  const get = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await c.service.get(actor(req), req.params.id));
  });
  const update = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await c.service.update(actor(req), req.params.id, req.body as UpdateWhiteboardDto), "Đã cập nhật bảng trắng");
  });
  const archive = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await c.service.archive(actor(req), req.params.id, req.body as ArchiveWhiteboardDto), "Đã lưu trữ bảng trắng");
  });
  const unarchive = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await c.service.unarchive(actor(req), req.params.id, req.body as ArchiveWhiteboardDto), "Đã khôi phục bảng trắng");
  });

  // ── Người cộng tác ────────────────────────────────────────────────────────
  const listCollaborators = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await c.collaboratorsService.list(actor(req), req.params.id));
  });
  const addCollaborators = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await c.collaboratorsService.add(actor(req), req.params.id, req.body as AddCollaboratorsDto), "Đã thêm người cộng tác");
  });
  const removeCollaborator = catchAsync(async (req: Request, res: Response) => {
    await c.collaboratorsService.remove(actor(req), req.params.id, req.params.userId);
    res.status(204).end();
  });

  // ── Collab token ──────────────────────────────────────────────────────────
  const collabToken = catchAsync(async (req: Request, res: Response) => {
    // Token là bí mật ngắn hạn: không cho cache trung gian.
    res.setHeader("Cache-Control", "no-store");
    ResponseUtils.success(res, await c.collabService.issueToken(actor(req), req.params.id), "Đã cấp mã kết nối");
  });

  // ── Lịch sử phiên bản ─────────────────────────────────────────────────────
  const listSnapshots = catchAsync(async (req: Request, res: Response) => {
    const page = await c.snapshotsService.list(actor(req), req.params.id, req.query as unknown as ListSnapshotsQueryDto);
    ResponseUtils.cursor(res, { data: page.data, meta: { nextCursor: page.nextCursor, hasMore: page.hasMore, limit: page.limit } });
  });
  const createSnapshot = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await c.snapshotsService.create(actor(req), req.params.id, req.body as CreateSnapshotDto), "Đã lưu phiên bản", 201);
  });
  const getSnapshot = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await c.snapshotsService.get(actor(req), req.params.id, req.params.sid));
  });
  const restoreSnapshot = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await c.snapshotsService.restore(actor(req), req.params.id, req.params.sid, req.body as RestoreSnapshotDto), "Đã khôi phục phiên bản");
  });

  return {
    list,
    create,
    get,
    update,
    archive,
    unarchive,
    listCollaborators,
    addCollaborators,
    removeCollaborator,
    collabToken,
    listSnapshots,
    createSnapshot,
    getSnapshot,
    restoreSnapshot,
  };
}
