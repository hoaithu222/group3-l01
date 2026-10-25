import { env } from "./env.schema";
import { FEATURE_FLAGS, UNKNOWN_FLAGS, AVAILABLE_MODULES, AI_BLOCKED, MODULES } from "../constants/modules";
import { INTEGRATION_PROVIDER_LABELS } from "../constants/integration";
import { allIntegrationProviderEnvStatus } from "./integration-env";
import { isProductionDeployment } from "./deployment-env";

export interface RuntimeCheck {
  level: "error" | "warn";
  message: string;
}

/** `require.resolve` chỉ kiểm tra module có nạp được không — KHÔNG giữ lại instance. */
function isSharpAvailable(): boolean {
  try {
    require.resolve("sharp");
    return true;
  } catch {
    return false;
  }
}

/** Kiểm chéo cờ ↔ env ↔ mã đã có. Gọi một lần trong server.ts; error → thoát. */
export function validateRuntime(): RuntimeCheck[] {
  const out: RuntimeCheck[] = [];
  for (const k of UNKNOWN_FLAGS)
    out.push({ level: "warn", message: `FEATURE_FLAGS: khoá lạ "${k}" bị bỏ qua` });
  // B5 (p0-07 §5.3) — SỬA: cờ bật mà module chưa có mã (AVAILABLE_MODULES)
  // KHÔNG còn thoát tiến trình — chỉ cảnh báo + coi như tắt (capabilities trả
  // `available: false`). Chỉ nhóm AI (D-13, `AI_BLOCKED`) vẫn là LỖI cứng bất
  // kể available hay không — quyết định dự án, không phải thiếu mã.
  for (const [m, on] of Object.entries(FEATURE_FLAGS)) {
    if (!on) continue;
    if (AI_BLOCKED.has(m as never))
      out.push({
        level: "error",
        message: `Tính năng AI đang tạm dừng (D-13) — không bật ${m}`,
      });
    else if (!AVAILABLE_MODULES.includes(m as never))
      out.push({
        level: "warn",
        message: `Cờ "${m}" bật nhưng module chưa có mã — coi như tắt`,
      });
  }
  // p5-01 be.md §9 — live quiz dựng phiên từ bộ học (p4-01): bật `live-quiz` mà `study` tắt → lỗi khởi động (đọc nội dung bộ cần phân hệ study).
  if (FEATURE_FLAGS[MODULES.LIVE_QUIZ] && !FEATURE_FLAGS[MODULES.STUDY])
    out.push({
      level: "error",
      message: "live-quiz cần bật study (FEATURE_FLAGS=study=true,live-quiz=true)",
    });
  // p7-02 be.md §9 — thưởng xu đi theo `xp.awarded` của gamification (p4-03) và hồ sơ/quyền dùng chung: bật `coins` mà `gamification` tắt → lỗi khởi động.
  if (FEATURE_FLAGS[MODULES.COINS] && !FEATURE_FLAGS[MODULES.GAMIFICATION])
    out.push({
      level: "error",
      message: "coins cần bật gamification (FEATURE_FLAGS=gamification=true,coins=true)",
    });
  // p7-03 be.md §9 — burnout radar nằm chung màn/quyền quản trị với gamification (`gamification:view|update`): bật `burnout` mà `gamification` tắt → lỗi khởi động.
  if (FEATURE_FLAGS[MODULES.BURNOUT] && !FEATURE_FLAGS[MODULES.GAMIFICATION])
    out.push({
      level: "error",
      message: "burnout cần bật gamification (FEATURE_FLAGS=gamification=true,burnout=true)",
    });
  // p5-02 be.md §9 — phòng Pomodoro là lớp trạng thái trên `Call ROOM` (p2-03) nên cần media: bật `pomodoro` mà `voice` tắt → lỗi khởi động.
  if (FEATURE_FLAGS[MODULES.POMODORO] && !FEATURE_FLAGS[MODULES.VOICE])
    out.push({
      level: "error",
      message: "pomodoro cần bật voice (FEATURE_FLAGS=voice=true,pomodoro=true)",
    });
  // p6-01 be.md §9 — Real-time Docs cần service `collab/`: cờ `collab` bật mà thiếu COLLAB_URL/COLLAB_INTERNAL_URL/COLLAB_SHARED_SECRET → lỗi khởi động.
  // Chỉ nêu TÊN khoá thiếu, không in giá trị bí mật. Bí mật riêng cho collab (không dùng chung JWT_SECRET).
  if (FEATURE_FLAGS[MODULES.COLLAB]) {
    const missing = (["COLLAB_URL", "COLLAB_INTERNAL_URL", "COLLAB_SHARED_SECRET"] as const).filter((k) => !env[k]);
    if (missing.length > 0) out.push({ level: "error", message: `collab=true cần ${missing.join(", ")}` });
    if (env.COLLAB_SHARED_SECRET && env.COLLAB_SHARED_SECRET === env.JWT_SECRET)
      out.push({ level: "error", message: "COLLAB_SHARED_SECRET không được trùng JWT_SECRET (bí mật riêng cho service collab)" });
    if (env.NODE_ENV === "production" && env.COLLAB_URL && !/^(wss|https):\/\//.test(env.COLLAB_URL))
      out.push({ level: "warn", message: "COLLAB_URL nên là wss:// ở production (app di động chặn ws:// thuần)" });
  }
  if (
    (FEATURE_FLAGS[MODULES.VOICE] || FEATURE_FLAGS[MODULES.MEETING]) &&
    !(env.LIVEKIT_URL && env.LIVEKIT_API_KEY && env.LIVEKIT_API_SECRET)
  )
    out.push({
      level: "error",
      message: "voice/meeting cần LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET",
    });
  // p0-08 — URL CLIENT (`LIVEKIT_PUBLIC_URL`, `wss://lk.<domain>`) khác URL nội bộ `LIVEKIT_URL` (`http://livekit:7880`
  // client không với tới). Dev: thiếu thì suy từ LIVEKIT_URL (cảnh báo); production + voice/meeting bật: LỖI (README §7).
  const mediaOn = FEATURE_FLAGS[MODULES.VOICE] || FEATURE_FLAGS[MODULES.MEETING];
  if (env.LIVEKIT_URL && !env.LIVEKIT_PUBLIC_URL)
    out.push(
      env.NODE_ENV === "production" && mediaOn
        ? { level: "error", message: "voice/meeting ở production cần LIVEKIT_PUBLIC_URL (wss://… client kết nối được)" }
        : { level: "warn", message: "thiếu LIVEKIT_PUBLIC_URL — dùng LIVEKIT_URL đổi scheme (chỉ hợp lệ khi dev)" }
    );
  if (env.NODE_ENV === "production" && env.LIVEKIT_PUBLIC_URL && !env.LIVEKIT_PUBLIC_URL.startsWith("wss://"))
    out.push({ level: "warn", message: "LIVEKIT_PUBLIC_URL nên là wss:// ở production (app di động chặn ws:// thuần)" });
  if (env.NODE_ENV === "production" && env.MEDIA_SPIKE_ENABLED)
    out.push({ level: "error", message: "MEDIA_SPIKE_ENABLED=true bị cấm ở production (endpoint spike chỉ dev/staging)" });
  // p2-06 — ghi hình họp (LiveKit Egress) chỉ ghi lên S3 và BE đọc/ký/xoá tệp qua `storage` của CHÍNH bucket đó ⇒ cần STORAGE_TYPE=s3 + `EGRESS_S3_*` cùng bucket
  // với `AWS_S3_BUCKET`. Thiếu thì CHỈ cảnh báo: họp vẫn chạy, `capabilities.features.meetingRecording.available=false` và app ẩn nút ghi hình.
  if (FEATURE_FLAGS[MODULES.MEETING]) {
    const egressReady = !!(env.EGRESS_S3_BUCKET && env.EGRESS_S3_REGION && env.EGRESS_S3_ACCESS_KEY_ID && env.EGRESS_S3_SECRET_ACCESS_KEY);
    if (env.STORAGE_TYPE !== "s3")
      out.push({ level: "warn", message: "meeting=true nhưng STORAGE_TYPE≠s3 — ghi hình họp tắt (LiveKit Egress chỉ ghi lên S3)" });
    else if (!egressReady)
      out.push({ level: "warn", message: "meeting=true nhưng thiếu EGRESS_S3_BUCKET/REGION/ACCESS_KEY_ID/SECRET_ACCESS_KEY — ghi hình họp tắt" });
    else if (env.EGRESS_S3_BUCKET !== env.AWS_S3_BUCKET)
      out.push({ level: "warn", message: "EGRESS_S3_BUCKET khác AWS_S3_BUCKET — ghi hình họp tắt (BE cần đọc/ký/xoá tệp ghi hình qua storage của cùng bucket)" });
  }
  // p5-03 README §7 — tích hợp: bật `integration` mà nhà cung cấp thiếu bộ khoá env → CHỈ cảnh báo (provider `available=false`, nút kết nối ẩn),
  // KHÔNG chặn khởi động. Chỉ nêu TÊN khoá thiếu, không bao giờ in giá trị.
  if (FEATURE_FLAGS[MODULES.INTEGRATION]) {
    for (const s of allIntegrationProviderEnvStatus()) {
      if (s.configured) continue;
      out.push({
        level: "warn",
        message: `integration=true nhưng thiếu ${s.missing.join(", ")} — ${INTEGRATION_PROVIDER_LABELS[s.provider]} sẽ không khả dụng (available=false)`,
      });
    }
  }
  // p6-07 be.md §9 — portfolio dựng link chia sẻ/canonical/301 từ `PUBLIC_PORTFOLIO_BASE_URL`: bật `career` mà thiếu ⇒ LỖI ở production (link sai sẽ bị phát đi),
  // dev/staging chỉ cảnh báo (rơi về `<PUBLIC_API_URL>/p` — xem `portfolioBaseUrl()`).
  if (FEATURE_FLAGS[MODULES.CAREER] && !env.PUBLIC_PORTFOLIO_BASE_URL)
    out.push(
      env.NODE_ENV === "production"
        ? { level: "error", message: "career=true cần PUBLIC_PORTFOLIO_BASE_URL (vd https://superapp.vcijsc.com/p) — link portfolio công khai dựng từ đây" }
        : { level: "warn", message: "career=true nhưng thiếu PUBLIC_PORTFOLIO_BASE_URL — dùng <PUBLIC_API_URL>/p (chỉ hợp lệ khi dev)" }
    );
  const hasFirebaseCreds =
    !!env.FIREBASE_CREDENTIALS_JSON ||
    !!(env.FIREBASE_PROJECT_ID && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY);
  if (FEATURE_FLAGS[MODULES.PUSH] && !hasFirebaseCreds)
    // Cảnh báo, không lỗi — FirebasePushSender tự chuyển NoopPushSender (D-15).
    out.push({
      level: "warn",
      message:
        "push=true nhưng thiếu FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY (hoặc FIREBASE_CREDENTIALS_JSON) — push sẽ chạy no-op",
    });
  const hasApnsCreds = !!(env.APNS_KEY_ID && env.APNS_TEAM_ID && (env.APNS_KEY_P8 || env.APNS_KEY_PATH));
  if (FEATURE_FLAGS[MODULES.PUSH] && !hasApnsCreds)
    // Cảnh báo, không lỗi — ApnsVoipPushSender tự chuyển NoopVoipSender (p0-06).
    out.push({
      level: "warn",
      message: "VoIP push tắt — iOS không đổ chuông khi app bị tắt (thiếu APNS_KEY_ID/TEAM_ID/KEY_P8|KEY_PATH)",
    });
  if (env.NODE_ENV === "production" && env.STORAGE_TYPE === "local")
    out.push({
      level: "warn",
      message: "STORAGE_TYPE=local ở production — file không chia sẻ giữa replica",
    });
  // p0-05 — `sharp` là native dependency (libvips); thiếu binary không chặn
  // khởi động (asset-processor.ts tự bỏ qua thumbnail, asset vẫn READY) —
  // chỉ cảnh báo để vận hành biết trước, không phải lỗi.
  if (env.PROCESS_ROLE !== "api" && !isSharpAvailable())
    out.push({
      level: "warn",
      message: "sharp không khả dụng (thiếu libvips?) — worker sẽ bỏ qua tạo thumbnail ảnh",
    });
  // p0-03 §7 — nhiều instance realtime BẮT BUỘC Redis Adapter ở production, nếu
  // không presence/typing/emitToUsers chỉ tới được socket trên CÙNG instance.
  if (env.NODE_ENV === "production" && env.SOCKET_ADAPTER !== "redis")
    out.push({
      level: "error",
      message: "SOCKET_ADAPTER phải là \"redis\" ở production (nhiều instance realtime)",
    });
  // p0-11 — quan sát: Sentry chỉ CẢNH BÁO (DSN trống = ConsoleTracker, không chặn khởi động); `/metrics` đã tự chặn (401) khi thiếu token nên
  // thiếu `METRICS_TOKEN` cũng chỉ là cảnh báo (kế hoạch ghi "error" — hạ xuống để không làm sập API đang chạy khi chưa đặt biến); dev-tools bị CẤM ở production thật.
  if (env.SENTRY_DSN) {
    try {
      new URL(env.SENTRY_DSN);
    } catch {
      out.push({ level: "warn", message: "SENTRY_DSN không phải URL hợp lệ — Sentry sẽ không được bật" });
    }
  } else if (env.NODE_ENV === "production") {
    out.push({ level: "warn", message: "SENTRY_DSN trống ở production — lỗi 5xx/job chỉ ghi log, không có cảnh báo lỗi" });
  }
  if (env.NODE_ENV === "production" && env.METRICS_ENABLED && !env.METRICS_TOKEN)
    out.push({ level: "warn", message: "METRICS_TOKEN trống ở production — /metrics chỉ nhận localhost, Prometheus bên ngoài không scrape được" });
  if (env.DEV_TOOLS_ENABLED && isProductionDeployment())
    out.push({ level: "error", message: "DEV_TOOLS_ENABLED=true bị cấm ở production (endpoint kiểm thử Sentry chỉ dùng cho dev/staging — đặt SENTRY_ENVIRONMENT=staging)" });
  return out;
}
