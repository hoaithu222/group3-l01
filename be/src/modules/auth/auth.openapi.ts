/**
 * OpenAPI cho module `auth` — MẪU THAM CHIẾU cho README p0-09 §9 việc #3 (viết
 * `*.openapi.ts` cho các module còn lại, chuyển dần khỏi JSDoc `swagger-jsdoc`
 * trong `auth.routes.ts`). Dùng lại NGUYÊN Zod DTO thật của module (không viết
 * lại tay) — response `data` khớp `toAuthUserDto()` (`dtos/auth-user.dto.ts`
 * qua `AuthUserDtoSchema` dùng chung ở `core/openapi/registry.ts`).
 *
 * Import file này qua `core/openapi/index.ts` (side effect — gọi
 * `registry.registerPath()` lúc nạp), KHÔNG tự import trực tiếp ở nơi khác.
 *
 * Chỉ phủ vài route tiêu biểu (login/register/forgot·reset-password/me) — CHƯA
 * phủ hết `auth.routes.ts` (biometric, session, refresh, verify-email, ...);
 * các route đó tạm thời vẫn chỉ có JSDoc `swagger-jsdoc` hiện có, sẽ chuyển dần.
 */
import { z } from "zod";
import { registry, apiResponse, errorResponses, AuthUserDtoSchema } from "../../core/openapi/registry";
import {
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "./dtos/auth.dto";

/** `TokenIssuer`/`toAuthUserDto()` (`services/token-issuer.ts`) — `{ user, accessToken, refreshToken? }`; `refreshToken` chỉ có ở app (web nhận qua cookie httpOnly, không có ở body). */
const loginResponseSchema = apiResponse(
  "LoginResponse",
  z.object({
    user: AuthUserDtoSchema,
    accessToken: z.string(),
    refreshToken: z.string().optional(),
  })
);

registry.registerPath({
  method: "post",
  path: "/auth/login",
  operationId: "loginUser",
  tags: ["Auth"],
  summary: "Đăng nhập",
  request: { body: { content: { "application/json": { schema: loginSchema } } } },
  responses: {
    200: { description: "Đăng nhập thành công", content: { "application/json": { schema: loginResponseSchema } } },
    ...errorResponses([400, 401, 429]),
  },
});

registry.registerPath({
  method: "post",
  path: "/auth/register",
  operationId: "registerUser",
  tags: ["Auth"],
  summary: "Đăng ký tài khoản mới",
  request: { body: { content: { "application/json": { schema: registerSchema } } } },
  responses: {
    201: { description: "Tạo tài khoản thành công", content: { "application/json": { schema: loginResponseSchema } } },
    ...errorResponses([400, 409, 429]),
  },
});

registry.registerPath({
  method: "post",
  path: "/auth/forgot-password",
  operationId: "forgotPassword",
  tags: ["Auth"],
  summary: "Yêu cầu đặt lại mật khẩu",
  description: "Luôn trả 200 kể cả email không tồn tại (không lộ tài khoản đang tồn tại hay không).",
  request: { body: { content: { "application/json": { schema: forgotPasswordSchema } } } },
  responses: {
    200: {
      description: "Đã xử lý yêu cầu (không lộ tồn tại email)",
      content: { "application/json": { schema: apiResponse("ForgotPasswordResponse", z.object({})) } },
    },
    ...errorResponses([400, 429]),
  },
});

registry.registerPath({
  method: "post",
  path: "/auth/reset-password",
  operationId: "resetPassword",
  tags: ["Auth"],
  summary: "Đặt lại mật khẩu bằng token",
  request: { body: { content: { "application/json": { schema: resetPasswordSchema } } } },
  responses: {
    200: {
      description: "Đặt lại mật khẩu thành công",
      content: { "application/json": { schema: apiResponse("ResetPasswordResponse", z.object({})) } },
    },
    ...errorResponses([400, 401, 429]),
  },
});

registry.registerPath({
  method: "get",
  path: "/auth/me",
  operationId: "getCurrentUser",
  tags: ["Auth"],
  summary: "Hồ sơ người dùng hiện tại",
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: "Hồ sơ hiện tại",
      content: { "application/json": { schema: apiResponse("GetMeResponse", AuthUserDtoSchema) } },
    },
    ...errorResponses([401]),
  },
});
