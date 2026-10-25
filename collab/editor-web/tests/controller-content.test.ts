import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { flush, setup } from "./helpers/controller-harness";
import { makeEditor } from "./helpers/editor-harness";
import { msg } from "./helpers/fake-transport";

const ID = "64b7f0c2a1d3e4f5a6b7c8d9";
let t: ReturnType<typeof setup>;
afterEach(() => t?.destroy());

const doc = (): Y.Doc => (t.controller as unknown as { doc: Y.Doc }).doc;
const b64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));
const image = () => t.root.querySelector<HTMLElement>("figure.doc-image");

describe("chèn ảnh qua bridge", () => {
  it("insertImage → node ảnh (chỉ assetId) → xin URL ký → gán src khi app đáp", async () => {
    t = setup();
    t.open();
    t.transport.deliver(msg("insertImage", { assetId: ID, alt: "Sơ đồ", requestId: "i1" }));
    expect(t.transport.last("commandResult")).toEqual({ requestId: "i1", ok: true });
    expect(t.transport.of("resolveAssetUrl")).toEqual([{ assetId: ID }]);
    expect(doc().getXmlFragment("default").toString()).toContain(`assetId="${ID}"`);
    expect(doc().getXmlFragment("default").toString()).not.toMatch(/https?:/);

    t.transport.deliver(msg("assetUrl", { assetId: ID, url: "https://cdn.example/1.png?sig=x", expiresAt: Date.now() + 50_000 }));
    await flush();
    expect(image()?.querySelector("img")?.getAttribute("src")).toBe("https://cdn.example/1.png?sig=x");
  });

  it("ảnh ở cuối tài liệu: thêm đoạn văn sau đó để gõ tiếp; ảnh giữa tài liệu không thêm đoạn thừa", () => {
    t = setup();
    t.open();
    t.transport.deliver(msg("insertImage", { assetId: ID }));
    const types = () => (t.editor().getJSON().content ?? []).map((n) => n.type);
    expect(types()).toEqual(["image", "paragraph"]);
    t.editor().commands.setTextSelection(1);
    t.editor().commands.insertContent("Đoạn đầu");
    t.editor().commands.setTextSelection(1);
    t.transport.deliver(msg("insertImage", { assetId: "64b7f0c2a1d3e4f5a6b7c8ff" }));
    expect(types().filter((n) => n === "paragraph").length).toBeLessThanOrEqual(2);
  });

  it("từ chối khi chưa tải / chỉ đọc / tài liệu đầy", () => {
    t = setup();
    t.open({}, null);
    t.transport.deliver(msg("insertImage", { assetId: ID, requestId: "a" }));
    expect(t.transport.last("commandResult")).toEqual({ requestId: "a", ok: false, reason: "loading" });

    t.fake.last.open("readonly");
    t.transport.deliver(msg("insertImage", { assetId: ID, requestId: "b" }));
    expect(t.transport.last("commandResult")).toEqual({ requestId: "b", ok: false, reason: "read-only" });

    t.transport.deliver(msg("insertImage", { assetId: "ab", requestId: "c" })); // assetId sai định dạng
    expect(t.transport.last("error")).toMatchObject({ code: "INVALID_MESSAGE" });
    expect(t.root.querySelector("figure")).toBeNull();
  });

  it("dán/thả tệp ảnh → nhờ app (requestImage), không chèn gì trong WebView", () => {
    t = setup();
    t.open();
    const view = t.editor().view;
    const png = { clipboardData: { files: [{ type: "image/png" }] } } as unknown as ClipboardEvent;
    const text = { clipboardData: { files: [], getData: () => "" } } as unknown as ClipboardEvent;
    expect(view.someProp("handlePaste", (f) => f(view, png, undefined as never))).toBe(true);
    expect(view.someProp("handlePaste", (f) => f(view, text, undefined as never))).toBeFalsy();
    const drop = { dataTransfer: { files: [{ type: "image/jpeg" }] } } as unknown as DragEvent;
    expect(view.someProp("handleDrop", (f) => f(view, drop, undefined as never, false))).toBe(true);
    expect(t.transport.of("requestImage")).toEqual([
      { requestId: "img-1", source: "paste" },
      { requestId: "img-2", source: "drop" },
    ]);
  });
});

