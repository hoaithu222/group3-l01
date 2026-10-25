import { FEATURE_FLAGS, MODULES } from "../../core/constants/modules";
import { runtimeConfig } from "../../core/config/runtime-config";
import { getLiveKit } from "./livekit.client";
import type { IMediaServer } from "./media.types";

export type LiveKitHealth = "ok" | "degraded" | "down" | "disabled";

export interface LiveKitHealthReport {
  status: LiveKitHealth;
  /** `null` khi `disabled`/`down`. */
  latencyMs: number | null;
  /** `true` chỉ khi `down` VÀ cờ `voice`/`meeting` đang bật → `/api/health` trả 503 (be.md §5.5, MED-09). */
  fatal: boolean;
}

export const LIVEKIT_HEALTH_TIMEOUT_MS = 2000;
export const LIVEKIT_HEALTH_OK_UNDER_MS = 500;
/** `/api/health` được LB/Docker gọi liên tục — ghi nhớ kết quả ping ngắn để không dội LiveKit. */
const CACHE_MS = 5000;

let cache: { at: number; status: LiveKitHealth; latencyMs: number | null } | null = null;

/** Test: xoá bộ nhớ đệm kết quả ping. */
export function resetLiveKitHealthCache(): void {
  cache = null;
}

async function probe(server: IMediaServer): Promise<{ status: LiveKitHealth; latencyMs: number | null }> {
  if (!server.isConfigured()) return { status: "disabled", latencyMs: null };
  try {
    const { latencyMs } = await server.ping(LIVEKIT_HEALTH_TIMEOUT_MS);
    return { status: latencyMs < LIVEKIT_HEALTH_OK_UNDER_MS ? "ok" : "degraded", latencyMs };
  } catch {
    return { status: "down", latencyMs: null };
  }
}

/** Có phân hệ nào cần media đang bật (runtime ⊕ env)? Lỗi đọc cấu hình → rơi về cờ env (không làm health đỏ oan). */
export async function isMediaRequired(): Promise<boolean> {
  try {
    const [voice, meeting] = await Promise.all([
      runtimeConfig.isFeatureEnabled(MODULES.VOICE),
      runtimeConfig.isFeatureEnabled(MODULES.MEETING),
    ]);
    return voice || meeting;
  } catch {
    return FEATURE_FLAGS[MODULES.VOICE] || FEATURE_FLAGS[MODULES.MEETING];
  }
}

/**
 * `services.livekit` cho `/api/health`: `disabled` (chưa cấu hình) · `ok` (< 500 ms) · `degraded` (chậm) ·
 * `down` (lỗi/quá 2 s). Chỉ `fatal` khi `down` mà voice/meeting bật.
 */
export async function checkLiveKit(server: IMediaServer = getLiveKit()): Promise<LiveKitHealthReport> {
  const now = Date.now();
  if (!cache || now - cache.at >= CACHE_MS) {
    cache = { at: now, ...(await probe(server)) };
  }
  const { status, latencyMs } = cache;
  const fatal = status === "down" && (await isMediaRequired());
  return { status, latencyMs, fatal };
}
