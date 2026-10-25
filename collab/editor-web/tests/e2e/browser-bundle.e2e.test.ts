/**
 * Kiểm thử bundle THẬT (`dist/editor.html`, sau `npm run build`) trong Chrome/Edge headless qua CDP, nối server collab thật:
 * chứng minh file HTML tự chứa chạy được (script nội tuyến + CSP ghim hash), CSP chặn đúng thứ cần chặn, gõ/IME trong contenteditable thật
 * đồng bộ sang một máy khác, và bridge (`window.__superAppEditor`) hoạt động. KHÔNG thay cho thử trên WebView Android/iOS + bàn phím thật.
 * Bỏ qua khi thiếu bundle, `collab/node_modules` hoặc trình duyệt (đặt `CHROME_PATH` để chỉ định).
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import * as Y from "yjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { msg } from "../helpers/fake-transport";
import { ALICE, BOB, Client, COLLAB_ROOT, COLORS, DOC, HAS_COLLAB, loadHarness, NAMES, type World } from "./support";

const BUNDLE = resolve(import.meta.dirname, "../../dist/editor.html");

function findChrome(): string | undefined {
  const candidates = [
    process.env["CHROME_PATH"],
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ];
  return candidates.find((p): p is string => !!p && existsSync(p));
}

const CHROME = findChrome();
const CAN_RUN = HAS_COLLAB && existsSync(BUNDLE) && !!CHROME;

interface WsLike {
  on(event: "open" | "message" | "close" | "error", cb: (arg?: unknown) => void): void;
  send(data: string): void;
  close(): void;
}

/** Máy khách CDP tối giản (chỉ đủ dùng cho test). */
class Cdp {
  private nextId = 1;
  private readonly pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  readonly events: Array<{ method: string; params: Record<string, unknown> }> = [];

  private constructor(private readonly ws: WsLike) {
    ws.on("message", (data) => {
      const message = JSON.parse(String(data)) as { id?: number; result?: unknown; error?: { message: string }; method?: string; params?: Record<string, unknown> };
      if (message.id !== undefined) {
        const entry = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) entry?.reject(new Error(message.error.message));
        else entry?.resolve(message.result);
      } else if (message.method) this.events.push({ method: message.method, params: message.params ?? {} });
    });
  }

  static async connect(url: string): Promise<Cdp> {
    const WS = createRequire(resolve(COLLAB_ROOT, "package.json"))("ws") as new (url: string) => WsLike;
    const ws = new WS(url);
    await new Promise<void>((res, rej) => {
      ws.on("open", () => res());
      ws.on("error", (e) => rej(e instanceof Error ? e : new Error("CDP lỗi kết nối")));
    });
    return new Cdp(ws);
  }

  send<T = unknown>(method: string, params: object = {}): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolvePromise, reject) => {
      this.pending.set(id, { resolve: resolvePromise as (v: unknown) => void, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate<T>(expression: string): Promise<T> {
    const result = await this.send<{ result: { value?: T }; exceptionDetails?: { text: string; exception?: { description?: string } } }>("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value as T;
  }

  close(): void {
    this.ws.close();
  }
}

async function launchChrome(): Promise<{ child: ChildProcess; dir: string; pageWsUrl: string }> {
  const dir = mkdtempSync(join(tmpdir(), "editor-web-chrome-"));
  const child = spawn(
    CHROME as string,
    ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--remote-debugging-port=0", `--user-data-dir=${dir}`, "--window-size=420,900", "about:blank"],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  const browserUrl = await new Promise<string>((res, rej) => {
    const timer = setTimeout(() => rej(new Error("Chrome không báo cổng DevTools")), 20_000);
    let buffer = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      const m = /DevTools listening on (ws:\/\/[^\s]+)/.exec(buffer);
      if (m?.[1]) {
        clearTimeout(timer);
        res(m[1]);
      }
    });
    child.on("exit", () => rej(new Error("Chrome thoát sớm")));
  });
  const port = new URL(browserUrl).port;
  const targets = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as Array<{ type: string; webSocketDebuggerUrl: string }>;
  const page = targets.find((t) => t.type === "page");
  if (!page) throw new Error("không có tab trong Chrome");
  return { child, dir, pageWsUrl: page.webSocketDebuggerUrl };
}

const w = { clients: [] as Client[] } as World;
let chrome: { child: ChildProcess; dir: string } | undefined;
let cdp: Cdp;