describe("liên kết", () => {
  const click = (href: string) => {
    const a = document.createElement("a");
    a.setAttribute("href", href);
    a.textContent = "liên kết";
    document.body.append(a);
    const view = t.editor().view;
    const event = { target: a, preventDefault: vi.fn() } as unknown as MouseEvent;
    const handled = view.someProp("handleClick", (f) => f(view, 1, event));
    a.remove();
    return { handled, prevented: (event.preventDefault as ReturnType<typeof vi.fn>).mock.calls.length > 0 };
  };

  it("chỉ đọc: chạm liên kết → openLink qua bridge (app xác nhận rồi mở)", () => {
    t = setup();
    t.open({ mode: "view" }, "readonly");
    expect(click("https://vci.vn/a")).toEqual({ handled: true, prevented: true });
    expect(t.transport.of("openLink")).toEqual([{ url: "https://vci.vn/a" }]);
  });

  it("chỉ đọc: liên kết không an toàn (javascript:) không được mở", () => {
    t = setup();
    t.open({ mode: "view" }, "readonly");
    expect(click("javascript:alert(1)").handled).toBeFalsy();
    expect(t.transport.of("openLink")).toEqual([]);
  });

  it("đang sửa: chạm liên kết chỉ đặt con trỏ (không mở)", () => {
    t = setup();
    t.open();
    expect(click("https://vci.vn/a").handled).toBeFalsy();
    expect(t.transport.of("openLink")).toEqual([]);
  });
});

describe("xem phiên bản lịch sử (snapshot)", () => {
  function snapshotState(): string {
    const src = makeEditor();
    src.editor.commands.insertContent("<h1>Bản cũ</h1><p>Nội dung ngày hôm qua</p>");
    const state = b64(Y.encodeStateAsUpdate(src.doc));
    src.editor.destroy();
    return state;
  }

  it("dựng editor chỉ đọc từ state Yjs, không tạo kết nối", async () => {
    t = setup();
    t.transport.deliver(msg("init", { source: "snapshot", yjsState: snapshotState(), theme: "dark" }));
    expect(t.fake.sessions).toHaveLength(0);
    expect(t.editor().getText()).toContain("Nội dung ngày hôm qua");
    expect(t.editor().isEditable).toBe(false);
    expect(t.editor().getJSON().content?.[0]).toMatchObject({ type: "heading", attrs: { level: 1 } });
    expect(t.transport.last("status")).toEqual({ connection: "synced", unsynced: false, saveFailed: false, mode: "view", readOnly: true, archived: false, tooLarge: false, nearLimit: false });
    expect(t.transport.last("awareness")).toBeUndefined();
    expect(t.command("bold")).toMatchObject({ ok: false, reason: "read-only" });
    t.transport.deliver(msg("setMode", { mode: "edit" })); // không thể "nâng quyền" một bản chụp
    expect(t.editor().isEditable).toBe(false);
    await flush();
    expect(t.transport.last("selectionState")).toMatchObject({ canEdit: false });
  });

  it("state rỗng → tài liệu trống; state hỏng → LOAD_FAILED nghiêm trọng, không dựng editor", () => {
    t = setup();
    t.transport.deliver(msg("init", { source: "snapshot", yjsState: "" }));
    expect(t.editor().getText()).toBe("");
    t.transport.deliver(msg("init", { source: "snapshot", yjsState: b64(new Uint8Array([255, 255, 255, 255, 255, 255])) }));
    expect(t.transport.last("error")).toMatchObject({ code: "LOAD_FAILED", fatal: true, detail: "snapshot-corrupt" });
    expect(t.root.querySelector(".tiptap")).toBeNull();
  });
});

