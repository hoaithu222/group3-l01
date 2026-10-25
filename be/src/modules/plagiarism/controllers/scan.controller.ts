import type { Request, Response } from "express";
import { UnauthorizedError } from "../../../core/exceptions";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { CreateScanDto, EligibleResourcesQueryDto, ListScansQueryDto } from "../dtos/scan.dto";
import type { ScanRow } from "../repositories/scan.repository";
import type { ScanService } from "../services/scan.service";

function requireUser(req: Request) {
  if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
  return req.user;
}

function isOwner(req: Request): boolean {
  return req.access?.WORKSPACE?.role === "OWNER";
}

function presentScan(scan: ScanRow, actorId: string, ownerFlag: boolean) {
  const active = scan.status === "QUEUED" || scan.status === "INDEXING" || scan.status === "SCANNING";
  const mine = scan.requestedBy === actorId || ownerFlag;
  return { ...scan, myActions: { cancel: mine && active, delete: mine, export: false } };
}

export function createScanController(d: { scans: ScanService }) {
  const eligibleResources = catchAsync(async (req: Request, res: Response) => {
    const query = req.query as unknown as EligibleResourcesQueryDto;
    ResponseUtils.cursor(res, await d.scans.eligibleResources({ workspaceId: req.params.workspaceId, ...query }), "Tệp đủ điều kiện quét");
  });

  const create = catchAsync(async (req: Request, res: Response) => {
    const body = req.body as CreateScanDto;
    const scan = await d.scans.create({ workspaceId: req.params.workspaceId, requestedBy: requireUser(req).id, ...body });
    ResponseUtils.success(res, { scanId: scan.id, status: scan.status, expiresAt: scan.expiresAt }, "Đã xếp hàng lượt quét", 202);
  });

  const list = catchAsync(async (req: Request, res: Response) => {
    const query = req.query as unknown as ListScansQueryDto;
    ResponseUtils.cursor(res, await d.scans.list(req.params.workspaceId, query), "Lượt quét trùng lặp");
  });

  const getOne = catchAsync(async (req: Request, res: Response) => {
    const scan = await d.scans.getById(req.params.scanId);
    ResponseUtils.success(res, { ...presentScan(scan, requireUser(req).id, isOwner(req)), serverNow: new Date().toISOString() });
  });

  const cancel = catchAsync(async (req: Request, res: Response) => {
    const scan = await d.scans.cancel(req.params.scanId, requireUser(req).id, isOwner(req));
    ResponseUtils.success(res, { status: scan.status }, "Đã huỷ lượt quét");
  });

  const remove = catchAsync(async (req: Request, res: Response) => {
    await d.scans.remove(req.params.scanId, requireUser(req).id, isOwner(req));
    res.status(204).send();
  });

  return { eligibleResources, create, list, getOne, cancel, remove };
}
