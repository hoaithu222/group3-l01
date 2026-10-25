import { afterEach, describe, expect, it, vi } from "vitest";
import { createWebViewTransport, type TransportWindow } from "../src/transport";
import { presenceFromStates } from "../src/presence";
import { parseNotice } from "../src/notices";
import type { EditorMessage } from "../src/bridge-protocol";

const READY: EditorMessage = { v: 1, type: "ready", payload: { protocol: 1, bundle: "0.0.0", commands: [] } };

function fakeWindow(extra: Partial<TransportWindow> = {}) {
  const w = new EventTarget();
  const d = new EventTarget();
  const win = {
    addEventListener: (t: "message", l: (e: MessageEvent) => void) => w.addEventListener(t, l as EventListener),
    removeEventListener: (t: "message", l: (e: MessageEvent) => void) => w.removeEventListener(t, l as EventListener),
    document: {
      addEventListener: (t: "message", l: (e: Event) => void) => d.addEventListener(t, l),
      removeEventListener: (t: "message", l: (e: Event) => void) => d.removeEventListener(t, l),
    },
    ...extra,
  } as TransportWindow;
  return { win, w, d };
}

afterEach(() => vi.restoreAllMocks());

describe("createWebViewTransport", () => {
  it("nhận tin từ window (iOS) và document (Android); tin nổi bọt từ document lên window chỉ xử lý MỘT lần", () => {
    const { win, w, d } = fakeWindow();
    const received: unknown[] = [];
    createWebViewTransport(win).subscribe((raw) => received.push(raw));
    w.dispatchEvent(Object.assign(new Event("message"), { data: "ios" }));
    d.dispatchEvent(Object.assign(new Event("message"), { data: "android" }));
    // cùng một đối tượng sự kiện tới cả hai nơi (nổi bọt)
    const bubbled = Object.assign(new Event("message"), { data: "both" });
    d.dispatchEvent(bubbled);
    w.dispatchEvent(bubbled);
    expect(received).toEqual(["ios", "android", "both"]);
  });

  it("__superAppEditor.receive (injectJavaScript) chuyển tới người nghe", () => {
    const { win } = fakeWindow();
    const received: unknown[] = [];
    createWebViewTransport(win).subscribe((raw) => received.push(raw));
    win.__superAppEditor?.receive('{"v":1}');
    expect(received).toEqual(['{"v":1}']);
    expect(win.__superAppEditor?.protocol).toBe(1);
  });

  it("gửi qua ReactNativeWebView.postMessage dạng chuỗi JSON, lưu vết trong `sent`", () => {
    const postMessage = vi.fn();
    const { win } = fakeWindow({ ReactNativeWebView: { postMessage } });
    createWebViewTransport(win).send(READY);
    expect(postMessage).toHaveBeenCalledWith(JSON.stringify(READY));
    expect(win.__superAppEditor?.sent).toEqual([READY]);
  });

  it("ngoài RN: gửi lên khung cha nếu là iframe; nếu cha chính là window thì KHÔNG gửi (tránh dội lại thành tin lạ)", () => {
    const parent = { postMessage: vi.fn() };
    const { win } = fakeWindow({ parent });
    createWebViewTransport(win).send(READY);
    expect(parent.postMessage).toHaveBeenCalledWith(JSON.stringify(READY), "*");

    const self = fakeWindow();
    const selfParent = { postMessage: vi.fn() };
    Object.assign(self.win, { parent: self.win });
    Object.assign(self.win, { postMessage: selfParent.postMessage });
    createWebViewTransport(self.win).send(READY);
    expect(selfParent.postMessage).not.toHaveBeenCalled();
  });

  it("vòng đệm `sent` giới hạn 200 tin; huỷ đăng ký ngừng nhận", () => {
    const { win } = fakeWindow({ ReactNativeWebView: { postMessage: () => undefined } });
    const transport = createWebViewTransport(win);
    for (let i = 0; i < 250; i += 1) transport.send(READY);
    expect(win.__superAppEditor?.sent).toHaveLength(200);
    const received: unknown[] = [];
    const off = transport.subscribe((r) => received.push(r));
    off();
    win.__superAppEditor?.receive("x");
    expect(received).toEqual([]);
  });
});

describe("presenceFromStates", () => {
  const states = new Map<number, unknown>([
    [1, { user: { id: "b", name: "Bình", color: "#B42318" } }],
    [2, { user: { id: "a", name: "An", color: "#175CD3" }, cursor: { anchor: 1, head: 1 } }],
    [3, { user: { id: "a", name: "An (máy 2)", color: "#175CD3" } }],
    [4, { cursor: { anchor: 0, head: 0 } }],
    [5, null],
    [6, "chuỗi"],
    [7, { user: { id: "", name: "x", color: "#000000" } }],
    [8, { user: { id: "me", name: "Tôi", color: "#027A48" } }],
  ]);

  it("mỗi người một dòng, mình đứng đầu, sau đó theo tên; bỏ state không có user hợp lệ", () => {
    expect(presenceFromStates(states, "me").map((u) => [u.id, u.self])).toEqual([
      ["me", true],
      ["a", false],
      ["b", false],
    ]);
    expect(presenceFromStates(states, "nobody").every((u) => !u.self)).toBe(true);
  });
});

describe("parseNotice", () => {
  it("nhận mã đã biết", () => {
    expect(parseNotice('{"v":1,"type":"notice","code":"SAVE_FAILED"}')).toBe("SAVE_FAILED");
  });
  it.each(["", "không phải json", "null", "[]", '{"v":2,"type":"notice","code":"SAVE_FAILED"}', '{"v":1,"type":"x","code":"SAVE_FAILED"}', '{"v":1,"type":"notice","code":"NEW"}', '{"v":1,"type":"notice","code":5}'])("bỏ qua %j", (payload) => {
    expect(parseNotice(payload)).toBeNull();
  });
});
