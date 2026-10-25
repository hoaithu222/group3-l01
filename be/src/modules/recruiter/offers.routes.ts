import { Router } from "express";
import { idempotencyKey, scopeLimiter, validateBody, validateParams, validateQuery } from "../../core/middlewares";
import { LIMITS } from "../../core/constants/limits";
import { companyParamSchema } from "./dtos";
import { recruiterGuard } from "./companies.routes";
import { createCompanyOffersController, createStudentController } from "./controllers/offers.controller";
import {
  companyOfferParamSchema,
  companyOffersQuerySchema,
  declineSchema,
  interestedSchema,
  myOffersQuerySchema,
  offerMessageSchema,
  offerMessagesQuerySchema,
  offerParamSchema,
  sendOfferSchema,
} from "./dtos";
import { companyScope } from "./middlewares/company-scope.middleware";
import { getRecruiterContainer, type RecruiterContainer } from "./recruiter.container";

const byUser = (req: { user?: { id: string } }) => req.user?.id ?? null;
const byOffer = (req: { params: Record<string, string> }) => req.params.offerId ?? null;

/**
 * Lời mời: phía HR (`/companies/:companyId/offers*`), phía SINH VIÊN (`/me/offers*`) và thread trao đổi (`/offers/:offerId/messages`, cả hai bên — participant kiểm ở service, người ngoài 404).
 * Gửi lời mời: `Idempotency-Key` (replay), 20/giờ/HR, hạn mức tháng nguyên tử; mọi lý do "không gửi được" cùng `RECR_007`.
 */
/**
 * @openapi
 * /companies/{companyId}/offers:
 *   post:
 *     summary: "HR gửi lời mời (Idempotency-Key) — 201; RECR_005 hết hạn mức tháng, RECR_006 đã có lời mời mở, RECR_007 không thể gửi, ASSET_003/ASSET_005/ASSET_001 JD không hợp lệ"
 *     tags: [Offers]
 *     security: [{ BearerAuth: [] }]
 *   get:
 *     summary: "Lời mời của doanh nghiệp (cursor, status?, recruiterId?)"
 *     tags: [Offers]
 *     security: [{ BearerAuth: [] }]
 * /companies/{companyId}/offers/{offerId}:
 *   get:
 *     summary: "Chi tiết lời mời (kèm sharedEmail khi sinh viên chọn chia sẻ)"
 *     tags: [Offers]
 *     security: [{ BearerAuth: [] }]
 * /companies/{companyId}/offers/{offerId}/withdraw:
 *   post:
 *     summary: "Thu hồi lời mời (không hoàn lượt) — RECR_009 khi đã đóng"
 *     tags: [Offers]
 *     security: [{ BearerAuth: [] }]
 * /me/offers:
 *   get:
 *     summary: "Hộp thư lời mời của sinh viên (cursor, status?)"
 *     tags: [Offers]
 *     security: [{ BearerAuth: [] }]
 * /me/offers/{offerId}:
 *   get:
 *     summary: "Chi tiết lời mời — lần đầu mở chuyển SENT sang READ; jdUrl ký 60 giây"
 *     tags: [Offers]
 *     security: [{ BearerAuth: [] }]
 * /me/offers/{offerId}/interested:
 *   post:
 *     summary: "Quan tâm (shareEmail tuỳ chọn) — RECR_009 sai trạng thái, RECR_002 công ty tạm ngưng"
 *     tags: [Offers]
 *     security: [{ BearerAuth: [] }]
 * /me/offers/{offerId}/decline:
 *   post:
 *     summary: "Từ chối khéo (reason: NOT_LOOKING, NOT_A_FIT, LOCATION, TIMING, OTHER) — RECR_009 sai trạng thái"
 *     tags: [Offers]
 *     security: [{ BearerAuth: [] }]
 * /offers/{offerId}/messages:
 *   get:
 *     summary: "Tin nhắn trong lời mời (cursor, mới nhất trước) — participant"
 *     tags: [Offers]
 *     security: [{ BearerAuth: [] }]
 *   post:
 *     summary: "Gửi tin (clientMessageId idempotent) — RECR_008 khi chưa Quan tâm/bị khoá/công ty tạm ngưng; 50 tin/ngày/lời mời"
 *     tags: [Offers]
 *     security: [{ BearerAuth: [] }]
 */
export function createOffersRouter(c: RecruiterContainer = getRecruiterContainer()): Router {
  const s = c.services;
  const company = createCompanyOffersController(s.offers);
  const student = createStudentController(s.studentOffers, s.messages, s.careerSettings, s.blocks);
  const router = Router();

  router.post(
    "/companies/:companyId/offers",
    ...recruiterGuard,
    validateParams(companyParamSchema),
    companyScope({ approved: true }),
    idempotencyKey("offer-send"),
    scopeLimiter("offer-send", byUser, [{ max: LIMITS.offer.perRecruiterPerHour, windowSeconds: 3600 }]),
    validateBody(sendOfferSchema),
    company.send
  );
  router.get("/companies/:companyId/offers", ...recruiterGuard, validateParams(companyParamSchema), companyScope(), validateQuery(companyOffersQuerySchema), company.list);
  router.get("/companies/:companyId/offers/:offerId", ...recruiterGuard, validateParams(companyOfferParamSchema), companyScope(), company.get);
  router.post("/companies/:companyId/offers/:offerId/withdraw", ...recruiterGuard, validateParams(companyOfferParamSchema), companyScope({ approved: true }), company.withdraw);

  router.get("/me/offers", ...recruiterGuard, validateQuery(myOffersQuerySchema), student.listOffers);
  router.get("/me/offers/:offerId", ...recruiterGuard, validateParams(offerParamSchema), student.getOffer);
  router.post("/me/offers/:offerId/interested", ...recruiterGuard, validateParams(offerParamSchema), validateBody(interestedSchema), student.interested);
  router.post("/me/offers/:offerId/decline", ...recruiterGuard, validateParams(offerParamSchema), validateBody(declineSchema), student.decline);

  router.get("/offers/:offerId/messages", ...recruiterGuard, validateParams(offerParamSchema), validateQuery(offerMessagesQuerySchema), student.listMessages);
  router.post(
    "/offers/:offerId/messages",
    ...recruiterGuard,
    validateParams(offerParamSchema),
    scopeLimiter("offer-msg", byOffer, [{ max: LIMITS.offer.threadMessagesPerDay, windowSeconds: 24 * 3600 }]),
    validateBody(offerMessageSchema),
    student.sendMessage
  );
  return router;
}