const sent = <T = Record<string, unknown>>(type: string): Promise<Array<{ payload: T }>> =>
  cdp.evaluate(`window.__superAppEditor.sent.filter((m) => m.type === ${JSON.stringify(type)})`);
const lastStatus = async () => (await sent<{ connection: string; readOnly: boolean; unsynced: boolean }>("status")).at(-1)?.payload;
const deliver = (message: unknown) => cdp.evaluate(`window.__superAppEditor.receive(${JSON.stringify(JSON.stringify(message))})`);
const pageText = () => cdp.evaluate<string>("document.querySelector('.tiptap')?.textContent ?? ''");
const consoleProblems = () =>
  cdp.events.filter(
    (e) =>
      e.method === "Runtime.exceptionThrown" ||
      (e.method === "Log.entryAdded" && (e.params["entry"] as { level?: string } | undefined)?.level === "error") ||
      (e.method === "Runtime.consoleAPICalled" && e.params["type"] === "error"),
  );

beforeAll(async () => {
  if (!CAN_RUN) return;
  w.lib = await loadHarness();
  w.h = await w.lib.startHarness();
  w.h.be.addDoc(DOC, { users: { [ALICE]: "edit", [BOB]: "edit" } });
  const launched = await launchChrome();
  chrome = launched;
  cdp = await Cdp.connect(launched.pageWsUrl);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Log.enable");
  await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await cdp.send("Page.navigate", { url: pathToFileURL(BUNDLE).href });
}, 60_000);

afterAll(async () => {
  cdp?.close();
  for (const c of w.clients.splice(0)) c.destroy();
  await w.h?.stop();
  if (chrome) {
    const exited = new Promise<void>((r) => chrome!.child.once("exit", () => r()));
    chrome.child.kill();
    await Promise.race([exited, new Promise((r) => setTimeout(r, 5_000))]);
    try {
      rmSync(chrome.dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
    } catch {
      /* Windows có thể còn giữ khoá tệp của Chrome; thư mục tạm sẽ được HĐH dọn */
    }
  }
}, 30_000);

/** `waitFor` của harness nhận hàm đồng bộ; bản này chờ hàm bất đồng bộ. */
async function until(check: () => Promise<boolean> | boolean, label: string, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`quá hạn: ${label}`);
}

