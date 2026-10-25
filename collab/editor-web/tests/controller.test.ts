import { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate } from "y-protocols/awareness";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { ALL_COMMANDS } from "../src/bridge-protocol";
import { msg } from "./helpers/fake-transport";
import { flush, setup } from "./helpers/controller-harness";
import { DOC_ID, fakeJwt, initMessage, USER } from "./helpers/fixtures";

let t: ReturnType<typeof setup>;
afterEach(() => t?.destroy());

describe("khởi động và init", () => {
  it("báo ready kèm phiên bản giao thức và danh sách lệnh", () => {
    t = setup();
    expect(t.transport.last("ready")).toEqual({ protocol: 1, bundle: expect.stringMatching(/^\d+\.\d+\.\d+/), commands: [...ALL_COMMANDS] });
  });

  it("init live: đặt lang/theme, dựng editor CHƯA cho sửa, bắt đầu nối, báo status connecting + người dùng hiện diện", () => {
    t = setup();
    t.transport.deliver(initMessage({ locale: "en", theme: "dark" }));
    expect(t.chrome.lang).toBe("en");
    expect(t.chrome.dataset["theme"]).toBe("dark");
    expect(t.fake.last.connectCalls).toBe(1);
    expect(t.editor().isEditable).toBe(false);
    expect(t.root.querySelector(".tiptap")).not.toBeNull();
    expect(t.transport.last("status")).toEqual({
      connection: "connecting",
      unsynced: false,
      saveFailed: false,
      mode: "edit",
      readOnly: false,
      archived: false,
      tooLarge: false,
      nearLimit: false,
    });
    expect(t.transport.last("awareness")).toEqual({ count: 1, users: [{ ...USER, self: true }] });
    expect(t.fake.last.options.documentName).toBe(`doc:${DOC_ID}`);
  });

  it("sau khi đồng bộ lần đầu: cho sửa, status synced, selectionState canEdit", async () => {
    t = setup();
    t.open();
    await flush();
    expect(t.transport.last("status")).toMatchObject({ connection: "synced", readOnly: false, mode: "edit" });
    expect(t.editor().isEditable).toBe(true);
    expect(t.transport.last("selectionState")).toMatchObject({ canEdit: true });
  });

  it("placeholder theo locale hoặc theo init", () => {
    t = setup();
    t.open({ placeholder: "Viết gì đó" });
    expect(t.root.querySelector("[data-placeholder]")?.getAttribute("data-placeholder")).toBe("Viết gì đó");
    // Người chỉ xem tài liệu trống không được mời "Bắt đầu viết…".
    t.transport.deliver(initMessage({ mode: "view" }));
    t.fake.last.open("readonly");
    expect(t.root.querySelector("[data-placeholder]")).toBeNull();
  });

  it("init lại: huỷ phiên/editor cũ trước khi dựng mới", () => {
    t = setup();
    t.open();
    const first = t.fake.last;
    t.transport.deliver(initMessage());
    expect(first.destroyed).toBe(true);
    expect(t.fake.sessions).toHaveLength(2);
    expect(t.root.querySelectorAll(".tiptap")).toHaveLength(1);
  });

  it("init sai (user.id ≠ sub) không dựng gì, báo INVALID_MESSAGE", () => {
    t = setup();
    t.transport.deliver(initMessage({ token: fakeJwt({ sub: "64b7f0c2a1d3e4f5a6b7c8ff" }) }));
    expect(t.fake.sessions).toHaveLength(0);
    expect(t.transport.last("error")).toMatchObject({ code: "INVALID_MESSAGE", fatal: false, detail: "init:user-id-mismatch" });
  });

  it("lỗi bất ngờ khi dựng phiên không ném ra ngoài mà báo LOAD_FAILED", () => {
    t = setup({
      createSession: () => {
        throw new Error("WebSocket is not defined");
      },
    });
    expect(() => t.transport.deliver(initMessage())).not.toThrow();
    expect(t.transport.last("error")).toMatchObject({ code: "LOAD_FAILED", fatal: false, detail: "WebSocket is not defined" });
  });
});

