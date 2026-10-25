import { afterEach, describe, expect, it, vi } from "vitest";
import { cmdCtx, makeEditor, type EditorHarness } from "./helpers/editor-harness";

const ID = "64b7f0c2a1d3e4f5a6b7c8d9";
let h: EditorHarness;
afterEach(() => {
  h?.editor.destroy();
  vi.unstubAllGlobals();
});

const figure = () => h.element.querySelector<HTMLElement>("figure.doc-image");
const img = () => figure()?.querySelector("img") as HTMLImageElement;

describe("node ảnh chỉ lưu assetId", () => {
  it("schema không có thuộc tính src/url", () => {
    h = makeEditor();
    expect(Object.keys(h.editor.schema.nodes["image"]?.spec.attrs ?? {})).toEqual(["assetId", "alt"]);
  });

  it("nội dung Yjs chứa assetId, KHÔNG chứa URL", () => {
    h = makeEditor();
    expect(h.editor.commands.insertDocImage({ assetId: ID, alt: "Sơ đồ" })).toBe(true);
    const xml = h.doc.getXmlFragment("default").toString();
    // Thuộc tính Yjs được liệt kê theo thứ tự chữ cái.
    expect(xml).toBe(`<image alt="Sơ đồ" assetId="${ID}"></image>`);
    expect(xml).not.toMatch(/https?:|src=|data:/);
    // Cả khi app đã cấp URL, state Yjs vẫn không đổi.
    h.resolver.receive({ assetId: ID, url: "https://cdn.example/signed.png?sig=abc" });
    expect(h.doc.getXmlFragment("default").toString()).not.toContain("signed.png");
  });

  it("HTML sao chép ra chỉ có data-asset-id", () => {
    h = makeEditor();
    h.editor.commands.insertDocImage({ assetId: ID });
    expect(h.editor.getHTML()).toBe(`<img data-asset-id="${ID}">`);
  });

  it("dán HTML có <img src> bên ngoài bị loại (không theo dõi/không rò IP), giữ phần chữ", () => {
    h = makeEditor();
    // Đường dán thật của ProseMirror (clipboard parser): phần tử lạ bị bỏ, chỉ còn nội dung khớp schema.
    h.editor.view.pasteHTML('<p>xin chào</p><img src="https://evil.example/pixel.png" onerror="alert(1)"><img data-asset-id="' + ID + '">');
    const types = (h.editor.getJSON().content ?? []).map((n) => n.type);
    expect(types).toContain("paragraph");
    expect(types.filter((t) => t === "image")).toHaveLength(1);
    expect(h.element.innerHTML).not.toContain("evil.example");
    expect(h.element.innerHTML).not.toContain("onerror");
  });
});

describe("hiển thị: xin URL ký qua bridge", () => {
  it("chèn → xin URL một lần → gán src → trạng thái ready", () => {
    h = makeEditor();
    h.editor.commands.insertDocImage({ assetId: ID, alt: "ảnh" });
    expect(figure()?.dataset["assetId"]).toBe(ID);
    expect(figure()?.dataset["state"]).toBe("loading");
    expect(img().getAttribute("src")).toBeNull();
    expect(h.requests).toEqual([ID]);

    h.resolver.receive({ assetId: ID, url: "https://cdn.example/1.png" });
    return Promise.resolve().then(() => {
      expect(img().getAttribute("src")).toBe("https://cdn.example/1.png");
      expect(img().alt).toBe("ảnh");
      img().dispatchEvent(new Event("load"));
      expect(figure()?.dataset["state"]).toBe("ready");
    });
  });

  it("URL hết hạn (ảnh lỗi tải): xin lại đúng MỘT lần; vẫn lỗi thì báo lỗi, chạm để thử lại", async () => {
    h = makeEditor();
    h.editor.commands.insertDocImage({ assetId: ID });
    h.resolver.receive({ assetId: ID, url: "https://cdn.example/old.png" });
    await Promise.resolve();
    img().dispatchEvent(new Event("error"));
    expect(h.requests).toEqual([ID, ID]);
    h.resolver.receive({ assetId: ID, url: "https://cdn.example/new.png" });
    await Promise.resolve();
    expect(img().getAttribute("src")).toBe("https://cdn.example/new.png");

    img().dispatchEvent(new Event("error"));
    expect(figure()?.dataset["state"]).toBe("error");
    expect(figure()?.textContent).toContain("Chạm để thử lại");
    expect(h.requests).toHaveLength(2);

    figure()?.click();
    expect(h.requests).toHaveLength(3);
    expect(figure()?.dataset["state"]).toBe("loading");
  });

  it("app trả lỗi (not-found) → trạng thái error", async () => {
    h = makeEditor();
    h.editor.commands.insertDocImage({ assetId: ID });
    h.resolver.receive({ assetId: ID, error: "not-found" });
    await new Promise((r) => setTimeout(r, 0));
    expect(figure()?.dataset["state"]).toBe("error");
  });

  it("chỉ xin URL khi ảnh gần vùng nhìn thấy (IntersectionObserver)", async () => {
    const observers: Array<{ cb: (entries: Array<{ isIntersecting: boolean }>) => void; disconnected: boolean }> = [];
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(cb: (entries: Array<{ isIntersecting: boolean }>) => void) {
          observers.push({ cb, disconnected: false });
        }
        observe() {}
        disconnect() {
          const o = observers.at(-1);
          if (o) o.disconnected = true;
        }
      },
    );
    h = makeEditor();
    h.editor.commands.insertDocImage({ assetId: ID });
    expect(h.requests).toEqual([]);
    observers[0]?.cb([{ isIntersecting: false }]);
    expect(h.requests).toEqual([]);
    observers[0]?.cb([{ isIntersecting: true }]);
    expect(h.requests).toEqual([ID]);
  });

  it("đổi assetId (cập nhật node) xin URL mới; huỷ node không còn gán src trễ", async () => {
    h = makeEditor();
    h.editor.commands.insertDocImage({ assetId: ID });
    h.editor.commands.selectAll();
    h.editor.commands.deleteSelection();
    h.resolver.receive({ assetId: ID, url: "https://cdn.example/late.png" });
    await Promise.resolve();
    expect(h.element.querySelector("figure")).toBeNull();
  });
});

describe("chỉ đọc vẫn hiển thị ảnh", () => {
  it("editable=false không chặn node view", () => {
    h = makeEditor();
    h.editor.commands.insertDocImage({ assetId: ID });
    h.editor.setEditable(false);
    expect(figure()).not.toBeNull();
    expect(cmdCtx(h.editor).editable).toBe(false);
  });
});