describe.skipIf(!CAN_RUN)("bundle dist/editor.html trong Chrome thật", () => {
  it("nạp được (script nội tuyến + CSP ghim hash) và báo ready qua bridge", async () => {
    await until(() => cdp.evaluate<boolean>("!!window.__superAppEditor?.sent?.some((m) => m.type === 'ready')"), "ready");
    const ready = (await sent<{ protocol: number; bundle: string; commands: string[] }>("ready"))[0]?.payload;
    expect(ready?.protocol).toBe(1);
    expect(ready?.commands).toContain("heading");
    const csp = await cdp.evaluate<string>("document.querySelector('meta[http-equiv=\"Content-Security-Policy\"]').content");
    expect(csp).toMatch(/script-src 'sha256-[A-Za-z0-9+/]{43}='/);
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(await cdp.evaluate<number>("document.querySelectorAll('script[src], link[href]').length")).toBe(0);
  });

  it("CW-05 thật: gõ trong contenteditable của Chrome → máy khác nhận; máy khác gõ → Chrome nhận; hiện diện đủ 2 người", async () => {
    await deliver(
      msg("init", {
        url: `ws://127.0.0.1:${w.h.port}/collab`,
        token: w.lib.signToken({ userId: ALICE, docId: DOC }),
        documentName: `doc:${DOC}`,
        mode: "edit",
        user: { id: ALICE, name: NAMES[ALICE], color: COLORS[ALICE] },
      }),
    );
    await until(async () => (await lastStatus())?.connection === "synced", "Chrome đồng bộ");
    expect(await cdp.evaluate<string>("document.querySelector('.tiptap').getAttribute('contenteditable')")).toBe("true");

    const bob = new Client(w, { userId: BOB });
    await bob.waitSynced();

    await cdp.evaluate("document.querySelector('.tiptap').focus()");
    await cdp.send("Input.insertText", { text: "Xin chào từ Chrome. " });
    await w.lib.waitFor(() => bob.text.includes("Xin chào từ Chrome."), { label: "Bob nhận chữ từ Chrome" });

    bob.editor.commands.focus("end");
    bob.editor.commands.insertContent("Bob trả lời.");
    await until(async () => (await pageText()).includes("Bob trả lời."), "Chrome nhận chữ của Bob");

    type Presence = { users: Array<{ id: string; name: string; color: string; self: boolean }>; count: number };
    await until(async () => (await sent<Presence>("awareness")).at(-1)?.payload.count === 2, "hiện diện 2 người");
    const users = (await sent<Presence>("awareness")).at(-1)?.payload;
    expect(users?.count).toBe(2);
    expect(users?.users.map((u) => [u.name, u.self])).toEqual([
      [NAMES[ALICE], true],
      [NAMES[BOB], false],
    ]);
    await until(async () => (await lastStatus())?.unsynced === false, "server đã xác nhận");
  });

  it("gõ tiếng Việt qua IME (composition Telex mô phỏng): kết quả đúng, không nhân đôi ký tự, đồng bộ sang máy khác", async () => {
    const bob = w.clients[0] as Client;
    await cdp.evaluate("(() => { const e = document.querySelector('.tiptap'); e.focus(); getSelection().selectAllChildren(e); getSelection().collapseToEnd(); })()");
    for (const step of ["V", "Vi", "Việ"]) await cdp.send("Input.imeSetComposition", { text: step, selectionStart: step.length, selectionEnd: step.length });
    await cdp.send("Input.insertText", { text: "Việt" });
    await cdp.send("Input.insertText", { text: " Nam" });
    await until(async () => (await pageText()).includes("Việt Nam"), "Chrome hiển thị chữ đã ghép");
    const text = await pageText();
    expect(text.match(/Việt Nam/g)).toHaveLength(1);
    expect(text).not.toMatch(/VVi|Viiệ|Việtt/);
    await w.lib.waitFor(() => bob.text.includes("Việt Nam"), { label: "Bob nhận chữ tiếng Việt" });
  });

  it("lệnh toolbar qua bridge tác động lên editor thật; chọn tất cả rồi in đậm", async () => {
    await cdp.evaluate("(() => { const e = document.querySelector('.tiptap'); e.focus(); getSelection().selectAllChildren(e); })()");
    await deliver(msg("command", { name: "bold", requestId: "b1" }));
    await until(async () => (await sent<{ requestId: string; ok: boolean }>("commandResult")).some((r) => r.payload.requestId === "b1" && r.payload.ok), "commandResult ok");
    expect(await cdp.evaluate<string>("document.querySelector('.tiptap').innerHTML")).toContain("<strong>");
    const sel = (await sent<{ bold: boolean; canEdit: boolean }>("selectionState")).at(-1)?.payload;
    expect(sel).toMatchObject({ bold: true, canEdit: true });
  });

  it("CSP chặn thật: handler nội tuyến, tải ảnh/kết nối HTTP ra ngoài; không có lỗi console nào trước đó", async () => {
    expect(consoleProblems().map((e) => JSON.stringify(e.params).slice(0, 300))).toEqual([]);
    await cdp.evaluate("document.body.insertAdjacentHTML('beforeend', '<img alt=\"x\" src=\"data:image/gif;base64,R0lGODlhAQABAAAAACw=\" onload=\"window.__pwned=1\">')");
    await new Promise((r) => setTimeout(r, 300));
    expect(await cdp.evaluate<unknown>("window.__pwned")).toBeUndefined();
    const fetchResult = await cdp.evaluate<string>("fetch('http://127.0.0.1:1/').then(() => 'allowed', () => 'blocked')");
    expect(fetchResult).toBe("blocked");
    const violated = cdp.events.some((e) => JSON.stringify(e.params).includes("Content Security Policy"));
    expect(violated).toBe(true);
  });

  it("xem phiên bản lịch sử (snapshot) trong Chrome: chỉ đọc, hiển thị nội dung", async () => {
    const bob = w.clients[0] as Client;
    const state = Buffer.from(Y.encodeStateAsUpdate((bob.controller as unknown as { doc: Y.Doc }).doc)).toString("base64");
    await deliver(msg("init", { source: "snapshot", yjsState: state }));
    await until(async () => (await pageText()).includes("Việt Nam"), "snapshot hiển thị");
    expect(await cdp.evaluate<string>("document.querySelector('.tiptap').getAttribute('contenteditable')")).toBe("false");
    const status = await lastStatus();
    expect(status).toMatchObject({ connection: "synced", readOnly: true });
  });

  it("dispose dọn editor", async () => {
    await deliver(msg("dispose", {}));
    await until(async () => (await cdp.evaluate<number>("document.querySelectorAll('.tiptap').length")) === 0, "editor đã gỡ");
  });
});
