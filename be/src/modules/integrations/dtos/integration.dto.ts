import { z } from "zod";
import { ALL_INTEGRATION_EVENT_TYPES, INTEGRATION_PROVIDER_KEYS, INTEGRATION_PROVIDERS, INTEGRATION_TARGET_SCOPE_TYPES } from "../../../core/constants/integration";
import { LIMITS } from "../../../core/constants/limits";
import { cursorQuerySchema, objectIdSchema, paginationSchema } from "../../../shared/dto/common-schemas";

const providerKey = z.enum(INTEGRATION_PROVIDER_KEYS);
const webhookStatus = z.enum(["RECEIVED", "PROCESSED", "IGNORED", "FAILED"]);
const integrationStatus = z.enum(["ACTIVE", "ERROR", "REVOKED", "DISABLED"]);

// ── params ───────────────────────────────────────────────────────────────────
export const providerParamsSchema = z.object({ provider: providerKey });
export const workspaceProviderParamsSchema = z.object({ workspaceId: objectIdSchema, provider: providerKey });
export const workspaceParamsSchema = z.object({ workspaceId: objectIdSchema });
export const integrationEventParamsSchema = z.object({ id: objectIdSchema, eventId: objectIdSchema });
export const adminProviderParamsSchema = z.object({ provider: z.enum(INTEGRATION_PROVIDERS) });

// ── body ─────────────────────────────────────────────────────────────────────
export const connectSchema = z.object({ returnTo: z.enum(["app", "admin"]).default("app") }).strict();

const resourceSchema = z.object({
  id: z.string().trim().min(1).max(64),
  fullName: z.string().trim().min(1).max(200),
});

export const updateIntegrationSchema = z
  .object({
    repos: z.array(resourceSchema).max(LIMITS.integration.reposPerIntegrationMax).optional(),
    events: z.array(z.enum(ALL_INTEGRATION_EVENT_TYPES)).max(ALL_INTEGRATION_EVENT_TYPES.length).optional(),
    targetScopeType: z.enum(INTEGRATION_TARGET_SCOPE_TYPES).optional(),
    targetScopeId: objectIdSchema.optional(),
    expectedVersion: z.number().int().min(0),
  })
  .strict()
  .refine((v) => (v.targetScopeType === undefined) === (v.targetScopeId === undefined), {
    message: "Phải gửi cả targetScopeType và targetScopeId khi đổi nơi nhận",
    path: ["targetScopeId"],
  });

export const providerToggleSchema = z.object({
  enabled: z.boolean(),
  reason: z.string().trim().min(10, "Lý do tối thiểu 10 ký tự").max(500),
});

export const replayReasonSchema = z.object({ reason: z.string().trim().min(10, "Lý do tối thiểu 10 ký tự").max(500) });

// ── query ────────────────────────────────────────────────────────────────────
/** Query callback OAuth do NHÀ CUNG CẤP gửi — khoá lạ (`scope`, `authuser`, `iss`…) bị bỏ qua, không lỗi. */
export const callbackQuerySchema = z.object({
  state: z.string().min(16).max(128),
  code: z.string().max(2048).optional(),
  installation_id: z.string().regex(/^\d{1,20}$/).optional(),
  setup_action: z.string().max(40).optional(),
  error: z.string().max(200).optional(),
});

export const eventsQuerySchema = cursorQuerySchema.extend({ status: webhookStatus.optional() });

export const resourcesQuerySchema = z.object({
  query: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).max(100).default(1),
});

export const adminEventsQuerySchema = paginationSchema.extend({
  provider: z.enum(["GITHUB", "GITLAB", "GOOGLE", "FIGMA"]).optional(),
  status: webhookStatus.optional(),
  workspaceId: objectIdSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

/** `status` nhận nhiều giá trị ngăn dấu phẩy (`ERROR,REVOKED`); mặc định chỉ kết nối lỗi/thu hồi (tab "Kết nối lỗi"). */
export const adminConnectionsQuerySchema = paginationSchema.extend({
  status: z
    .string()
    .max(60)
    .optional()
    .transform((v) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : ["ERROR", "REVOKED"]))
    .pipe(z.array(integrationStatus).min(1).max(4)),
  provider: z.enum(INTEGRATION_PROVIDERS).optional(),
  workspaceId: objectIdSchema.optional(),
});

export type ConnectDto = z.infer<typeof connectSchema>;
export type UpdateIntegrationDto = z.infer<typeof updateIntegrationSchema>;
export type EventsQueryDto = z.infer<typeof eventsQuerySchema>;
export type ResourcesQueryDto = z.infer<typeof resourcesQuerySchema>;
export type AdminEventsQueryDto = z.infer<typeof adminEventsQuerySchema>;
export type AdminConnectionsQueryDto = z.infer<typeof adminConnectionsQuerySchema>;
export type ProviderToggleDto = z.infer<typeof providerToggleSchema>;
