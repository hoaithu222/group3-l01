import { env } from "./env.schema";

/**
 * Đây có phải môi trường production THẬT không? (p0-11) Staging cũng chạy `NODE_ENV=production` (image giống hệt prod) nên chỉ xét NODE_ENV là chưa đủ:
 * phải đặt thêm `SENTRY_ENVIRONMENT=staging` để phân biệt. Quên đặt → mặc định `SENTRY_ENVIRONMENT = NODE_ENV = "production"` → coi là production
 * (an toàn theo hướng chặn): endpoint dev-tools bị cấm và `validate-runtime` từ chối `DEV_TOOLS_ENABLED=true`.
 */
export function isProductionDeployment(): boolean {
  return env.NODE_ENV === "production" && env.SENTRY_ENVIRONMENT.trim().toLowerCase() === "production";
}
