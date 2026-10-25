import { setLiveKitEnv, TEST_LIVEKIT, decodeJwtPayload } from "./livekit-test-utils";

// env phải có TRƯỚC khi `core/config` nạp lần đầu (import bên dưới chạy theo thứ tự nguồn).
setLiveKitEnv();

import { TokenVerifier } from "livekit-server-sdk";
import { runtimeConfig } from "../../../core/config/runtime-config";
import { LIMITS } from "../../../core/constants/limits";
import { issueMediaToken, publishSourcesOf, MEDIA_TOKEN_TTL_MAX_SECONDS, MEDIA_TOKEN_TTL_MIN_SECONDS } from "../livekit.token";
import { roomNames } from "../room-names";

jest.mock("../../../core/config/runtime-config", () => ({
  runtimeConfig: { getEffective: jest.fn() },
}));

const getEffective = runtimeConfig.getEffective as jest.Mock;
const ROOM = roomNames.call("66f1a2b3c4d5e6f708192a3b");
const USER = "66f1a2b3c4d5e6f708192a3c";
const base = { userId: USER, displayName: "Nguyễn Văn A", room: ROOM, publish: { audio: true, video: true, screen: false } };

beforeEach(() => {
  getEffective.mockResolvedValue({ tokenTtlSeconds: LIMITS.call.tokenTtlSeconds });
});