describe("chế độ xem / quyền", () => {
  it("mode view: không bao giờ cho sửa, mọi lệnh sửa bị từ chối kèm commandResult", () => {
    t = setup();
    t.open({ mode: "view" }, "readonly");
    expect(t.editor().isEditable).toBe(false);
    expect(t.transport.last("status")).toMatchObject({ mode: "view", readOnly: true, connection: "synced" });
    expect(t.command("bold")).toEqual({ requestId: "r1", ok: false, reason: "read-only" });
    expect(t.command("insertTable")).toEqual({ requestId: "r1", ok: false, reason: "read-only" });
    t.transport.deliver(msg("insertImage", { assetId: "64b7f0c2a1d3e4f5a6b7c8d9", requestId: "r2" }));
    expect(t.transport.last("commandResult")).toEqual({ requestId: "r2", ok: false, reason: "read-only" });
    expect(t.editor().getText()).toBe("");
  });

  it("mode comment: chỉ đọc nhưng báo đúng mode", () => {
    t = setup();
    t.open({ mode: "comment" }, "readonly");
    expect(t.transport.last("status")).toMatchObject({ mode: "comment", readOnly: true });
    expect(t.editor().isEditable).toBe(false);
  });

  it("xin edit nhưng server chỉ cho đọc → mode hiệu lực là view", () => {
    t = setup();
    t.open({ mode: "edit" }, "readonly");
    expect(t.transport.last("status")).toMatchObject({ mode: "view", readOnly: true });
    expect(t.editor().isEditable).toBe(false);
  });

  it("setMode chuyển giữa edit/view trong phiên (không vượt quyền server)", async () => {
    t = setup();
    t.open({ mode: "view" });
    expect(t.editor().isEditable).toBe(false);
    t.transport.deliver(msg("setMode", { mode: "edit" }));
    expect(t.editor().isEditable).toBe(true);
    t.transport.deliver(msg("setMode", { mode: "view" }));
    expect(t.editor().isEditable).toBe(false);
    t.fake.last.kick("revoked");
    t.fake.last.connect();
    t.fake.last.open("readonly");
    t.transport.deliver(msg("setMode", { mode: "edit" }));
    expect(t.editor().isEditable).toBe(false);
    expect(t.transport.last("status")).toMatchObject({ mode: "view", readOnly: true });
  });

  it("READ_ONLY (bị hạ quyền lúc đang mở) → khoá editor ngay, giữ nội dung", () => {
    t = setup();
    t.open();
    t.editor().commands.insertContent("đang gõ");
    t.fake.last.notice("READ_ONLY");
    expect(t.editor().isEditable).toBe(false);
    expect(t.editor().getText()).toBe("đang gõ");
    expect(t.transport.last("status")).toMatchObject({ mode: "view", readOnly: true });
    expect(t.transport.last("notice")).toEqual({ code: "READ_ONLY" });
    expect(t.command("bold")).toMatchObject({ ok: false, reason: "read-only" });
  });

  it("ARCHIVED → banner lưu trữ + chỉ đọc", () => {
    t = setup();
    t.open();
    t.fake.last.notice("ARCHIVED");
    expect(t.transport.last("status")).toMatchObject({ archived: true, readOnly: true, mode: "view" });
    expect(t.editor().isEditable).toBe(false);
  });

  it("chỉ đọc thì `unsynced` luôn false (provider không xoá bộ đếm khi server từ chối update của viewer)", () => {
    t = setup();
    t.open({ mode: "view" }, "readonly");
    t.fake.last.unsynced(3);
    expect(t.transport.last("status")).toMatchObject({ unsynced: false });
  });
});

describe("lệnh trước khi sẵn sàng", () => {
  it("trước init → not-initialized", () => {
    t = setup();
    expect(t.command("bold")).toEqual({ requestId: "r1", ok: false, reason: "not-initialized" });
  });

  it("đã init nhưng chưa đồng bộ lần đầu → loading", () => {
    t = setup();
    t.open({}, null);
    expect(t.command("bold")).toEqual({ requestId: "r1", ok: false, reason: "loading" });
  });

  it("lệnh không có requestId không sinh commandResult", () => {
    t = setup();
    t.open();
    t.transport.deliver(msg("command", { name: "bold" }));
    expect(t.transport.of("commandResult")).toHaveLength(0);
  });

  it("lệnh chạy thật khi đã sẵn sàng", () => {
    t = setup();
    t.open();
    t.editor().commands.insertContent("chữ");
    t.editor().commands.selectAll();
    expect(t.command("bold")).toEqual({ requestId: "r1", ok: true });
    expect(t.editor().getHTML()).toContain("<strong>chữ</strong>");
  });
});

