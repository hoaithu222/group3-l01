/**
 * Kiểm thử ĐẦU–CUỐI: editor (Tiptap + HocuspocusProvider thật) ↔ server collab THẬT (`../../src`) + BE giả bằng HTTP thật.
 * Chứng minh hợp đồng token/URL/documentName/awareness/mã đóng mà `collab/README.md` §3 chốt.
 * Chỉ chạy khi `collab/node_modules` đã cài (CI chỉ cài editor-web sẽ bỏ qua); mượn harness của chính package collab.
 */
import * as Y from "yjs";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { msg } from "../helpers/fake-transport";
import { WRONG_SIGNING_KEY } from "../fixtures/secrets";
import { ALICE, BOB, CAROL, Client, type ClientOptions, COLORS, DAVE, DOC, HAS_COLLAB, loadHarness, type World } from "./support";

const w = { clients: [] as Client[] } as World;
const open = (o: ClientOptions): Client => new Client(w, o);

beforeAll(async () => {
  if (HAS_COLLAB) w.lib = await loadHarness();
});

describe.skipIf(!HAS_COLLAB)("editor-web ↔ collab server thật", () => {
  beforeEach(async () => {
    w.h = await w.lib.startHarness();
    w.h.be.addDoc(DOC, { users: { [ALICE]: "edit", [BOB]: "edit", [CAROL]: "view" } });
  });
  afterEach(async () => {
    for (const c of w.clients.splice(0)) c.destroy();
    await w.h.stop();
  });

  it("CW-05: hai người gõ → hội tụ; awareness có tên/màu; BE nhận state có fragment `default`", async () => {
    const a = open({ userId: ALICE });
    const b = open({ userId: BOB });
    await Promise.all([a.waitSynced(), b.waitSynced()]);
    expect(a.status).toMatchObject({ readOnly: false, mode: "edit" });

    a.editor.commands.insertContent("Xin chào từ An");
    await w.lib.waitFor(() => b.text === "Xin chào từ An", { label: "Bình thấy chữ của An" });
    b.editor.commands.focus("end");
    b.editor.commands.insertContent(" — Bình trả lời");
    await w.lib.waitFor(() => a.text === b.text && a.text.includes("Bình trả lời"), { label: "hội tụ" });
    expect(a.editor.getJSON()).toEqual(b.editor.getJSON());

    await w.lib.waitFor(() => a.transport.last("awareness")?.count === 2 && b.transport.last("awareness")?.count === 2, { label: "presence 2 người" });
    expect(a.transport.last("awareness")?.users).toEqual([
      { id: ALICE, name: "An", color: COLORS[ALICE], self: true },
      { id: BOB, name: "Bình", color: COLORS[BOB], self: false },
    ]);

    await w.lib.waitFor(() => a.status?.unsynced === false, { label: "server đã xác nhận" });
    await w.lib.waitFor(() => w.h.be.docs.get(DOC)!.state.byteLength > 0, { label: "BE đã lưu" });
    const stored = new Y.Doc();
    Y.applyUpdate(stored, w.h.be.docs.get(DOC)!.state);
    expect([...stored.share.keys()]).toEqual(["default"]);
    expect(stored.getXmlFragment("default").toString()).toContain("Xin chào từ An");
  });

  it("CW-D3: người chỉ xem nhận nội dung nhưng không sửa được; nếu cố gửi update thì server không áp", async () => {
    const a = open({ userId: ALICE });
    const c = open({ userId: CAROL, mode: "view" });
    await Promise.all([a.waitSynced(), c.waitSynced()]);
    expect(c.status).toMatchObject({ mode: "view", readOnly: true, connection: "synced" });
    expect(c.editor.isEditable).toBe(false);
    expect(c.transport.last("selectionState")).toMatchObject({ canEdit: false });

    a.editor.commands.insertContent("nội dung của An");
    await w.lib.waitFor(() => c.text === "nội dung của An", { label: "viewer nhận update" });

    // Ép sửa cục bộ (như client độc hại/lỗi) — server phải từ chối, không lưu, không phát cho người khác.
    c.editor.setEditable(true);
    c.editor.commands.focus("end");
    c.editor.commands.insertContent(" [viewer chèn lén]");
    await w.lib.sleep(500);
    expect(a.text).toBe("nội dung của An");
    await w.lib.waitFor(() => w.h.be.docs.get(DOC)!.state.byteLength > 0);
    const stored = new Y.Doc();
    Y.applyUpdate(stored, w.h.be.docs.get(DOC)!.state);
    expect(stored.getXmlFragment("default").toString()).not.toContain("chèn lén");
    expect(c.status?.unsynced).toBe(false); // chỉ đọc: không hiện "đang đồng bộ" mãi
  });

  it("forbidden: dừng hẳn, báo FORBIDDEN, KHÔNG nối lại (không dội BE)", async () => {
    const d = open({ userId: DAVE }); // không có ACL
    await w.lib.waitFor(() => d.transport.of("error").length > 0, { label: "nhận lỗi" });
    expect(d.transport.of("error")[0]).toMatchObject({ code: "FORBIDDEN", fatal: true });
    expect(d.status).toMatchObject({ connection: "closed" });
    const accessCalls = () => w.h.be.calls.filter((c) => c.op === "access" && c.userId === DAVE).length;
    const before = accessCalls();
    await w.lib.sleep(2500); // provider mặc định nối lại sau ~1 s — nếu chưa dừng sẽ thấy thêm lời gọi
    expect(accessCalls()).toBe(before);
    expect(d.transport.of("error")).toHaveLength(1);
  });

  it("thu hồi giữa phiên (kick revoked → nối lại → forbidden): dừng, giữ nội dung đang hiển thị", async () => {
    const b = open({ userId: BOB });
    await b.waitSynced();
    b.editor.commands.insertContent("bản nháp của Bình");
    w.h.be.docs.get(DOC)!.acl.delete(BOB);
    const res = await w.lib.internal(w.h, "/internal/kick", { docId: DOC, userId: BOB, reason: "revoked" });
    expect(res).toMatchObject({ status: 200 });
    await w.lib.waitFor(() => b.transport.of("error").some((e) => e.code === "FORBIDDEN"), { timeoutMs: 10_000, label: "nhận FORBIDDEN sau khi nối lại" });
    expect(b.status).toMatchObject({ connection: "closed" });
  });

  it("CW-D5: token hết hạn khi mất kết nối → xin token mới qua bridge trước khi nối lại (không bị từ chối)", async () => {
    const a = open({ userId: ALICE, tokenTtlSeconds: 2, tokenWaitMs: 4000 });
    await a.waitSynced();
    await w.lib.sleep(2600); // token đã quá hạn (chỉ được kiểm lúc thiết lập kết nối)
    expect(a.status?.connection).toBe("synced");

    await w.lib.internal(w.h, "/internal/kick", { docId: DOC, userId: ALICE, reason: "revoked" });
    await w.lib.waitFor(() => a.transport.of("requestToken").length > 0, { timeoutMs: 8000, label: "editor xin token mới" });
    expect(a.transport.of("requestToken")[0]).toEqual({ reason: "expired", attempt: 1 });
    a.transport.deliver(msg("setToken", { token: a.token(300), expiresAt: Date.now() + 300_000 }));
    await w.lib.waitFor(() => a.status?.connection === "synced", { timeoutMs: 8000, label: "nối lại bằng token mới" });
    expect(a.transport.of("error")).toEqual([]);
    expect(a.transport.of("requestToken")).toHaveLength(1);
  });

  it("token bị server từ chối (unauthorized): dừng nối, xin token mới qua bridge, nối lại được; không dội server", async () => {
    // Sai chữ ký ⇒ `unauthorized` (token chỉ hết hạn ≤ 5 s thì server còn khoan dung — `clockTolerance` 5 s).
    const bad = w.lib.signToken({ userId: ALICE, docId: DOC, secret: WRONG_SIGNING_KEY });
    const a = open({ userId: ALICE, initialToken: bad });
    await w.lib.waitFor(() => a.transport.of("requestToken").length > 0, { timeoutMs: 8000, label: "xin token do unauthorized" });
    expect(a.transport.of("requestToken")).toEqual([{ reason: "unauthorized", attempt: 1 }]);
    await w.lib.sleep(2500); // provider mặc định nối lại sau ~1 s bằng token cũ — editor phải đã dừng
    expect(a.transport.of("requestToken")).toHaveLength(1);
    expect(w.h.be.calls.filter((c) => c.op === "access")).toHaveLength(0);

    a.transport.deliver(msg("setToken", { token: a.token(300) }));
    await a.waitSynced();
    expect(a.transport.of("error")).toEqual([]);
  });

  it("app không cấp được token hợp lệ (2 lần liên tiếp bị từ chối) → AUTH_EXPIRED, không nối lại tiếp", async () => {
    const bad = w.lib.signToken({ userId: ALICE, docId: DOC, secret: WRONG_SIGNING_KEY });
    const a = open({ userId: ALICE, initialToken: bad });
    for (let i = 1; i <= 2; i += 1) {
      await w.lib.waitFor(() => a.transport.of("requestToken").length === i, { timeoutMs: 8000, label: `xin token lần ${i}` });
      a.transport.deliver(msg("setToken", { token: bad }));
    }
    await w.lib.waitFor(() => a.transport.of("error").some((e) => e.code === "AUTH_EXPIRED"), { timeoutMs: 8000, label: "AUTH_EXPIRED" });
    expect(a.transport.of("requestToken")).toHaveLength(2);
    expect(a.status?.connection).not.toBe("synced");
  });

  it("CW-06: gõ khi mất kết nối rồi nối lại → hợp nhất với người khác, không mất ký tự", async () => {
    const a = open({ userId: ALICE });
    const b = open({ userId: BOB });
    await Promise.all([a.waitSynced(), b.waitSynced()]);
    a.editor.commands.insertContent("gốc. ");
    await w.lib.waitFor(() => b.text === "gốc. ");

    await w.lib.internal(w.h, "/internal/kick", { docId: DOC, userId: ALICE, reason: "revoked" }); // A rớt kết nối
    await w.lib.waitFor(() => a.status?.connection === "offline", { label: "A offline" });
    a.editor.commands.focus("end");
    a.editor.commands.insertContent("A gõ lúc offline. ");
    expect(a.editor.isEditable).toBe(true);
    b.editor.commands.focus("end");
    b.editor.commands.insertContent("B gõ trong lúc đó.");

    await w.lib.waitFor(() => a.status?.connection === "synced" && a.status.unsynced === false, { timeoutMs: 10_000, label: "A nối lại" });
    await w.lib.waitFor(() => a.text === b.text, { timeoutMs: 8000, label: "hội tụ sau nối lại" });
    for (const piece of ["gốc.", "A gõ lúc offline.", "B gõ trong lúc đó."]) expect(a.text).toContain(piece);
  });

  it("lưu trữ tài liệu (kick archived) → chuyển chỉ đọc + cờ archived, nối lại ở chế độ xem", async () => {
    const a = open({ userId: ALICE });
    await a.waitSynced();
    w.h.be.docs.get(DOC)!.status = "ARCHIVED";
    await w.lib.internal(w.h, "/internal/kick", { docId: DOC, reason: "archived" });
    await w.lib.waitFor(() => a.status?.archived === true, { label: "cờ archived" });
    await w.lib.waitFor(() => a.status?.connection === "synced" && a.status.readOnly, { timeoutMs: 10_000, label: "nối lại chỉ đọc" });
    expect(a.status).toMatchObject({ archived: true, mode: "view", readOnly: true });
    expect(a.editor.isEditable).toBe(false);
  });

  it("BE lưu lỗi tạm thời: SAVE_FAILED rồi SAVE_RECOVERED; vẫn gõ được và các máy vẫn đồng bộ", async () => {
    const a = open({ userId: ALICE });
    const b = open({ userId: BOB });
    await Promise.all([a.waitSynced(), b.waitSynced()]);
    w.h.be.failPuts = 2;
    a.editor.commands.insertContent("lưu lỗi tạm");
    await w.lib.waitFor(() => a.transport.of("notice").some((n) => n.code === "SAVE_FAILED"), { timeoutMs: 8000, label: "SAVE_FAILED" });
    expect(a.status?.saveFailed).toBe(true);
    expect(a.editor.isEditable).toBe(true);
    await w.lib.waitFor(() => b.text === "lưu lỗi tạm", { label: "B vẫn nhận" });
    await w.lib.waitFor(() => a.status?.saveFailed === false, { timeoutMs: 10_000, label: "SAVE_RECOVERED" });
    expect(a.transport.of("notice").map((n) => n.code)).toEqual(["SAVE_FAILED", "SAVE_RECOVERED"]);
  });
});
