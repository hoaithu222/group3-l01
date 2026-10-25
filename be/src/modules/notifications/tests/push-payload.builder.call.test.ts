/**
 * Unit — payload push cuộc gọi (p2-02 be.md §3/§5.1/§5.4, CL-39): khoá mới `callVersion`/`expiresAt`/`scopeKind`/`originDeviceId`, TTL =
 * `min(60 s, expiresAt − now)`, `apns-expiration` cho nhánh APNs, `callUuid` trên MỌI loại `call.*`, và `callUuid` không đổi so với UUID đã phát hành.
 */
import { callIdToUuid } from "../../../core/utils/call-uuid";
import { buildPushPayload, buildVoipPayload, callPreviewLevelOf, callPushTtlSeconds } from "../services/push-payload.builder";

const NOW = new Date("2026-09-26T09:00:00.000Z");
const iso = (secondsFromNow: number): string => new Date(NOW.getTime() + secondsFromNow * 1000).toISOString();
const CALL_ID = "507f1f77bcf86cd799439011";

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(NOW);
});
afterEach(() => {
  jest.useRealTimers();
});

describe("callIdToUuid — không đổi UUID đã phát hành", () => {
  it("namespace mặc định giữ đúng giá trị cũ (hard-code trước p2-02): cùng callId → cùng UUID đã phát", () => {
    // Giá trị sinh bằng `uuidv5(callId, "d2f6a9b0-6e9c-4b6b-9b7a-1f9f6e6a9c1a")` TRƯỚC khi chuyển namespace sang env — đổi mặc định là làm hỏng CallKit đang chạy.
    expect(callIdToUuid(CALL_ID)).toBe("06600456-8af4-53db-bc33-5b15221ef979");
    expect(callIdToUuid("c1")).toBe("eba6bb09-754b-5f88-9de0-f06d2577b1e7");
  });

  it("UUID v5 hợp lệ (phiên bản 5, biến thể RFC 4122)", () => {
    expect(callIdToUuid(CALL_ID)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe("callPushTtlSeconds = min(60, expiresAt − now)", () => {
  it("hạn còn 45 s → 45; còn 10 s → 10; còn nhiều hơn 60 s → trần 60", () => {
    expect(callPushTtlSeconds({ expiresAt: iso(45) }, NOW.getTime())).toBe(45);
    expect(callPushTtlSeconds({ expiresAt: iso(10) }, NOW.getTime())).toBe(10);
    expect(callPushTtlSeconds({ expiresAt: iso(300) }, NOW.getTime())).toBe(60);
  });

  it("đã quá hạn → 1 s (không bao giờ 0: sender coi 0 là 'không đặt TTL' = 4 tuần của FCM)", () => {
    expect(callPushTtlSeconds({ expiresAt: iso(-5) }, NOW.getTime())).toBe(1);
    expect(callPushTtlSeconds({ expiresAt: iso(0) }, NOW.getTime())).toBe(1);
  });

  it("expiresAt thiếu/không hợp lệ → 60 s như trước p2-02", () => {
    expect(callPushTtlSeconds({}, NOW.getTime())).toBe(60);
    expect(callPushTtlSeconds({ expiresAt: "không phải ngày" }, NOW.getTime())).toBe(60);
  });
});

describe("buildPushPayload — call.incoming (FCM data-only)", () => {
  const refs = {
    callId: CALL_ID,
    mediaKind: "VIDEO",
    callerId: "u2",
    callerName: "Lan",
    scopeTitle: "Nhóm Đồ án",
    scopeKind: "GROUP",
    callVersion: 3,
    expiresAt: iso(45),
  };

  it("data có callVersion/expiresAt/scopeKind (chuỗi phẳng) + callUuid tính từ callId; không title/body", () => {
    const p = buildPushPayload({ type: "call.incoming", targetUserId: "u1", refs, lockScreenPreview: true });
    expect(p.title).toBeUndefined();
    expect(p.body).toBeUndefined();
    expect(p.data).toMatchObject({
      callId: CALL_ID,
      callUuid: callIdToUuid(CALL_ID),
      callVersion: "3",
      expiresAt: iso(45),
      scopeKind: "GROUP",
      mediaKind: "VIDEO",
      callerName: "Lan",
    });
    for (const value of Object.values(p.data)) expect(typeof value).toBe("string");
    expect(p.androidChannel).toBe("calls");
    expect(p.collapseKey).toBe(`call:${CALL_ID}`);
  });

  it("TTL = min(60, expiresAt − now) và expiresAt tuyệt đối của payload (→ apns-expiration) khớp now + TTL", () => {
    const p = buildPushPayload({ type: "call.incoming", targetUserId: "u1", refs, lockScreenPreview: false });
    expect(p.ttlSeconds).toBe(45);
    expect(p.expiresAt).toBe(iso(45));

    const far = buildPushPayload({ type: "call.incoming", targetUserId: "u1", refs: { ...refs, expiresAt: iso(600) }, lockScreenPreview: false });
    expect(far.ttlSeconds).toBe(60);
    expect(far.expiresAt).toBe(iso(60));
  });

  it("thiếu expiresAt → 60 s (hành vi cũ), có originDeviceId thì mang theo", () => {
    const withoutExpiry: Record<string, unknown> = { ...refs };
    delete withoutExpiry["expiresAt"];
    const p = buildPushPayload({ type: "call.incoming", targetUserId: "u1", refs: { ...withoutExpiry, originDeviceId: "dev-a1" }, lockScreenPreview: false });
    expect(p.ttlSeconds).toBe(60);
    expect(p.data["originDeviceId"]).toBe("dev-a1");
    expect(p.data["expiresAt"]).toBeUndefined();
  });

  it("preview tắt vẫn không lộ nội dung tin: chỉ khoá cuộc gọi, không có khoá lạ", () => {
    const p = buildPushPayload({ type: "call.incoming", targetUserId: "u1", refs: { ...refs, messageText: "bí mật" }, lockScreenPreview: false });
    expect(JSON.stringify(p)).not.toContain("bí mật");
  });
});

describe("buildPushPayload — call.cancelled / answered-elsewhere / missed", () => {
  it("callUuid luôn có (tính từ callId, không cần refs.callUuid) + callVersion; TTL 60 s và KHÔNG có expiresAt tuyệt đối", () => {
    for (const type of ["call.cancelled", "call.answered-elsewhere"]) {
      const p = buildPushPayload({ type, targetUserId: "u1", refs: { callId: CALL_ID, reason: "CANCELLED", callVersion: 7 }, lockScreenPreview: false });
      expect(p.data["callUuid"]).toBe(callIdToUuid(CALL_ID));
      expect(p.data["callVersion"]).toBe("7");
      expect(p.ttlSeconds).toBe(60);
      expect(p.expiresAt).toBeUndefined();
    }
  });

  it("answered-elsewhere/declined-elsewhere mang originDeviceId (máy gây ra sự kiện) bên cạnh deviceId cũ", () => {
    const answered = buildPushPayload({
      type: "call.answered-elsewhere",
      targetUserId: "u1",
      refs: { callId: CALL_ID, deviceId: "dev-b2", originDeviceId: "dev-b2", callVersion: 4 },
      lockScreenPreview: false,
    });
    expect(answered.data).toMatchObject({ deviceId: "dev-b2", originDeviceId: "dev-b2", callVersion: "4" });

    const declined = buildPushPayload({
      type: "call.cancelled",
      targetUserId: "u1",
      refs: { callId: CALL_ID, reason: "DECLINED_ELSEWHERE", originDeviceId: "dev-b2", callVersion: 5 },
      lockScreenPreview: false,
    });
    expect(declined.data).toMatchObject({ reason: "DECLINED_ELSEWHERE", originDeviceId: "dev-b2", callUuid: callIdToUuid(CALL_ID) });
  });

  it("call.missed giữ TTL 24 h + có callUuid/callVersion", () => {
    const p = buildPushPayload({ type: "call.missed", targetUserId: "u1", refs: { callId: CALL_ID, callerId: "u2", callVersion: 9 }, lockScreenPreview: false });
    expect(p.ttlSeconds).toBe(24 * 3600);
    expect(p.data).toMatchObject({ callId: CALL_ID, callerId: "u2", callVersion: "9", callUuid: callIdToUuid(CALL_ID) });
  });

  it("loại KHÔNG phải cuộc gọi không bị gắn callUuid", () => {
    const p = buildPushPayload({ type: "mention", targetUserId: "u1", refs: { messageId: "m1", callId: CALL_ID }, lockScreenPreview: false });
    expect(p.data["callUuid"]).toBeUndefined();
  });
});

describe("buildVoipPayload (APNs VoIP)", () => {
  it("mang callVersion/expiresAt/scopeKind/originDeviceId từ refs + callUuid tất định", () => {
    const v = buildVoipPayload({
      targetUserId: "u1",
      callId: CALL_ID,
      refs: { mediaKind: "AUDIO", callerId: "u2", scopeKind: "DIRECT", callVersion: 2, expiresAt: iso(45), originDeviceId: "dev-a1" },
      scopeType: "CONVERSATION",
      scopeId: "s1",
    });
    expect(v).toMatchObject({ type: "call.incoming", callUuid: callIdToUuid(CALL_ID), callVersion: "2", expiresAt: iso(45), scopeKind: "DIRECT", originDeviceId: "dev-a1" });
  });

  it("refs cũ (không có khoá mới) → các khoá mới undefined (không vào JSON gửi APNs)", () => {
    const v = buildVoipPayload({ targetUserId: "u1", callId: CALL_ID, refs: { callerId: "u2" } });
    expect(v.callVersion).toBeUndefined();
    expect(JSON.parse(JSON.stringify(v))).not.toHaveProperty("expiresAt");
  });
});

describe("xem trước màn hình khoá cho cuộc gọi (p2-02 be.md §5.3): FULL / NAME_ONLY / HIDDEN", () => {
  const refs = {
    callId: CALL_ID,
    mediaKind: "VIDEO",
    callerId: "u2",
    callerName: "Lan",
    callerAvatar: "https://cdn.test/lan.png",
    scopeTitle: "Nhóm Đồ án",
    scopeKind: "GROUP",
    callVersion: 3,
    expiresAt: iso(45),
  };

  it("callPreviewLevelOf: chưa chọn (null/undefined) → FULL (mặc định của cuộc gọi); FULL → FULL; SENDER → NAME_ONLY; HIDDEN → HIDDEN", () => {
    expect([undefined, null, "FULL", "SENDER", "HIDDEN"].map((l) => callPreviewLevelOf(l as "FULL" | null | undefined))).toEqual(["FULL", "FULL", "FULL", "NAME_ONLY", "HIDDEN"]);
  });

  it("call.incoming FCM: FULL giữ tên + ảnh + tên nhóm; NAME_ONLY bỏ tên nhóm; HIDDEN → callerName rỗng, không ảnh/tên nhóm (id vẫn đủ để mở cuộc gọi)", () => {
    const build = (callPreview?: "FULL" | "NAME_ONLY" | "HIDDEN") => buildPushPayload({ type: "call.incoming", targetUserId: "u1", refs, lockScreenPreview: false, callPreview });
    expect(build().data).toMatchObject({ callerName: "Lan", callerAvatar: "https://cdn.test/lan.png", scopeTitle: "Nhóm Đồ án" }); // mặc định FULL
    const nameOnly = build("NAME_ONLY").data;
    expect(nameOnly).toMatchObject({ callerName: "Lan", callerAvatar: "https://cdn.test/lan.png" });
    expect(nameOnly["scopeTitle"]).toBeUndefined();
    const hidden = build("HIDDEN");
    expect(hidden.data["callerName"]).toBe("");
    expect(hidden.data["callerAvatar"]).toBeUndefined();
    expect(hidden.data["scopeTitle"]).toBeUndefined();
    expect(hidden.data).toMatchObject({ callId: CALL_ID, callUuid: callIdToUuid(CALL_ID), callerId: "u2", callVersion: "3", scopeKind: "GROUP" });
    expect(JSON.stringify(hidden)).not.toContain("Lan");
    expect(JSON.stringify(hidden)).not.toContain("Nhóm Đồ án");
  });

  it("call.missed: HIDDEN → tiêu đề 'Super App' + nội dung chung, không lộ người gọi; FULL/NAME_ONLY (DM) vẫn nêu tên", () => {
    const missed = (callPreview?: "FULL" | "NAME_ONLY" | "HIDDEN", scopeType = "CONVERSATION") =>
      buildPushPayload({ type: "call.missed", targetUserId: "u1", scopeType, refs: { ...refs, scopeKind: "DIRECT" }, lockScreenPreview: false, callPreview });
    expect(missed("HIDDEN")).toMatchObject({ title: "Super App", body: "Bạn có cuộc gọi nhỡ" });
    expect(JSON.stringify(missed("HIDDEN"))).not.toContain("Lan");
    expect(missed()).toMatchObject({ title: "Cuộc gọi nhỡ", body: "Cuộc gọi nhỡ từ Lan" });
    expect(missed("NAME_ONLY")).toMatchObject({ title: "Cuộc gọi nhỡ", body: "Cuộc gọi nhỡ từ Lan" });
  });

  it("mức xem trước chỉ áp cho call.*: loại khác bỏ qua callPreview", () => {
    const p = buildPushPayload({ type: "mention", targetUserId: "u1", refs: { messageId: "m1", callerName: "Lan" }, lockScreenPreview: false, callPreview: "HIDDEN" });
    expect(p.title).toBe("Super App");
    expect(p.data["messageId"]).toBe("m1");
  });

  it("VoIP: HIDDEN → callerName rỗng + bỏ ảnh/tên nhóm; NAME_ONLY bỏ tên nhóm; mặc định FULL", () => {
    const voip = (callPreview?: "FULL" | "NAME_ONLY" | "HIDDEN") => buildVoipPayload({ targetUserId: "u1", callId: CALL_ID, refs, callPreview });
    expect(voip()).toMatchObject({ callerName: "Lan", callerAvatar: "https://cdn.test/lan.png", scopeTitle: "Nhóm Đồ án" });
    expect(voip("NAME_ONLY")).toMatchObject({ callerName: "Lan", scopeTitle: undefined });
    const hidden = voip("HIDDEN");
    expect(hidden).toMatchObject({ callerName: "", callerAvatar: undefined, scopeTitle: undefined, callerId: "u2", callUuid: callIdToUuid(CALL_ID) });
    expect(JSON.stringify(hidden)).not.toContain("Lan");
  });
});