describe("issueMediaToken", () => {
  it("MED-01: token gắn đúng identity/room/tên, trả URL công khai — không dùng URL nội bộ", async () => {
    const r = await issueMediaToken(base);
    const claims = decodeJwtPayload(r.token);
    expect(r.url).toBe(TEST_LIVEKIT.publicUrl);
    expect(r.room).toBe(ROOM);
    expect(r.identity).toBe(USER);
    expect(claims.sub).toBe(USER);
    expect(claims.iss).toBe(TEST_LIVEKIT.apiKey);
    expect(claims.name).toBe("Nguyễn Văn A");
    expect(claims.video).toMatchObject({ roomJoin: true, room: ROOM });
    // Token của phòng A KHÔNG khớp phòng B — LiveKit chỉ cho vào đúng `video.room`.
    expect(claims.video?.room).not.toBe(roomNames.call("66f1a2b3c4d5e6f708192a3d"));
    await expect(new TokenVerifier(TEST_LIVEKIT.apiKey, TEST_LIVEKIT.apiSecret).verify(r.token)).resolves.toBeDefined();
  });

  it("MED-03: grants client KHÔNG có roomAdmin/roomCreate/roomRecord/roomList/hidden/recorder/ingressAdmin", async () => {
    const claims = decodeJwtPayload((await issueMediaToken({ ...base, publish: { audio: true, video: true, screen: true } })).token);
    const video = claims.video ?? {};
    for (const forbidden of ["roomAdmin", "roomCreate", "roomRecord", "roomList", "hidden", "recorder", "ingressAdmin", "agent"]) {
      expect(video[forbidden]).toBeUndefined();
    }
    expect(Object.keys(video).sort()).toEqual(
      ["canPublish", "canPublishData", "canPublishSources", "canSubscribe", "canUpdateOwnMetadata", "room", "roomJoin"].sort()
    );
    expect(video.canUpdateOwnMetadata).toBe(true);
  });

  it("canPublishSources theo publish (mic / camera / màn hình + âm thanh màn hình)", async () => {
    const sources = async (publish: { audio: boolean; video: boolean; screen: boolean }) =>
      decodeJwtPayload((await issueMediaToken({ ...base, publish })).token).video?.canPublishSources;
    expect(await sources({ audio: true, video: false, screen: false })).toEqual(["microphone"]);
    expect(await sources({ audio: false, video: true, screen: false })).toEqual(["camera"]);
    expect(await sources({ audio: true, video: true, screen: true })).toEqual([
      "microphone",
      "camera",
      "screen_share",
      "screen_share_audio",
    ]);
  });

  it("không quyền publish → canPublish=false tường minh (không rơi về mặc định LiveKit 'cả hai bật')", async () => {
    const video = decodeJwtPayload((await issueMediaToken({ ...base, publish: { audio: false, video: false, screen: false } })).token).video;
    expect(video?.canPublish).toBe(false);
    expect(video?.canSubscribe).toBe(true);
    expect(video?.canPublishSources ?? []).toEqual([]);
  });

  it("subscribe=false / data=false được tôn trọng", async () => {
    const video = decodeJwtPayload(
      (await issueMediaToken({ ...base, subscribe: false, publish: { audio: true, video: false, screen: false, data: false } })).token
    ).video;
    expect(video?.canSubscribe).toBe(false);
    expect(video?.canPublishData).toBe(false);
  });

  it("metadata = { v:1, ...metadata } và `v` không bị ghi đè", async () => {
    const claims = decodeJwtPayload((await issueMediaToken({ ...base, metadata: { role: "HOST", callId: "c1", v: 99 } })).token);
    expect(JSON.parse(claims.metadata as string)).toEqual({ v: 1, role: "HOST", callId: "c1" });
  });

  it("TTL mặc định = limits.call.tokenTtlSeconds (runtime) — 600 s theo README, exp − nbf khớp", async () => {
    getEffective.mockResolvedValue({ tokenTtlSeconds: 600 });
    const r = await issueMediaToken(base);
    const claims = decodeJwtPayload(r.token) as { exp: number; nbf: number };
    expect(claims.exp - claims.nbf).toBe(600);
    expect(new Date(r.expiresAt).getTime() - Date.now()).toBeGreaterThan(590_000);
    expect(new Date(r.expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(600_000);
    expect(LIMITS.call.tokenTtlSeconds).toBe(600);
  });

  it("ttlSeconds tường minh; kẹp trong [30, 3600]", async () => {
    const ttlOf = async (ttlSeconds: number) => {
      const c = decodeJwtPayload((await issueMediaToken({ ...base, ttlSeconds })).token) as { exp: number; nbf: number };
      return c.exp - c.nbf;
    };
    expect(await ttlOf(120)).toBe(120);
    expect(await ttlOf(1)).toBe(MEDIA_TOKEN_TTL_MIN_SECONDS);
    expect(await ttlOf(999_999)).toBe(MEDIA_TOKEN_TTL_MAX_SECONDS);
  });

  it("MED-02: token hết hạn (quá TTL) bị từ chối — client phải xin token mới", async () => {
    const { token } = await issueMediaToken({ ...base, ttlSeconds: 30 });
    const verifier = new TokenVerifier(TEST_LIVEKIT.apiKey, TEST_LIVEKIT.apiSecret);
    await expect(verifier.verify(token)).resolves.toBeDefined();

    jest.useFakeTimers({
      now: Date.now() + 5 * 60_000,
      doNotFake: ["nextTick", "setImmediate", "setTimeout", "setInterval", "clearTimeout", "clearInterval", "clearImmediate", "queueMicrotask", "hrtime", "performance"],
    });
    try {
      await expect(verifier.verify(token)).rejects.toThrow(/exp|expired/i);
    } finally {
      jest.useRealTimers();
    }
  });

  it("token ký bằng secret khác bị từ chối", async () => {
    const { token } = await issueMediaToken(base);
    await expect(new TokenVerifier(TEST_LIVEKIT.apiKey, "another-secret-another-secret-123456").verify(token)).rejects.toThrow();
  });

  it("từ chối room không thuộc call_/meet_/spike_ và userId rỗng (lỗi lập trình, không cấp token)", async () => {
    await expect(issueMediaToken({ ...base, room: "admin" })).rejects.toThrow(/tên phòng/);
    await expect(issueMediaToken({ ...base, userId: "" })).rejects.toThrow(/userId/);
    await expect(issueMediaToken({ ...base, room: "" })).rejects.toThrow(/room/);
  });

  it("thiếu tên hiển thị → dùng userId làm name", async () => {
    const claims = decodeJwtPayload((await issueMediaToken({ ...base, displayName: "" })).token);
    expect(claims.name).toBe(USER);
  });
});

describe("publishSourcesOf", () => {
  it("ánh xạ cố định", () => {
    expect(publishSourcesOf({ audio: false, video: false, screen: false })).toEqual([]);
    expect(publishSourcesOf({ audio: true, video: false, screen: true })).toEqual(["MICROPHONE", "SCREEN_SHARE", "SCREEN_SHARE_AUDIO"]);
  });
});

describe("issueMediaToken khi cấu hình thiếu", () => {
  /** Nạp lại module với env khác (config parse env lúc import) rồi trả hàm đã gắn với env đó. */
  function loadIssue(env: Record<string, string | undefined>): typeof issueMediaToken {
    let issue!: typeof issueMediaToken;
    jest.isolateModules(() => {
      setLiveKitEnv(env);
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      issue = (require("../livekit.token") as typeof import("../livekit.token")).issueMediaToken;
    });
    return issue;
  }

  afterEach(() => {
    process.env.NODE_ENV = "test";
    setLiveKitEnv();
  });

  it("thiếu LIVEKIT_API_SECRET → MEDIA_001 (503), không cấp token", async () => {
    const issue = loadIssue({ LIVEKIT_API_SECRET: undefined });
    await expect(issue(base)).rejects.toMatchObject({ errorCode: "MEDIA_001", statusCode: 503 });
  });

  it("production thiếu LIVEKIT_PUBLIC_URL → MEDIA_001 (không trả URL nội bộ cho client)", async () => {
    const issue = loadIssue({
      LIVEKIT_PUBLIC_URL: undefined,
      NODE_ENV: "production",
      JWT_SECRET: "x".repeat(40),
      JWT_REFRESH_SECRET: "y".repeat(40),
      DATABASE_URL: "mongodb://localhost/x",
      ENCRYPTION_KEY: "a".repeat(64),
      ALLOWED_ORIGINS: "https://a.example",
    });
    await expect(issue(base)).rejects.toMatchObject({ errorCode: "MEDIA_001", details: { reason: "public-url" } });
  });

  it("dev thiếu LIVEKIT_PUBLIC_URL → suy từ LIVEKIT_URL (http→ws)", async () => {
    const issue = loadIssue({ LIVEKIT_PUBLIC_URL: undefined });
    await expect(issue(base)).resolves.toMatchObject({ url: "ws://livekit.test:7880" });
  });
});