describe("tin sai từ app", () => {
  it("JSON cắt cụt → INVALID_MESSAGE, không ném lỗi, không đổi trạng thái", () => {
    t = setup();
    t.open();
    const status = t.transport.last("status");
    const full = JSON.stringify(initMessage());
    expect(() => t.transport.deliver(full.slice(0, full.length - 9))).not.toThrow();
    expect(t.transport.last("error")).toMatchObject({ code: "INVALID_MESSAGE", detail: "?:malformed-json" });
    expect(t.transport.last("status")).toEqual(status);
    expect(t.fake.sessions).toHaveLength(1);
  });

  it("lệnh lạ kèm requestId → commandResult unknown-command", () => {
    t = setup();
    t.open();
    expect(t.command("formatDisk")).toEqual({ requestId: "r1", ok: false, reason: "unknown-command" });
    expect(t.transport.last("error")).toMatchObject({ code: "INVALID_MESSAGE" });
  });

  it("chống dội: tối đa 5 báo lỗi INVALID_MESSAGE mỗi 10 s", () => {
    vi.useFakeTimers();
    try {
      t = setup();
      for (let i = 0; i < 20; i += 1) t.transport.deliver("{hỏng");
      expect(t.transport.of("error")).toHaveLength(5);
      vi.advanceTimersByTime(10_001);
      t.transport.deliver("{hỏng");
      expect(t.transport.of("error")).toHaveLength(6);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("lỗi không bắt được trong trang", () => {
  it("báo app LOAD_FAILED không nghiêm trọng, tối đa 5 lần mỗi 10 s, cắt ngắn chi tiết", () => {
    vi.useFakeTimers();
    try {
      t = setup();
      for (let i = 0; i < 20; i += 1) t.controller.reportUnexpected("x".repeat(500));
      const errors = t.transport.of("error");
      expect(errors).toHaveLength(5);
      expect(errors[0]).toMatchObject({ code: "LOAD_FAILED", fatal: false });
      expect(errors[0]?.detail).toHaveLength(200);
      vi.advanceTimersByTime(10_001);
      t.controller.reportUnexpected("again");
      expect(t.transport.of("error")).toHaveLength(6);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("token và đóng kết nối", () => {
  it("unauthorized → requestToken; setToken → nối lại", () => {
    t = setup();
    t.open({}, null);
    t.fake.last.denyAuth("unauthorized");
    expect(t.transport.last("requestToken")).toEqual({ reason: "unauthorized", attempt: 1 });
    const connects = t.fake.last.connectCalls;
    t.transport.deliver(msg("setToken", { token: fakeJwt(), expiresAt: Date.now() + 300_000 }));
    expect(t.fake.last.connectCalls).toBe(connects + 1);
  });

  it("forbidden → error FORBIDDEN nghiêm trọng, status closed, KHÔNG nối lại", () => {
    vi.useFakeTimers();
    try {
      t = setup();
      t.open();
      t.fake.last.kick("forbidden");
      expect(t.transport.of("error")).toEqual([{ code: "FORBIDDEN", fatal: true, message: expect.any(String), detail: "forbidden" }]);
      expect(t.transport.last("status")).toMatchObject({ connection: "closed" });
      vi.advanceTimersByTime(120_000);
      expect(t.fake.last.connectCalls).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("not-found → NOT_FOUND nghiêm trọng", () => {
    t = setup();
    t.open({}, null);
    t.fake.last.denyAuth("not-found");
    expect(t.transport.last("error")).toMatchObject({ code: "NOT_FOUND", fatal: true });
  });

  it("mất mạng → offline nhưng vẫn gõ được; nối lại → synced", () => {
    t = setup();
    t.open();
    t.fake.last.dropNetwork();
    expect(t.transport.last("status")).toMatchObject({ connection: "offline", readOnly: false });
    expect(t.editor().isEditable).toBe(true);
    t.editor().commands.insertContent("gõ lúc offline");
    t.fake.last.unsynced(1);
    expect(t.transport.last("status")).toMatchObject({ unsynced: true });
    t.fake.last.connect();
    t.fake.last.open();
    t.fake.last.unsynced(0);
    expect(t.transport.last("status")).toMatchObject({ connection: "synced", unsynced: false });
  });

  it("SAVE_FAILED/SAVE_RECOVERED phản ánh vào status và chuyển tiếp notice", () => {
    t = setup();
    t.open();
    t.fake.last.notice("SAVE_FAILED");
    expect(t.transport.last("status")).toMatchObject({ saveFailed: true });
    t.fake.last.notice("SAVE_RECOVERED");
    expect(t.transport.last("status")).toMatchObject({ saveFailed: false });
    expect(t.transport.of("notice").map((n) => n.code)).toEqual(["SAVE_FAILED", "SAVE_RECOVERED"]);
  });

  it("retry gọi nối lại", () => {
    t = setup();
    t.open({}, null);
    t.fake.last.denyAuth("forbidden");
    t.transport.deliver(msg("retry", {}));
    expect(t.fake.last.connectCalls).toBe(2);
  });

  it("RESTORED: thông báo + xoá lịch sử hoàn tác (không hồi sinh mảnh cũ)", async () => {
    t = setup();
    t.open();
    t.editor().commands.insertContent("nội dung cũ");
    await flush();
    expect(t.transport.last("selectionState")).toMatchObject({ canUndo: true });
    t.fake.last.notice("RESTORED");
    await flush();
    expect(t.transport.last("notice")).toEqual({ code: "RESTORED" });
    expect(t.transport.last("selectionState")).toMatchObject({ canUndo: false });
  });
});

describe("hiện diện", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("gộp theo người (2 thiết bị = 1), mình đứng đầu, làm sạch dữ liệu người khác", () => {
    t = setup();
    t.open();
    const other = new Awareness(new Y.Doc());
    const dup = new Awareness(new Y.Doc());
    other.setLocalState({ user: { id: "u-binh", name: "Bình", color: "#B42318" }, cursor: { anchor: 1, head: 1 } });
    dup.setLocalState({ user: { id: "u-binh", name: "Bình (máy 2)", color: "#B42318" } });
    for (const peer of [other, dup]) applyAwarenessUpdate(t.fake.last.awareness, encodeAwarenessUpdate(peer, [peer.clientID]), "remote");
    vi.advanceTimersByTime(200);
    const a = t.transport.last("awareness");
    expect(a?.count).toBe(2);
    expect(a?.users.map((u) => [u.id, u.self])).toEqual([
      [USER.id, true],
      ["u-binh", false],
    ]);
  });

  it("người khác rời → cập nhật số người", () => {
    t = setup();
    t.open();
    const other = new Awareness(new Y.Doc());
    other.setLocalState({ user: { id: "u-2", name: "Chi", color: "#0E7090" } });
    applyAwarenessUpdate(t.fake.last.awareness, encodeAwarenessUpdate(other, [other.clientID]), "remote");
    vi.advanceTimersByTime(200);
    expect(t.transport.last("awareness")?.count).toBe(2);
    other.setLocalState(null);
    applyAwarenessUpdate(t.fake.last.awareness, encodeAwarenessUpdate(other, [other.clientID]), "remote");
    vi.advanceTimersByTime(200);
    expect(t.transport.last("awareness")?.count).toBe(1);
  });

  it("awareness của người khác bị hỏng (thiếu id, màu lạ) được bỏ qua/làm sạch, không làm hỏng danh sách", () => {
    t = setup();
    t.open();
    const bad = new Awareness(new Y.Doc());
    bad.setLocalState({ user: { name: "Không id" } });
    const odd = new Awareness(new Y.Doc());
    odd.setLocalState({ user: { id: "u-3", name: "x".repeat(200), color: "url(javascript:1)" } });
    for (const peer of [bad, odd]) applyAwarenessUpdate(t.fake.last.awareness, encodeAwarenessUpdate(peer, [peer.clientID]), "remote");
    vi.advanceTimersByTime(200);
    const users = t.transport.last("awareness")?.users ?? [];
    expect(users.map((u) => u.id)).toEqual([USER.id, "u-3"]);
    expect(users[1]?.name).toHaveLength(80);
    expect(users[1]?.color).toBe("#175CD3");
  });
});

describe("dọn dẹp", () => {
  it("dispose: huỷ phiên + editor, dọn DOM; tin sau đó không gây lỗi", () => {
    t = setup();
    t.open();
    t.transport.deliver(msg("dispose", {}));
    expect(t.fake.last.destroyed).toBe(true);
    expect(t.root.querySelector(".tiptap")).toBeNull();
    expect(t.command("bold")).toMatchObject({ ok: false, reason: "not-initialized" });
    expect(() => t.transport.deliver(msg("setToken", { token: "t" }))).not.toThrow();
  });

  it("setTheme đổi data-theme", () => {
    t = setup();
    t.transport.deliver(msg("setTheme", { theme: "dark" }));
    expect(t.chrome.dataset["theme"]).toBe("dark");
  });
});
