import type { IncomingHttpHeaders } from "node:http";
import type { WebhookProvider } from "@prisma/client";

/**
 * Registry handler webhook theo NHÀ CUNG CẤP (p5-03) — cùng kiểu `registerLiveKitHandler`: route raw body `POST /webhooks/:provider` (module
 * `webhooks`, p0-08) KHÔNG import module nghiệp vụ; module sở hữu (`integrations`) đăng ký handler lúc boot API (`registerIntegrationsModule()`).
 * Handler tự xác thực chữ ký trên RAW body, ghi `WebhookEvent`, xếp job — ném `AppError` (401 `INT_007` chữ ký sai) hoặc trả kết quả.
 */
export interface ProviderWebhookRequest {
  /** Đúng chuỗi byte nhà cung cấp gửi (chữ ký tính trên đây, không phải `JSON.stringify(req.body)`). */
  rawBody: Buffer;
  headers: IncomingHttpHeaders;
}

export interface ProviderWebhookResult {
  /** `true` khi `(provider, eventId)` đã có (gửi lặp) — không xử lý lại. */
  duplicate: boolean;
  /** `IGNORED` = đã ghi nhận nhưng không xử lý (provider tắt / không khớp kết nối / loại sự kiện không theo dõi). */
  status: "ACCEPTED" | "IGNORED";
}

export interface ProviderWebhookHandler {
  receive(req: ProviderWebhookRequest): Promise<ProviderWebhookResult>;
}

/** Đoạn URL `/webhooks/:provider` → enum Prisma. LiveKit có route riêng (`/webhooks/livekit`) nên KHÔNG nằm ở đây. */
export const PROVIDER_WEBHOOK_PATHS: Readonly<Record<string, WebhookProvider>> = {
  github: "GITHUB",
  gitlab: "GITLAB",
  google: "GOOGLE",
  figma: "FIGMA",
};

const handlers = new Map<WebhookProvider, ProviderWebhookHandler>();

/** Đăng ký (thay thế nếu đã có) — gọi lặp/hot-reload không nhân đôi. */
export function registerProviderWebhookHandler(provider: WebhookProvider, handler: ProviderWebhookHandler): void {
  handlers.set(provider, handler);
}

export function getProviderWebhookHandler(provider: WebhookProvider): ProviderWebhookHandler | undefined {
  return handlers.get(provider);
}

/** Chỉ dùng trong test. */
export function clearProviderWebhookHandlers(): void {
  handlers.clear();
}
