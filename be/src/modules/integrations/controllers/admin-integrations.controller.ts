import type { Request, Response } from "express";
import type { IntegrationProviderValue } from "../../../core/constants/integration";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { AdminConnectionsQueryDto, AdminEventsQueryDto, ProviderToggleDto } from "../dtos/integration.dto";
import { getIntegrationsContainer } from "../integrations.container";

const admin = () => getIntegrationsContainer().admin;
const actor = (req: Request) => ({ id: req.user!.id, role: req.user!.role });

function meta(page: number, limit: number, total: number) {
  return { page, limit, total, totalPages: Math.ceil(total / limit), hasNext: page * limit < total, hasPrev: page > 1 };
}

/** `/admin/integrations/*` (p5-03 be.md §4) — chỉ metadata + payload ĐÃ CHE; ghi (bật/tắt, phát lại) luôn có lý do + audit. */
export function createAdminIntegrationsController() {
  const listEvents = catchAsync(async (req: Request, res: Response) => {
    const q = req.query as unknown as AdminEventsQueryDto;
    const { items, total } = await admin().listEvents(q);
    ResponseUtils.paginated(res, { data: items, meta: meta(q.page, q.limit, total) });
  });

  const getEvent = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await admin().getEvent(req.params.id));
  });

  const replayEvent = catchAsync(async (req: Request, res: Response) => {
    const view = await admin().replayEvent(actor(req), req.params.id, (req.body as { reason: string }).reason);
    ResponseUtils.success(res, view, "Đã xếp phát lại sự kiện", 202);
  });

  const listProviders = catchAsync(async (_req: Request, res: Response) => {
    ResponseUtils.success(res, await admin().listProviders());
  });

  const toggleProvider = catchAsync(async (req: Request, res: Response) => {
    const body = req.body as ProviderToggleDto;
    const row = await admin().setProviderEnabled(actor(req), req.params.provider as IntegrationProviderValue, body.enabled, body.reason);
    ResponseUtils.success(res, row, body.enabled ? "Đã bật nhà cung cấp" : "Đã tắt nhà cung cấp");
  });

  const listConnections = catchAsync(async (req: Request, res: Response) => {
    const q = req.query as unknown as AdminConnectionsQueryDto;
    const { items, total } = await admin().listConnections(q);
    ResponseUtils.paginated(res, { data: items, meta: meta(q.page, q.limit, total) });
  });

  const listForWorkspace = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await admin().listForWorkspace(req.params.workspaceId));
  });

  return { listEvents, getEvent, replayEvent, listProviders, toggleProvider, listConnections, listForWorkspace };
}
