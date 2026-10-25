import type { Request, Response } from "express";
import { catchAsync } from "../../core/utils/catchAsync";
import { ResponseUtils } from "../../core/utils/response";
import { getStates } from "./presence.service";
import type { PresenceQuery } from "./presence.validators";

export function createPresenceController() {
  const getMany = catchAsync(async (req: Request, res: Response) => {
    const { userIds } = req.query as unknown as PresenceQuery;
    const states = await getStates(req.user!.id, userIds);
    ResponseUtils.success(res, { states });
  });

  return { getMany };
}
