import { readFileSync } from "fs";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { env } from "../../core/config";
import { logger } from "../logger";

const APP_NAME = "firebase";

interface ServiceAccountCreds {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

/**
 * Đọc service-account từ env — `FIREBASE_CREDENTIALS_JSON` (đường dẫn HOẶC nội dung JSON) ưu tiên hơn ba khoá
 * `FIREBASE_PROJECT_ID`/`CLIENT_EMAIL`/`PRIVATE_KEY`. Không đọc/parse được ⇒ `null` (log lỗi, không ném).
 */
function loadCredentials(): ServiceAccountCreds | null {
  if (env.FIREBASE_CREDENTIALS_JSON) {
    try {
      const trimmed = env.FIREBASE_CREDENTIALS_JSON.trim();
      const raw = trimmed.startsWith("{") ? trimmed : readFileSync(trimmed, "utf-8");
      const json = JSON.parse(raw) as {
        project_id: string;
        client_email: string;
        private_key: string;
      };
      return { projectId: json.project_id, clientEmail: json.client_email, privateKey: json.private_key };
    } catch (err) {
      logger.error("[firebase] FIREBASE_CREDENTIALS_JSON không hợp lệ — coi như chưa cấu hình", {
        err: (err as Error).message,
      });
      return null;
    }
  }
  if (env.FIREBASE_PROJECT_ID && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY) {
    return {
      projectId: env.FIREBASE_PROJECT_ID,
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    };
  }
  return null;
}

/** `true` khi có đủ credentials Firebase thật — dùng bởi `admin-push` để trả `PUSH_001` sớm. */
export function isFirebaseConfigured(): boolean {
  return loadCredentials() !== null;
}

/**
 * Một `firebase-admin` App dùng chung cho FCM (`infrastructure/push`) và xác thực ID token
 * (`firebase-identity.verifier`) — idempotent (`getApps`). `null` khi chưa cấu hình credentials.
 */
export function getFirebaseApp(): App | null {
  const existing = getApps().find((a) => a.name === APP_NAME);
  if (existing) return existing;
  const creds = loadCredentials();
  return creds ? initializeApp({ credential: cert(creds) }, APP_NAME) : null;
}
