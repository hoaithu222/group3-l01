jest.mock("../../../infrastructure/redis", () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn(), incr: jest.fn(), expire: jest.fn(), ping: jest.fn() },
}));

import jwt from "jsonwebtoken";
import * as Y from "yjs";
import { DOCUMENT_FRAGMENT } from "../../../shared/collab";
import { LIMITS } from "../../../core/constants/limits";
import { newObjectId } from "../../../core/utils/object-id";
import { DocumentsHarness } from "./support/documents-harness";

const SECRET = "harness-collab-secret-0123456789-abcdefghij";

let h: DocumentsHarness;
beforeEach(() => {
  h = new DocumentsHarness();
});
afterEach(() => h.dispose());

const setup = async (visibility: "WORKSPACE" | "PRIVATE" = "WORKSPACE") => {
  const creator = h.addUser("MEMBER");
  const doc = await h.service.create(creator, h.workspaceId, { title: "Tài liệu", visibility });
  return { creator, doc };
};

/** Y.Doc có một đoạn văn — cùng cấu trúc Tiptap ghi. */
function stateWith(...paragraphs: string[]): Uint8Array {
  const d = new Y.Doc();
  for (const text of paragraphs) {
    const p = new Y.XmlElement("paragraph");
    const t = new Y.XmlText();
    t.insert(0, text);
    p.insert(0, [t]);
    d.getXmlFragment(DOCUMENT_FRAGMENT).push([p]);
  }
  return Y.encodeStateAsUpdate(d);
}
const textOf = (state: Uint8Array | null): string[] => {
  const d = new Y.Doc();
  if (state) Y.applyUpdate(d, state);
  return d.getXmlFragment(DOCUMENT_FRAGMENT).toArray().map((n) => (n as Y.XmlElement).toArray().map((t) => (t as Y.XmlText).toString()).join(""));
};

