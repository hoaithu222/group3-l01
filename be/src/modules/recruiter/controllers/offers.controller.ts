import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { CareerSettingsDto, CompanyOffersQuery, DeclineDto, MyOffersQuery, OfferMessageDto, OfferMessagesQuery, ProfileViewsQuery, SendOfferDto } from "../dtos";
import type { CareerSettingsService } from "../services/career-settings.service";
import type { CompanyBlockService } from "../services/company-block.service";
import type { JobOfferService } from "../services/job-offer.service";
import type { OfferMessageService } from "../services/offer-message.service";
import type { StudentOfferService } from "../services/student-offer.service";
import { requireUser } from "./company.controller";

/** Lời mời phía HR (`/companies/:companyId/offers*`) — quyền đã kiểm bởi `companyScope`. */
export function createCompanyOffersController(offers: JobOfferService) {
  const send = catchAsync(async (req: Request, res: Response) => {
    const r = await offers.send(requireUser(req), req.params.companyId, req.body as SendOfferDto, req.header("Idempotency-Key") ?? undefined);
    ResponseUtils.success(res, r.offer, r.created ? "Đã gửi lời mời" : "Lời mời đã được gửi trước đó", r.created ? 201 : 200);
  });

  const list = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.cursor(res, await offers.list(req.params.companyId, req.query as unknown as CompanyOffersQuery), "Lời mời của doanh nghiệp");
  });

  const get = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await offers.get(requireUser(req), req.params.companyId, req.params.offerId), "Lời mời");
  });

  const withdraw = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await offers.withdraw(requireUser(req), req.params.companyId, req.params.offerId), "Đã thu hồi lời mời");
  });

  return { send, list, get, withdraw };
}

/** Lời mời phía SINH VIÊN (`/me/offers*`), trao đổi (`/offers/:offerId/messages`), hồ sơ tìm việc (`PUT /me/career`), chặn công ty, lượt xem hồ sơ. */
export function createStudentController(student: StudentOfferService, messages: OfferMessageService, career: CareerSettingsService, blocks: CompanyBlockService) {
  const listOffers = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.cursor(res, await student.list(requireUser(req), req.query as unknown as MyOffersQuery), "Lời mời của tôi");
  });

  const getOffer = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await student.get(requireUser(req), req.params.offerId), "Lời mời");
  });

  const interested = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await student.interested(requireUser(req), req.params.offerId, (req.body as { shareEmail: boolean }).shareEmail), "Đã bày tỏ quan tâm");
  });

  const decline = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await student.decline(requireUser(req), req.params.offerId, req.body as DeclineDto), "Đã từ chối lời mời");
  });

  const listMessages = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.cursor(res, await messages.list(requireUser(req), req.params.offerId, req.query as unknown as OfferMessagesQuery), "Tin nhắn trong lời mời");
  });

  const sendMessage = catchAsync(async (req: Request, res: Response) => {
    const r = await messages.send(requireUser(req), req.params.offerId, req.body as OfferMessageDto);
    ResponseUtils.success(res, r.message, r.created ? "Đã gửi tin nhắn" : "Tin nhắn đã được gửi trước đó", r.created ? 201 : 200);
  });

  const getCareer = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await career.get(requireUser(req).id), "Hồ sơ tìm việc");
  });

  const putCareer = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await career.update(requireUser(req), req.body as CareerSettingsDto), "Đã cập nhật hồ sơ tìm việc");
  });

  const listBlocks = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await blocks.list(requireUser(req)), "Doanh nghiệp đã chặn");
  });

  const block = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await blocks.block(requireUser(req), (req.body as { companyId: string }).companyId), "Đã chặn doanh nghiệp", 201);
  });

  const unblock = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await blocks.unblock(requireUser(req), req.params.companyId), "Đã bỏ chặn doanh nghiệp");
  });

  const profileViews = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.cursor(res, await blocks.profileViews(requireUser(req), req.query as unknown as ProfileViewsQuery), "Doanh nghiệp đã xem hồ sơ");
  });

  return { listOffers, getOffer, interested, decline, listMessages, sendMessage, getCareer, putCareer, listBlocks, block, unblock, profileViews };
}
