import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { ChatExtensionsContainer } from "../chat-extensions.container";
import type { CreatePollDto, VoteDto, VotersQueryDto } from "../dtos";
import type { ChatScopeType } from "../entities/chat-extensions.types";

const actor = (req: Request) => req.user!;
/** `serverNow` để client so `version`/`closesAt` theo đồng hồ server (không tin đồng hồ máy). */
const withNow = <T extends object>(poll: T) => ({ ...poll, serverNow: new Date().toISOString() });

/** Controller factory (api-patterns.md) — chỉ parse request, gọi service, trả response. Quyền/đọc kiểm ở service (`IMessageSendPort`). */
export function createPollController(c: Pick<ChatExtensionsContainer, "polls">) {
  const create = catchAsync(async (req: Request, res: Response) => {
    const { scopeType, scopeId } = req.params;
    const result = await c.polls.create(actor(req), scopeType as ChatScopeType, scopeId, req.body as CreatePollDto);
    // Tin khảo sát = `MessageView` của engine + `poll` (đủ vẽ thẻ ngay, kể cả khi tiến trình này chưa đăng ký cổng đọc khảo sát).
    const data = { ...result.message, poll: withNow(result.poll) };
    if (result.replayed) {
      res.setHeader("Idempotent-Replayed", "true");
      ResponseUtils.success(res, data, "Thành công", 200);
      return;
    }
    ResponseUtils.success(res, data, "Đã tạo khảo sát", 201);
  });

  const get = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, withNow(await c.polls.get(actor(req), req.params.pollId)));
  });

  const vote = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, withNow(await c.polls.vote(actor(req), req.params.pollId, (req.body as VoteDto).optionIds)), "Đã ghi nhận lựa chọn");
  });

  const unvote = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, withNow(await c.polls.unvote(actor(req), req.params.pollId)), "Đã bỏ lựa chọn");
  });

  const close = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, withNow(await c.polls.close(actor(req), req.params.pollId)), "Đã đóng khảo sát");
  });

  const voters = catchAsync(async (req: Request, res: Response) => {
    const page = await c.polls.voters(actor(req), req.params.pollId, req.query as unknown as VotersQueryDto);
    ResponseUtils.cursor(res, { data: page.data, meta: { nextCursor: page.nextCursor, hasMore: page.hasMore, limit: page.limit } });
  });

  return { create, get, vote, unvote, close, voters };
}