describe("collab-token", () => {
  it("MEMBER → mode edit; khách VIEWER → view; ARCHIVED → view; token ký bằng bí mật collab, có sv hiện tại của user", async () => {
    const { creator, doc } = await setup();
    const guest = h.addUser("GUEST");
    await h.collaborators.add(creator, doc.id, { userIds: [guest.id], role: "VIEWER" });
    h.directory.usersById.set(creator.id, { ...(h.directory.usersById.get(creator.id) ?? { id: creator.id, name: "x", status: "ACTIVE" }), sessionVersion: 9 });

    const edit = await h.collabService.issueToken(creator, doc.id);
    expect(edit).toMatchObject({ mode: "edit", url: "wss://collab.test/collab", documentName: `doc:${doc.id}`, limits: { stateMaxBytes: LIMITS.document.stateMaxBytes } });
    expect(edit.user.color).toMatch(/^#[0-9A-F]{6}$/);
    const payload = jwt.verify(edit.token, SECRET, { algorithms: ["HS256"], audience: "collab", issuer: "superapp-be", clockTolerance: 1e9 }) as jwt.JwtPayload;
    expect(payload).toMatchObject({ sub: creator.id, kind: "document", docId: doc.id, mode: "edit", sv: 9 });

    expect((await h.collabService.issueToken(guest, doc.id)).mode).toBe("view");
    await h.service.archive(creator, doc.id, {});
    expect((await h.collabService.issueToken(creator, doc.id)).mode).toBe("view");
  });

  it("PRIVATE với OWNER nhóm không phải cộng tác viên → 404 (không cấp token)", async () => {
    const { doc } = await setup("PRIVATE");
    await expect(h.collabService.issueToken(h.addUser("OWNER"), doc.id)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("internal access (collab hỏi BE)", () => {
  it("allowed + mode + user + workspaceId + trần kết nối; không được vào → allowed=false; sv lệch/khoá tài khoản → SESSION_REVOKED; không có tài liệu → 404", async () => {
    const { creator, doc } = await setup();
    const viewer = h.addUser("MEMBER");
    const outsider = h.addUser("GUEST");
    await h.collaborators.add(creator, doc.id, { userIds: [viewer.id], role: "VIEWER" });

    expect(await h.collabService.access(doc.id, creator.id, 1)).toMatchObject({ allowed: true, mode: "edit", workspaceId: h.workspaceId, user: { id: creator.id }, limits: { maxConnections: LIMITS.document.concurrentEditorsMax } });
    // MEMBER thấy tài liệu WORKSPACE và sửa được (viewer chỉ là dòng cộng tác trên tài liệu WORKSPACE).
    expect(await h.collabService.access(doc.id, outsider.id, 1)).toEqual({ allowed: false, reason: "FORBIDDEN" });
    expect(await h.collabService.access(doc.id, creator.id, 2)).toEqual({ allowed: false, reason: "SESSION_REVOKED" });
    h.directory.usersById.set(creator.id, { id: creator.id, name: "x", status: "LOCKED", sessionVersion: 1 });
    expect(await h.collabService.access(doc.id, creator.id, 1)).toEqual({ allowed: false, reason: "SESSION_REVOKED" });
    await expect(h.collabService.access(newObjectId(), creator.id, 1)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("tài liệu PRIVATE: cộng tác viên VIEWER → view; OWNER nhóm lạ → FORBIDDEN; ARCHIVED → view cho mọi người", async () => {
    const { creator, doc } = await setup("PRIVATE");
    const viewer = h.addUser("MEMBER");
    const owner = h.addUser("OWNER");
    await h.collaborators.add(creator, doc.id, { userIds: [viewer.id], role: "VIEWER" });
    expect(await h.collabService.access(doc.id, viewer.id, 1)).toMatchObject({ allowed: true, mode: "view" });
    expect(await h.collabService.access(doc.id, owner.id, 1)).toEqual({ allowed: false, reason: "FORBIDDEN" });
    await h.service.archive(creator, doc.id, {});
    expect(await h.collabService.access(doc.id, creator.id, 1)).toMatchObject({ allowed: true, mode: "view" });
  });
});

describe("internal state (collab lưu/tải)", () => {
  it("state rỗng ban đầu; PUT ghi state + version tăng + người sửa cuối + outbox document.plaintext (khoá dedupe theo version, trễ 5 s)", async () => {
    const { creator, doc } = await setup();
    expect(await h.collabService.getState(doc.id)).toEqual({ state: new Uint8Array(), yjsVersion: 0 });

    const state = stateWith("xin chào");
    h.outbox.events.length = 0;
    const res = await h.collabService.putState(doc.id, state, 0, creator.id);
    expect(res).toEqual({ yjsVersion: 1, merged: false });
    expect(textOf((await h.collabService.getState(doc.id)).state)).toEqual(["xin chào"]);
    const stored = h.docs.rows.get(doc.id);
    expect(stored).toMatchObject({ yjsVersion: 1, lastEditedBy: creator.id, stateBytes: state.byteLength });
    expect(h.outbox.events).toHaveLength(1);
    expect(h.outbox.events[0]).toMatchObject({ queue: "reports", jobName: "document.plaintext", dedupeKey: `document.plaintext:document:${doc.id}:1`, delayMs: 5000, payload: { documentId: doc.id, yjsVersion: 1 } });
  });

  it("base version cũ hơn hiện tại (ai đó ghi xen: khôi phục/instance khác) → BE HỢP NHẤT, không ghi đè; version = max(hiện tại, base) + 1", async () => {
    const { doc } = await setup();
    const clientDoc = new Y.Doc();
    const p = new Y.XmlElement("paragraph");
    clientDoc.getXmlFragment(DOCUMENT_FRAGMENT).push([p]);
    await h.collabService.putState(doc.id, Y.encodeStateAsUpdate(clientDoc), 0); // v1
    // "BE khôi phục" ghi state mới độc lập (thêm một đoạn) → v2
    const restored = new Y.Doc();
    Y.applyUpdate(restored, (await h.collabService.getState(doc.id)).state);
    restored.getXmlFragment(DOCUMENT_FRAGMENT).push([new Y.XmlElement("heading")]);
    await h.collabService.putState(doc.id, Y.encodeStateAsUpdate(restored), 1); // v2
    // Collab (base 1, chưa biết bản khôi phục) lưu state của nó có thêm một đoạn → phải hợp nhất
    clientDoc.getXmlFragment(DOCUMENT_FRAGMENT).push([new Y.XmlElement("codeBlock")]);
    const res = await h.collabService.putState(doc.id, Y.encodeStateAsUpdate(clientDoc), 1);
    expect(res).toEqual({ yjsVersion: 3, merged: true });
    const merged = new Y.Doc();
    Y.applyUpdate(merged, (await h.collabService.getState(doc.id)).state);
    expect(merged.getXmlFragment(DOCUMENT_FRAGMENT).toArray().map((n) => (n as Y.XmlElement).nodeName).sort()).toEqual(["codeBlock", "heading", "paragraph"]);
  });

  it("đua ghi (CAS thất bại một lần) → đọc lại và ghi lại, không mất lần lưu", async () => {
    const { doc } = await setup();
    const real = h.docs.writeState.bind(h.docs);
    let calls = 0;
    jest.spyOn(h.docs, "writeState").mockImplementation(async (...args) => {
      calls += 1;
      return calls === 1 ? null : real(...args);
    });
    const res = await h.collabService.putState(doc.id, stateWith("a"), 0);
    expect(res.yjsVersion).toBe(1);
    expect(calls).toBe(2);
  });

  it("từ chối: đã lưu trữ → 409 DOC_008; quá dung lượng → 413 DOC_006; không có tài liệu → 404; X-Last-Editor rác bị bỏ qua", async () => {
    const { creator, doc } = await setup();
    await h.collabService.putState(doc.id, stateWith("x"), 0, "không-phải-objectid");
    expect(h.docs.rows.get(doc.id)?.lastEditedBy).toBeNull();
    await expect(h.collabService.putState(doc.id, new Uint8Array(LIMITS.document.stateMaxBytes + 1), 1)).rejects.toMatchObject({ statusCode: 413, errorCode: "DOC_006" });
    await h.service.archive(creator, doc.id, {});
    await expect(h.collabService.putState(doc.id, stateWith("y"), 1)).rejects.toMatchObject({ statusCode: 409, errorCode: "DOC_008" });
    await expect(h.collabService.putState(newObjectId(), stateWith("z"), 0)).rejects.toMatchObject({ statusCode: 404 });
  });
});
