import { Router, type NextFunction, type Request, type Response } from "express";
import {
  authenticateToken,
  apiLimiter,
  validateBody,
  validateQuery,
  validateParams,
  idempotencyKey,
  scopeLimiter,
  requireFeature,
} from "../../core/middlewares";
import { MODULES } from "../../core/constants/modules";
import { requireWorkspaceRole } from "../../core/permission";
import { createSystemMessageService } from "../messages/public";
import { createAssetLinkService } from "../assets/public";
import { createUserContactLookup } from "../users/public";
import { PrismaConversationRepository } from "./repositories/conversation.repository.prisma";
import { registerConversationPermissionResolver, requireConversation } from "./permission/conversation.scope-resolver";
import { DirectConversationService } from "./services/direct-conversation.service";
import { GroupConversationService } from "./services/group-conversation.service";
import { ConversationMemberService } from "./services/conversation-member.service";
import { ConversationListService } from "./services/conversation-list.service";
import { ConversationMeService } from "./services/conversation-me.service";
import { ReadReceiptService } from "./services/read-receipt.service";
import { ConversationMediaService } from "./services/conversation-media.service";
import { createConversationController } from "./controllers/conversation.controller";
import { createDirectConversationController } from "./controllers/direct-conversation.controller";
import { createConversationMemberController } from "./controllers/conversation-member.controller";
import { createConversationMeController } from "./controllers/conversation-me.controller";
import {
  listConversationsQuerySchema,
  peopleQuerySchema,
  createDirectSchema,
  directUserParamSchema,
  createGroupSchema,
  patchConversationSchema,
  dissolveSchema,
  addMembersSchema,
  changeRoleSchema,
  transferOwnerSchema,
  memberUserParamSchema,
  listMembersQuerySchema,
  meSettingsSchema,
  mediaQuerySchema,
  readReceiptsQuerySchema,
} from "./dtos";

// ── DI wiring (be.md §1) ─────────────────────────────────────────────────────
const conversationRepo = new PrismaConversationRepository();
const assetLinkService = createAssetLinkService();
const systemMessageService = createSystemMessageService();

const directService = new DirectConversationService(conversationRepo);
const groupService = new GroupConversationService(conversationRepo, assetLinkService, systemMessageService);
const memberService = new ConversationMemberService(systemMessageService);
const listService = new ConversationListService(createUserContactLookup());
const meService = new ConversationMeService();
const readReceiptService = new ReadReceiptService();
const mediaService = new ConversationMediaService();

const conversationController = createConversationController(listService, groupService);
const directController = createDirectConversationController(directService);
const memberController = createConversationMemberController(memberService);
const meController = createConversationMeController(meService, readReceiptService, mediaService);

// Đăng ký resolver CONVERSATION cho PermissionService — side-effect lúc
// import, PHẢI chạy trước mọi route/room-guard dùng scope này (mục 1
// "critical facts", mirror `registerChannelPermissionResolver`).
registerConversationPermissionResolver();

// `M` = authenticateToken → isModuleEnabled("communication") → apiLimiter (be.md §4).
const M = [authenticateToken, requireFeature(MODULES.COMMUNICATION), apiLimiter] as const;

const peopleLimiter = scopeLimiter("people", (req) => req.user?.id ?? null, [{ max: 60, windowSeconds: 60 }]);
const dmCreateLimiter = scopeLimiter("dm-create", (req) => req.user?.id ?? null, [{ max: 60, windowSeconds: 3600 }]);
const groupCreateLimiter = scopeLimiter("group-create", (req) => req.user?.id ?? null, [{ max: 20, windowSeconds: 3600 }]);
const addMembersLimiter = scopeLimiter("conv-add", (req) => req.user?.id ?? null, [{ max: 100, windowSeconds: 3600 }]);

/** `POST /conversations` — `workspaceId` nằm trong BODY (không phải `:params`) — `requireWorkspaceRole()` đọc `req.params[param]`, cần bơm sang trước khi gọi (mirror `injectScope` của `messages.routes.ts`). */
function injectWorkspaceIdFromBody(req: Request, _res: Response, next: NextFunction): void {
  req.params.workspaceId = (req.body as { workspaceId?: string })?.workspaceId ?? "";
  next();
}

const router = Router();

router.get("/conversations", ...M, validateQuery(listConversationsQuerySchema), conversationController.list);

router.get("/conversations/people", ...M, peopleLimiter, validateQuery(peopleQuerySchema), conversationController.people);

router.get("/conversations/direct/:userId", ...M, validateParams(directUserParamSchema), directController.get);

router.post(
  "/conversations/direct",
  ...M,
  dmCreateLimiter,
  validateBody(createDirectSchema),
  directController.create
);

router.post(
  "/conversations",
  ...M,
  idempotencyKey("conv-create", { required: true }),
  validateBody(createGroupSchema),
  injectWorkspaceIdFromBody,
  requireWorkspaceRole("MEMBER"),
  groupCreateLimiter,
  conversationController.createGroup
);

router.get("/conversations/:id", ...M, requireConversation("conversation.read"), conversationController.get);

router.patch(
  "/conversations/:id",
  ...M,
  requireConversation("conversation.update"),
  validateBody(patchConversationSchema),
  conversationController.patch
);

router.post(
  "/conversations/:id/dissolve",
  ...M,
  requireConversation("conversation.dissolve"),
  validateBody(dissolveSchema),
  conversationController.dissolve
);

router.get(
  "/conversations/:id/members",
  ...M,
  requireConversation("conversation.read"),
  validateQuery(listMembersQuerySchema),
  memberController.list
);

router.post(
  "/conversations/:id/members",
  ...M,
  requireConversation("conversation.member.add"),
  validateBody(addMembersSchema),
  addMembersLimiter,
  memberController.add
);

router.patch(
  "/conversations/:id/members/:userId",
  ...M,
  requireConversation("conversation.member.role"),
  validateParams(memberUserParamSchema),
  validateBody(changeRoleSchema),
  memberController.changeRole
);

router.delete(
  "/conversations/:id/members/:userId",
  ...M,
  requireConversation("conversation.member.remove"),
  validateParams(memberUserParamSchema),
  memberController.remove
);

router.post(
  "/conversations/:id/transfer-owner",
  ...M,
  requireConversation("conversation.transfer"),
  validateBody(transferOwnerSchema),
  memberController.transfer
);

router.post("/conversations/:id/leave", ...M, requireConversation("conversation.read"), memberController.leave);

// be.md §4 C("readIncludingDissolved") — collapses về cùng action
// `conversation.read` (canRead bỏ qua `Conversation.status`, xem docstring
// `conversation.scope-resolver.ts`).
router.patch(
  "/conversations/:id/me",
  ...M,
  requireConversation("conversation.read"),
  validateBody(meSettingsSchema),
  meController.updateMe
);

router.post("/conversations/:id/clear", ...M, requireConversation("conversation.read"), meController.clear);

router.get(
  "/conversations/:id/read-receipts",
  ...M,
  requireConversation("conversation.read"),
  validateQuery(readReceiptsQuerySchema),
  meController.readReceipts
);

router.get(
  "/conversations/:id/media",
  ...M,
  requireConversation("conversation.read"),
  validateQuery(mediaQuerySchema),
  meController.media
);

export default router;
