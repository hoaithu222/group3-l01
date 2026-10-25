import type { Request, Response } from "express";
import { UnauthorizedError } from "../../../core/exceptions";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { AuthUser } from "../../../core/types/express";
import type { CallsContainer } from "../calls.container";
import type {
  ActiveCallQueryDto,
  CreateCallDto,
  DeviceActionDto,
  EndCallDto,
  HandDto,
  HostActionBodyDto,
  HostAction,
  JoinCallDto,
  LeaveRoomDto,
  RingAckDto,
  ScreenShareDto,
  ListCallsQueryDto,
} from "../dtos";
import type { CallEntity, CallParticipantEntity, CallTokenResponse } from "../entities/call.interface";

function userOf(req: Request): AuthUser {
  if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
  return req.user;
}

/** Controller mỏng: parse request → gọi service → `ResponseUtils` (be.md §4). Mọi DTO do server dựng, `myActions` tính ở service. */
export function createCallsController(c: CallsContainer) {
  const dtoOf = (user: AuthUser, call: CallEntity) => c.query.buildDto(user, call);
  const tokenParts = (t?: CallTokenResponse) => (t ? { token: t.token, livekitUrl: t.livekitUrl, expiresAt: t.expiresAt } : {});
  const now = () => new Date().toISOString();

  const create = catchAsync(async (req: Request, res: Response) => {
    const user = userOf(req);
    const r = await c.ring.create(user, req.body as CreateCallDto);
    ResponseUtils.success(
      res,
      { call: await dtoOf(user, r.call), joined: r.joined, ...tokenParts(r.token), serverNow: now() },
      r.joined ? "Đã tham gia cuộc gọi" : "Đã tạo cuộc gọi",
      r.created ? 201 : 200
    );
  });

  const getById = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await c.query.getDetail(userOf(req), req.params.id));
  });

  const getActive = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await c.query.getActive(userOf(req), req.query as unknown as ActiveCallQueryDto));
  });

  const answer = catchAsync(async (req: Request, res: Response) => {
    const user = userOf(req);
    const r = await c.responses.answer(user, req.params.id, (req.body as DeviceActionDto).deviceId);
    ResponseUtils.success(res, { call: await dtoOf(user, r.call), ...tokenParts(r.token), serverNow: now() }, "Đã trả lời cuộc gọi");
  });

  const decline = catchAsync(async (req: Request, res: Response) => {
    const user = userOf(req);
    const r = await c.responses.decline(user, req.params.id, (req.body as DeviceActionDto).deviceId);
    ResponseUtils.success(res, { call: await dtoOf(user, r.call), ignored: r.ignored }, "Đã từ chối cuộc gọi");
  });

  const cancel = catchAsync(async (req: Request, res: Response) => {
    const user = userOf(req);
    ResponseUtils.success(res, { call: await dtoOf(user, await c.responses.cancel(user, req.params.id)) }, "Đã huỷ cuộc gọi");
  });

  /** p2-02: thiết bị xác nhận đang đổ chuông — luôn 200 (trạng thái khác = no-op `acked:false`), lỗi chỉ khi không phải participant/đã kết thúc. */
  const ack = catchAsync(async (req: Request, res: Response) => {
    const r = await c.ringAck.ack(userOf(req), req.params.id, (req.body as RingAckDto).deviceId);
    ResponseUtils.success(res, { ok: true, acked: r.acked, serverNow: now() }, "Đã xác nhận nhận cuộc gọi");
  });

  const join = catchAsync(async (req: Request, res: Response) => {
    const user = userOf(req);
    const r = await c.ring.join(user, req.params.id, req.body as JoinCallDto);
    ResponseUtils.success(res, { call: await dtoOf(user, r.call), ...tokenParts(r.token), serverNow: now() }, "Đã tham gia cuộc gọi");
  });

  const leave = catchAsync(async (req: Request, res: Response) => {
    const user = userOf(req);
    // `rooms.leave` xử lý cả RING (chuyển thẳng `ends.leave`) lẫn ROOM (chủ phòng chuyển quyền/kết thúc — p2-03).
    const call = await c.rooms.leave(user, req.params.id, req.body as LeaveRoomDto);
    ResponseUtils.success(res, { call: await dtoOf(user, call) }, "Đã rời cuộc gọi");
  });

  const participantView = (p: CallParticipantEntity) => ({
    userId: p.userId,
    role: p.role,
    state: p.state,
    handRaisedAt: p.handRaisedAt ? p.handRaisedAt.toISOString() : null,
    mutedByHost: p.mutedByHost,
    screenSharing: p.publishPermissions.screen,
  });

  const voicePreview = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await c.preview.preview(userOf(req), req.params.id));
  });

  const hand = catchAsync(async (req: Request, res: Response) => {
    const p = await c.interaction.setHand(userOf(req), req.params.id, (req.body as HandDto).raised);
    ResponseUtils.success(res, { participant: participantView(p) }, "Đã cập nhật giơ tay");
  });

  const screenShare = catchAsync(async (req: Request, res: Response) => {
    const r = await c.interaction.setScreenShare(userOf(req), req.params.id, (req.body as ScreenShareDto).on);
    ResponseUtils.success(res, { granted: r.granted, holderUserId: r.holderUserId, participant: participantView(r.participant) }, "Đã cập nhật chia sẻ màn hình");
  });

  const hostAction = catchAsync(async (req: Request, res: Response) => {
    const user = userOf(req);
    const r = await c.host.act(user, req.params.id, req.params.action as HostAction, req.body as HostActionBodyDto);
    ResponseUtils.success(res, { call: await dtoOf(user, r.call), ...(r.participant ? { participant: participantView(r.participant) } : {}) }, "Đã thực hiện thao tác chủ phòng");
  });

  const end = catchAsync(async (req: Request, res: Response) => {
    const user = userOf(req);
    const call = await c.ends.end(user, req.params.id, (req.body as EndCallDto).forEveryone);
    ResponseUtils.success(res, { call: await dtoOf(user, call) }, "Đã kết thúc cuộc gọi");
  });

  const token = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await c.query.renewToken(userOf(req), req.params.id), "Đã cấp token");
  });

  const myActive = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await c.query.myActive(userOf(req)));
  });

  const history = catchAsync(async (req: Request, res: Response) => {
    const page = await c.query.history(userOf(req), req.query as unknown as ListCallsQueryDto);
    ResponseUtils.cursor(
      res,
      { data: page.items, meta: { nextCursor: page.nextCursor, hasMore: page.hasMore, limit: (req.query as unknown as ListCallsQueryDto).limit } },
      "Lịch sử cuộc gọi"
    );
  });

  return { create, getById, getActive, answer, decline, cancel, ack, join, leave, end, token, myActive, history, voicePreview, hand, screenShare, hostAction };
}
