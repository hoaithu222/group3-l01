import { readFileSync } from "fs";
import { env } from "../../core/config";
import { logger } from "../logger";
import { getFirebaseApp, isFirebaseConfigured } from "../firebase/firebase-app";
import { FirebasePushSender } from "./firebase-push.sender";
import { NoopPushSender } from "./noop-push.sender";
import { ApnsVoipPushSender } from "./apns-voip.sender";
import { NoopVoipSender } from "./noop-voip.sender";
import type { IPushSender, IVoipSender } from "./push.types";

let cachedPush: IPushSender | undefined;

/**
 * Factory — memoized. Thiếu credentials (hoặc `FIREBASE_CREDENTIALS_JSON` trỏ
 * tới file không tồn tại/không parse được) → `NoopPushSender`, log cảnh báo
 * một lần, không chặn khởi động (D-15). App Firebase dùng chung với xác thực
 * ID token (`infrastructure/firebase`).
 */
export function getPushSender(): IPushSender {
  if (cachedPush) return cachedPush;
  const app = getFirebaseApp();
  cachedPush = app ? new FirebasePushSender(app) : new NoopPushSender();
  return cachedPush;
}

/** `true` khi có đủ credentials FIREBASE_* thật (không phải Noop) — dùng bởi `admin-push` để trả `PUSH_001` sớm. */
export function isPushConfigured(): boolean {
  return isFirebaseConfigured();
}

interface ApnsCreds {
  keyId: string;
  teamId: string;
  privateKey: string;
}

function loadApnsCredentials(): ApnsCreds | null {
  if (!env.APNS_KEY_ID || !env.APNS_TEAM_ID) return null;
  const raw = env.APNS_KEY_P8 ?? (env.APNS_KEY_PATH ? tryReadKeyFile(env.APNS_KEY_PATH) : undefined);
  if (!raw) return null;
  return { keyId: env.APNS_KEY_ID, teamId: env.APNS_TEAM_ID, privateKey: raw.replace(/\\n/g, "\n") };
}

function tryReadKeyFile(path: string): string | undefined {
  try {
    return readFileSync(path, "utf-8");
  } catch (err) {
    logger.error("[push] Không đọc được APNS_KEY_PATH — chuyển NoopVoipSender", {
      err: (err as Error).message,
    });
    return undefined;
  }
}

let cachedVoip: IVoipSender | undefined;

/** Factory — memoized. Thiếu `APNS_KEY_ID`/`APNS_TEAM_ID`/(`APNS_KEY_P8`|`APNS_KEY_PATH`) → `NoopVoipSender`. */
export function getVoipSender(): IVoipSender {
  if (cachedVoip) return cachedVoip;
  const creds = loadApnsCredentials();
  cachedVoip = creds ? new ApnsVoipPushSender(creds) : new NoopVoipSender();
  return cachedVoip;
}

/** `true` khi có đủ credentials APNS_* thật (không phải Noop). */
export function isVoipConfigured(): boolean {
  return loadApnsCredentials() !== null;
}

/** Chỉ dùng trong test — xoá cache để đổi env giữa các case (giống pattern `push.factory.test.ts` hiện có). */
export function resetPushFactoryCache(): void {
  cachedPush = undefined;
  cachedVoip = undefined;
}
