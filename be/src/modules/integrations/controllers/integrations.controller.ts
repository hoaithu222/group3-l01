import type { Request, Response } from "express";
import type { IntegrationProviderKey } from "../../../core/constants/integration";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { ConnectDto, EventsQueryDto, ResourcesQueryDto, UpdateIntegrationDto } from "../dtos/integration.dto";
import { getIntegrationsContainer } from "../integrations.container";
import type { CallbackQuery } from "../services/integration-connect.service";

const user = (req: Request) => req.user!;
const c = () => getIntegrationsContainer();

/** Controller cấp workspace + callback OAuth (p5-03 be.md §4). Không có logic nghiệp vụ — chỉ đọc request, gọi service, trả `ResponseUtils`. */
export function createIntegrationsController() {
  const providers = catchAsync(async (_req: Request, res: Response) => {
    ResponseUtils.success(res, await c().deps.availability.describe());
  });

  const listForWorkspace = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await c().service.listForWorkspace(user(req), req.params.workspaceId));
  });

  const connect = catchAsync(async (req: Request, res: Response) => {
    const body = req.body as ConnectDto;
    const result = await c().connect.connect(user(req), req.params.workspaceId, req.params.provider as IntegrationProviderKey, body.returnTo);
    ResponseUtils.success(res, result);
  });

  /** Route CÔNG KHAI (trình duyệt hệ thống không mang JWT) — mọi kết quả là 302 về deep link/admin, kể cả lỗi (`status=error&code=`). */
  const callback = catchAsync(async (req: Request, res: Response) => {
    const key = req.params.provider as IntegrationProviderKey;
    const query = req.query as unknown as CallbackQuery;
    const target = key === "google-calendar" ? await c().users.handleCallback(query) : await c().connect.handleCallback(key, query);
    res.setHeader("Cache-Control", "no-store");
    res.redirect(302, target);
  });

  const get = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await c().service.get(user(req), req.params.id));
  });

  const update = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await c().service.update(user(req), req.params.id, req.body as UpdateIntegrationDto), "Đã lưu cấu hình tích hợp");
  });

  const disconnect = catchAsync(async (req: Request, res: Response) => {
    await c().service.disconnect(user(req), req.params.id);
    res.status(204).send();
  });

  const resources = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await c().service.listResources(user(req), req.params.id, req.query as unknown as ResourcesQueryDto));
  });

  const events = catchAsync(async (req: Request, res: Response) => {
    const q = req.query as unknown as EventsQueryDto;
    const page = await c().events.list(user(req), req.params.id, q);
    ResponseUtils.cursor(res, { data: page.items, meta: { nextCursor: page.nextCursor, hasMore: page.nextCursor !== null, limit: page.limit } });
  });

  const replay = catchAsync(async (req: Request, res: Response) => {
    const view = await c().events.replay(user(req), req.params.id, req.params.eventId);
    ResponseUtils.success(res, view, "Đã xếp phát lại sự kiện", 202);
  });

  return { providers, listForWorkspace, connect, callback, get, update, disconnect, resources, events, replay };
}

/** Kết nối CÁ NHÂN (`/me/integrations*`) — chỉ chủ tài khoản. */
export function createUserIntegrationsController() {
  const list = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await c().users.list(user(req)));
  });

  const connectCalendar = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await c().users.connect(user(req), (req.body as ConnectDto).returnTo));
  });

  const disconnect = catchAsync(async (req: Request, res: Response) => {
    await c().users.disconnect(user(req), req.params.id);
    res.status(204).send();
  });

  return { list, connectCalendar, disconnect };
}
