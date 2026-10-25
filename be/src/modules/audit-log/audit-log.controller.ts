import type { Request, Response } from "express";
import { catchAsync } from "../../core/utils/catchAsync";
import { ResponseUtils } from "../../core/utils/response";
import type { AuditService } from "./audit-log.service";
import type { ListAuditLogQuery } from "./audit-log.validators";

export function createAuditLogController(auditService: AuditService) {
  const list = catchAsync(async (req: Request, res: Response) => {
    const q = req.query as unknown as ListAuditLogQuery;
    const result = await auditService.list({
      cursor: q.cursor,
      limit: q.limit,
      actorId: q.actorId,
      action: q.action,
      targetType: q.targetType,
      targetId: q.targetId,
      workspaceId: q.workspaceId,
      from: q.from,
      to: q.to,
    });
    ResponseUtils.cursor(res, result, "Danh sách nhật ký thao tác");
  });

  return { list };
}
