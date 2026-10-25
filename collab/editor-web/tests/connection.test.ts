import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import type { EditorErrorCode, NoticeCode } from "../src/bridge-protocol";
import { ConnectionManager, type ConnectionOptions, type ConnectionSnapshot } from "../src/connection";
import { createFakeSessionFactory } from "./helpers/fake-session";
import { DOC_ID, fakeJwt, USER } from "./helpers/fixtures";

interface Harness {
  mgr: ConnectionManager;
  session: ReturnType<typeof createFakeSessionFactory>["last"];
  snaps: ConnectionSnapshot[];
  tokenRequests: Array<{ reason: string; attempt: number }>;
  errors: Array<{ code: EditorErrorCode; fatal: boolean; detail?: string | undefined }>;
  notices: NoticeCode[];
  presence: { count: number };
  snap(): ConnectionSnapshot;
}

function setup(overrides: Partial<ConnectionOptions> = {}): Harness {
  const fake = createFakeSessionFactory();
  const snaps: ConnectionSnapshot[] = [];
  const tokenRequests: Harness["tokenRequests"] = [];
  const errors: Harness["errors"] = [];
  const notices: NoticeCode[] = [];
  const presence = { count: 0 };
  const mgr = new ConnectionManager({
    createSession: fake.factory,
    url: "wss://x.example/collab",
    documentName: `doc:${DOC_ID}`,
    doc: new Y.Doc(),
    user: { ...USER },
    token: fakeJwt(),
    random: () => 0,
    host: {
      requestToken: (reason, attempt) => tokenRequests.push({ reason, attempt }),
      error: (code, fatal, _message, detail) => errors.push({ code, fatal, detail }),
      notice: (code) => notices.push(code),
      onChange: (s) => snaps.push(s),
      onPresence: () => void (presence.count += 1),
    },
    ...overrides,
  });
  return { mgr, session: fake.last, snaps, tokenRequests, errors, notices, presence, snap: () => snaps.at(-1) as ConnectionSnapshot };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-26T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("kết nối bình thường", () => {
  it("connecting → synced khi server chấp nhận và đồng bộ xong", () => {
    const h = setup();
    h.mgr.connect();
    expect(h.session.connectCalls).toBe(1);
    expect(h.snap()).toMatchObject({ connection: "connecting", everSynced: false });
    h.session.open();
    expect(h.snap()).toMatchObject({ connection: "synced", everSynced: true, serverReadOnly: false });
  });

  it("scope readonly → serverReadOnly; read-write → không", () => {
    const h = setup();
    h.mgr.connect();
    h.session.open("readonly");
    expect(h.snap().serverReadOnly).toBe(true);
  });

  it("mất mạng khi đã đồng bộ → offline (giữ everSynced); nối lại → synced; unsynced theo provider", () => {
    const h = setup();
    h.mgr.connect();
    h.session.open();
    h.session.unsynced(2);
    expect(h.snap().unsynced).toBe(true);
    h.session.dropNetwork();
    expect(h.snap()).toMatchObject({ connection: "offline", everSynced: true, unsynced: true });
    expect(h.errors).toEqual([]); // 1006 là lỗi mạng thường: provider tự nối lại, không báo lỗi
    expect(h.session.disconnectCalls).toBe(0);
    h.session.connect();
    h.session.open();
    h.session.unsynced(0);
    expect(h.snap()).toMatchObject({ connection: "synced", unsynced: false });
  });

  it("awareness đổi → báo presence", () => {
    const h = setup();
    h.session.handlers.onAwarenessChange();
    expect(h.presence.count).toBe(1);
  });
});

describe("unauthorized (token hết hạn/bị từ chối)", () => {
  it("dừng nối ngay, xin token MỘT lần dù lệnh đóng tới hai lần, có token mới thì nối lại", () => {
    const h = setup();
    h.mgr.connect();
    h.session.denyAuth("unauthorized"); // authenticationFailed + đóng thô 4401
    expect(h.session.disconnectCalls).toBe(1);
    expect(h.tokenRequests).toEqual([{ reason: "unauthorized", attempt: 1 }]);
    expect(h.snap().connection).toBe("connecting");

    vi.advanceTimersByTime(60_000);
    expect(h.session.connectCalls).toBe(1); // không tự nối lại bằng token cũ
    h.mgr.setToken(fakeJwt());
    expect(h.session.connectCalls).toBe(2);
    h.session.open();
    expect(h.snap().connection).toBe("synced");
  });

  it("xác thực lại thành công thì đếm lại từ đầu", () => {
    const h = setup();
    h.mgr.connect();
    h.session.denyAuth("unauthorized");
    h.mgr.setToken(fakeJwt());
    h.session.open();
    h.session.kick("revoked");
    h.session.connect();
    h.session.denyAuth("unauthorized");
    expect(h.tokenRequests.map((r) => r.attempt)).toEqual([1, 1]);
  });

  it("quá 2 lần liên tiếp → AUTH_EXPIRED (không nghiêm trọng, không xin nữa); setToken sau đó vẫn thử nối", () => {
    const h = setup();
    h.mgr.connect();
    for (let i = 0; i < 3; i += 1) {
      h.session.denyAuth("unauthorized");
      h.mgr.setToken(fakeJwt());
    }
    expect(h.tokenRequests.map((r) => r.attempt)).toEqual([1, 2]);
    expect(h.errors).toEqual([{ code: "AUTH_EXPIRED", fatal: false, detail: "unauthorized" }]);
    const connects = h.session.connectCalls;
    h.mgr.setToken(fakeJwt());
    expect(h.session.connectCalls).toBe(connects); // không đang chờ token → không nối
    h.session.denyAuth("unauthorized"); // lần sau lại bị từ chối: báo AUTH_EXPIRED, KHÔNG xin thêm
    expect(h.tokenRequests).toHaveLength(2);
    expect(h.errors).toHaveLength(2);
    h.mgr.setToken(fakeJwt());
    expect(h.session.connectCalls).toBe(connects + 1);
  });

  it("app không đáp sau requestToken → báo AUTH_EXPIRED sau khoảng chờ", () => {
    const h = setup({ tokenReplyTimeoutMs: 5_000 });
    h.mgr.connect();
    h.session.denyAuth("unauthorized");
    vi.advanceTimersByTime(4_999);
    expect(h.errors).toEqual([]);
    vi.advanceTimersByTime(2);
    expect(h.errors).toEqual([{ code: "AUTH_EXPIRED", fatal: false, detail: "no-token-reply" }]);
  });

  it("chỉ có mã 4401 (không reason) cũng xử lý như unauthorized", () => {
    const h = setup();
    h.mgr.connect();
    h.session.handlers.onClose({ code: 4401, reason: "" });
    expect(h.tokenRequests).toHaveLength(1);
  });
});

describe("dừng hẳn: forbidden / not-found (không được nối lại)", () => {
  it.each([
    ["forbidden", "FORBIDDEN"],
    ["not-found", "NOT_FOUND"],
  ] as const)("%s", (reason, code) => {
    const h = setup();
    h.mgr.connect();
    h.session.denyAuth(reason);
    expect(h.session.disconnectCalls).toBeGreaterThanOrEqual(1);
    expect(h.errors).toEqual([{ code, fatal: true, detail: reason }]);
    expect(h.snap().connection).toBe("closed");
    vi.advanceTimersByTime(120_000);
    expect(h.session.connectCalls).toBe(1);
  });

  it("thu hồi giữa phiên: revoked (nối lại để xác thực) rồi forbidden → dừng", () => {
    const h = setup();
    h.mgr.connect();
    h.session.open();
    h.session.kick("revoked");
    expect(h.errors).toEqual([]);
    expect(h.session.disconnectCalls).toBe(0); // để provider tự nối lại
    expect(h.snap().connection).toBe("offline");
    h.session.connect();
    h.session.denyAuth("forbidden");
    expect(h.errors).toEqual([{ code: "FORBIDDEN", fatal: true, detail: "forbidden" }]);
    expect(h.snap().connection).toBe("closed");
  });

  it("tin CLOSE 'forbidden' trong luồng đang chạy cũng dừng, và chỉ báo MỘT lần", () => {
    const h = setup();
    h.mgr.connect();
    h.session.open();
    h.session.kick("forbidden");
    expect(h.errors).toHaveLength(1);
    expect(h.snap().connection).toBe("closed");
  });

  it("frame > 6 MiB (1009) → TOO_LARGE nghiêm trọng, không lặp nối lại", () => {
    const h = setup();
    h.mgr.connect();
    h.session.open();
    h.session.handlers.onClose({ code: 1009, reason: "" });
    expect(h.errors).toEqual([{ code: "TOO_LARGE", fatal: true, detail: "frame-too-large" }]);
    expect(h.snap().connection).toBe("closed");
  });

  it("awareness-invalid (4400) là lỗi phía client → dừng", () => {
    const h = setup();
    h.mgr.connect();
    h.session.open();
    h.session.kick("awareness-invalid");
    expect(h.errors).toEqual([{ code: "LOAD_FAILED", fatal: true, detail: "awareness-invalid" }]);
  });

  it("retry() sau khi dừng: xác thực lại từ đầu", () => {
    const h = setup();
    h.mgr.connect();
    h.session.denyAuth("forbidden");
    h.mgr.retry();
    expect(h.session.connectCalls).toBe(2);
    expect(h.snap().connection).toBe("connecting");
    h.session.open();
    expect(h.snap().connection).toBe("synced");
  });
});

describe("archived", () => {
  it("nối lại ở chế độ chỉ đọc, hiện lưu trữ; mở lại ghi được thì hết lưu trữ", () => {
    const h = setup();
    h.mgr.connect();
    h.session.open();
    h.session.kick("archived");
    expect(h.snap()).toMatchObject({ archived: true, serverReadOnly: true });
    h.session.connect();
    h.session.open("readonly");
    expect(h.snap()).toMatchObject({ archived: true, serverReadOnly: true, connection: "synced" });
    h.session.kick("revoked");
    h.session.connect();
    h.session.open("read-write");
    expect(h.snap()).toMatchObject({ archived: false, serverReadOnly: false });
  });
});

describe("backoff: unavailable / too-many-connections / rate-limited", () => {
  it.each(["unavailable", "too-many-connections", "rate-limited"])("%s: dừng nối tự động, nối lại sau 2 s, 4 s, 8 s…", (reason) => {
    const h = setup();
    h.mgr.connect();
    h.session.denyAuth(reason);
    expect(h.session.disconnectCalls).toBe(1);
    expect(h.session.connectCalls).toBe(1);
    vi.advanceTimersByTime(1_999);
    expect(h.session.connectCalls).toBe(1);
    vi.advanceTimersByTime(2);
    expect(h.session.connectCalls).toBe(2);

    h.session.denyAuth(reason);
    vi.advanceTimersByTime(3_999);
    expect(h.session.connectCalls).toBe(2);
    vi.advanceTimersByTime(2);
    expect(h.session.connectCalls).toBe(3);
    expect(h.errors).toEqual([]); // không phải lỗi người dùng cần biết
  });

  it("thành công thì backoff về 2 s", () => {
    const h = setup();
    h.mgr.connect();
    h.session.denyAuth("unavailable");
    vi.advanceTimersByTime(2_001);
    h.session.open();
    h.session.kick("unavailable");
    vi.advanceTimersByTime(2_001);
    expect(h.session.connectCalls).toBe(3);
  });

  it("không đặt hai hẹn giờ khi cùng một lần đóng tới hai lần", () => {
    const h = setup();
    h.mgr.connect();
    h.session.handlers.onAuthenticationFailed("unavailable");
    h.session.handlers.onClose({ code: 4503, reason: "unavailable" });
    vi.advanceTimersByTime(3_000);
    expect(h.session.connectCalls).toBe(2);
  });
});

describe("hàm token của provider", () => {
  it("token còn hạn → trả ngay, không xin", async () => {
    const h = setup();
    const token = fakeJwt();
    h.mgr.setToken(token);
    await expect(h.session.token()).resolves.toBe(token);
    expect(h.tokenRequests).toEqual([]);
  });

  it("token hết hạn → xin app MỘT lần (gộp nhiều lần gọi), chờ setToken rồi trả token mới", async () => {
    const h = setup({ token: fakeJwt({ exp: Math.floor(Date.now() / 1000) - 10 }) });
    const a = h.session.token();
    const b = h.session.token();
    expect(h.tokenRequests).toEqual([{ reason: "expired", attempt: 1 }]);
    const fresh = fakeJwt({ exp: Math.floor(Date.now() / 1000) + 300 });
    h.mgr.setToken(fresh);
    await expect(a).resolves.toBe(fresh);
    await expect(b).resolves.toBe(fresh);
    await expect(h.session.token()).resolves.toBe(fresh);
    expect(h.tokenRequests).toHaveLength(1);
  });

  it("app không đáp trong hạn chờ → dùng token cũ (server sẽ trả unauthorized, đi đường xin lại)", async () => {
    const stale = fakeJwt({ exp: Math.floor(Date.now() / 1000) - 10 });
    const h = setup({ token: stale, tokenWaitMs: 6_000 });
    const pending = h.session.token();
    vi.advanceTimersByTime(6_001);
    await expect(pending).resolves.toBe(stale);
    // hạn chờ phải NHỎ hơn 10 s auth-timeout của server
    expect(6_000).toBeLessThan(10_000);
  });

  it("dùng `expiresAt` do app gửi khi có (ưu tiên hơn `exp` trong JWT), trừ độ lệch 5 s", async () => {
    const h = setup({ token: fakeJwt({ exp: 4_000_000_000 }), tokenExpiresAt: Date.now() + 3_000 });
    void h.session.token();
    expect(h.tokenRequests).toHaveLength(1);
  });

  it("token không phải JWT và không có expiresAt → coi như còn hạn", async () => {
    const h = setup({ token: "opaque" });
    await expect(h.session.token()).resolves.toBe("opaque");
    expect(h.tokenRequests).toEqual([]);
  });
});

describe("thông báo từ server (stateless)", () => {
  it("SAVE_FAILED → SAVE_RECOVERED", () => {
    const h = setup();
    h.mgr.connect();
    h.session.open();
    h.session.notice("SAVE_FAILED");
    expect(h.snap().saveFailed).toBe(true);
    h.session.notice("SAVE_RECOVERED");
    expect(h.snap().saveFailed).toBe(false);
    expect(h.notices).toEqual(["SAVE_FAILED", "SAVE_RECOVERED"]);
  });

  it("TOO_LARGE → báo lỗi không nghiêm trọng + cờ; SAVE_RECOVERED gỡ cờ", () => {
    const h = setup();
    h.mgr.connect();
    h.session.open();
    h.session.notice("TOO_LARGE");
    expect(h.snap().serverTooLarge).toBe(true);
    expect(h.errors).toEqual([{ code: "TOO_LARGE", fatal: false, detail: "server-notice" }]);
    h.session.notice("SAVE_RECOVERED");
    expect(h.snap().serverTooLarge).toBe(false);
  });

  it("ARCHIVED và READ_ONLY → chỉ đọc ngay", () => {
    const h = setup();
    h.mgr.connect();
    h.session.open();
    h.session.notice("READ_ONLY");
    expect(h.snap()).toMatchObject({ serverReadOnly: true, archived: false });
    const h2 = setup();
    h2.mgr.connect();
    h2.session.open();
    h2.session.notice("ARCHIVED");
    expect(h2.snap()).toMatchObject({ serverReadOnly: true, archived: true });
  });

  it("RESTORED chuyển tiếp; payload lạ/hỏng/mã chưa biết bị bỏ qua", () => {
    const h = setup();
    h.mgr.connect();
    h.session.open();
    h.session.notice("RESTORED");
    h.session.notice("NEW_FUTURE_CODE");
    h.session.handlers.onStateless("{không phải json");
    h.session.handlers.onStateless(JSON.stringify({ v: 2, type: "notice", code: "SAVE_FAILED" }));
    h.session.handlers.onStateless("x".repeat(5_000));
    expect(h.notices).toEqual(["RESTORED"]);
  });
});

describe("hết thời gian tải lần đầu", () => {
  it("báo LOAD_FAILED không nghiêm trọng, hiện offline; đồng bộ được thì trở lại synced", () => {
    const h = setup({ initialSyncTimeoutMs: 20_000 });
    h.mgr.connect();
    vi.advanceTimersByTime(19_999);
    expect(h.errors).toEqual([]);
    vi.advanceTimersByTime(2);
    expect(h.errors).toEqual([{ code: "LOAD_FAILED", fatal: false, detail: "initial-sync-timeout" }]);
    expect(h.snap().connection).toBe("offline");
    h.session.open();
    expect(h.snap().connection).toBe("synced");
  });

  it("đã đồng bộ thì không báo", () => {
    const h = setup({ initialSyncTimeoutMs: 1_000 });
    h.mgr.connect();
    h.session.open();
    vi.advanceTimersByTime(5_000);
    expect(h.errors).toEqual([]);
  });
});

describe("retry / halt / destroy", () => {
  it("retry khi socket còn mở: đóng trước rồi mới nối (socket.connect() không có tác dụng khi chưa đóng)", () => {
    const h = setup();
    h.mgr.connect();
    h.session.open();
    h.session.holdClose = true;
    h.mgr.retry();
    expect(h.session.disconnectCalls).toBe(1);
    expect(h.session.connectCalls).toBe(1);
    h.session.flushClose();
    expect(h.session.connectCalls).toBe(2);
  });

  it("halt: dừng không báo lỗi (controller tự báo)", () => {
    const h = setup();
    h.mgr.connect();
    h.session.open();
    h.mgr.halt();
    expect(h.snap().connection).toBe("closed");
    expect(h.errors).toEqual([]);
    expect(h.session.disconnectCalls).toBe(1);
  });

  it("destroy: huỷ phiên, nhả các lời gọi token đang chờ, không phát sự kiện nữa", async () => {
    const h = setup({ token: fakeJwt({ exp: Math.floor(Date.now() / 1000) - 10 }) });
    const pending = h.session.token();
    const before = h.snaps.length;
    h.mgr.destroy();
    await expect(pending).resolves.toEqual(expect.any(String));
    expect(h.session.destroyed).toBe(true);
    h.session.denyAuth("forbidden");
    expect(h.errors).toEqual([]);
    expect(h.snaps).toHaveLength(before);
    vi.advanceTimersByTime(60_000);
    expect(h.session.connectCalls).toBe(0);
  });
});