describe("tài liệu gần đầy / đầy (cắt dữ liệu)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const bytes = () => Y.encodeStateAsUpdate(doc()).byteLength;

  it("≥ 90% trần → nearLimit; ≥ 100% → tooLarge + lỗi TOO_LARGE (một lần) + chặn lệnh chèn; xoá bớt → hết", () => {
    t = setup();
    t.open({ stateMaxBytes: 1500 });
    while (bytes() < 1500 * 0.92) t.editor().commands.insertContent("x".repeat(40));
    expect(bytes()).toBeLessThan(1500);
    vi.advanceTimersByTime(2_100);
    expect(t.transport.last("status")).toMatchObject({ nearLimit: true, tooLarge: false });
    expect(t.transport.of("error")).toEqual([]);

    while (bytes() < 1500) t.editor().commands.insertContent("x".repeat(40));
    vi.advanceTimersByTime(2_100);
    expect(t.transport.last("status")).toMatchObject({ nearLimit: true, tooLarge: true });
    expect(t.transport.of("error")).toEqual([{ code: "TOO_LARGE", fatal: false, message: expect.any(String), detail: "local-estimate" }]);
    expect(t.command("insertTable")).toEqual({ requestId: "r1", ok: false, reason: "too-large" });
    t.transport.deliver(msg("insertImage", { assetId: ID, requestId: "img" }));
    expect(t.transport.last("commandResult")).toEqual({ requestId: "img", ok: false, reason: "too-large" });
    // Vẫn định dạng/gõ/xoá được để người dùng thu nhỏ tài liệu.
    t.editor().commands.selectAll();
    expect(t.command("bold")).toEqual({ requestId: "r1", ok: true });

    t.editor().commands.clearContent();
    vi.advanceTimersByTime(2_100);
    expect(t.transport.last("status")).toMatchObject({ nearLimit: false, tooLarge: false });
    expect(t.transport.of("error")).toHaveLength(1);
  });

  it("không có stateMaxBytes thì không đo (không tốn CPU)", () => {
    t = setup();
    t.open();
    t.editor().commands.insertContent("x".repeat(5000));
    vi.advanceTimersByTime(10_000);
    expect(t.transport.last("status")).toMatchObject({ nearLimit: false, tooLarge: false });
  });

  it("server báo TOO_LARGE (BE từ chối lưu) → tooLarge tới khi SAVE_RECOVERED", () => {
    t = setup();
    t.open();
    t.fake.last.notice("TOO_LARGE");
    expect(t.transport.last("status")).toMatchObject({ tooLarge: true });
    expect(t.transport.last("error")).toMatchObject({ code: "TOO_LARGE", fatal: false, detail: "server-notice" });
    expect(t.command("horizontalRule")).toMatchObject({ ok: false, reason: "too-large" });
    t.fake.last.notice("SAVE_RECOVERED");
    expect(t.transport.last("status")).toMatchObject({ tooLarge: false });
  });

  it("khung > 6 MiB bị server đóng (1009) → TOO_LARGE nghiêm trọng, không nối lại; vẫn xoá bớt được", () => {
    t = setup();
    t.open();
    t.fake.last.handlers.onClose({ code: 1009, reason: "" });
    expect(t.transport.last("error")).toMatchObject({ code: "TOO_LARGE", fatal: true, detail: "frame-too-large" });
    expect(t.transport.last("status")).toMatchObject({ connection: "closed" });
    expect(t.editor().isEditable).toBe(true);
    vi.advanceTimersByTime(60_000);
    expect(t.fake.last.connectCalls).toBe(1);
  });
});

describe("nội dung không hợp lệ với schema (contentError của Tiptap)", () => {
  const emit = (message: string) =>
    t.editor().emit("contentError", { editor: t.editor(), error: new RangeError(message), disableCollaboration: () => undefined });

  it("lỗi cấu trúc từ Yjs → khoá editor, dừng đồng bộ, báo LOAD_FAILED nghiêm trọng", () => {
    t = setup();
    t.open();
    emit("Invalid content for node paragraph: <paragraph>");
    expect(t.transport.of("error")).toEqual([{ code: "LOAD_FAILED", fatal: true, message: expect.any(String), detail: "content-invalid" }]);
    expect(t.transport.last("status")).toMatchObject({ connection: "closed", readOnly: true });
    expect(t.editor().isEditable).toBe(false);
    expect(t.fake.last.disconnectCalls).toBeGreaterThanOrEqual(1);
    emit("Invalid content for node paragraph: <paragraph>"); // lặp lại không báo thêm
    expect(t.transport.of("error")).toHaveLength(1);
  });

  it("HTML lạ bị Tiptap từ chối khi chèn (\"[tiptap error]…\") chỉ là lệnh không thành, không phải tài liệu hỏng", () => {
    t = setup();
    t.open();
    emit("[tiptap error]: Invalid HTML content");
    expect(t.transport.of("error")).toEqual([]);
    expect(t.editor().isEditable).toBe(true);
  });
});

describe("hiệu năng: giao dịch từ máy khác được gom lại", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const remoteUpdate = (text: string): Uint8Array => {
    const src = new Y.Doc();
    Y.applyUpdate(src, Y.encodeStateAsUpdate(doc()));
    const before = Y.encodeStateVector(src);
    const p = new Y.XmlElement("paragraph");
    p.insert(0, [new Y.XmlText(text)]);
    src.getXmlFragment("default").insert(0, [p]);
    return Y.encodeStateAsUpdate(src, before);
  };

  it("nhiều update từ xa liên tiếp chỉ tính selectionState MỘT lần sau 100 ms; thao tác của mình cập nhật ngay", async () => {
    t = setup();
    t.open();
    await flush();
    const spy = vi.spyOn(t.controller as unknown as { sendSelectionState(): void }, "sendSelectionState");
    for (const text of ["a", "b", "c"]) Y.applyUpdate(doc(), remoteUpdate(text), "remote");
    expect(spy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(99);
    expect(spy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(spy).toHaveBeenCalledTimes(1);

    t.editor().commands.insertContent("tự gõ");
    await flush();
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
