import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { connect, oid, sleep, startHarness, synced, waitFor, type Harness } from "./helpers/harness";

const DOC = oid(1);
const EDITOR = oid(0xa1);
const VIEWER = oid(0xb2);

let h: Harness;
beforeEach(async () => {
  h = await startHarness();
  h.be.addDoc(DOC, { users: { [EDITOR]: "edit", [VIEWER]: "view" } });
});
afterEach(async () => {
  await h.stop();
});

describe("CW-D3 — viewer chỉ đọc", () => {
  it("update của viewer bị từ chối (không tới người khác, không vào BE) nhưng viewer vẫn nhận nội dung của người sửa", async () => {
    const editor = connect(h, { docId: DOC, userId: EDITOR });
    const viewer = connect(h, { docId: DOC, userId: VIEWER, mode: "view" });
    await waitFor(() => synced(editor) && synced(viewer));
    expect(viewer.authenticated).toEqual(["readonly"]);

    editor.text.insert(0, "nội dung của người sửa");
    await waitFor(() => viewer.text.toString() === "nội dung của người sửa", { label: "viewer nhận nội dung" });

    viewer.text.insert(0, "VIEWER-PHÁ-HOẠI ");
    await sleep(400);
    expect(editor.text.toString()).toBe("nội dung của người sửa");
    await waitFor(() => h.be.textOf(DOC) === "nội dung của người sửa");
    expect(h.be.textOf(DOC)).not.toContain("PHÁ-HOẠI");
  });

  it("viewer cố nhồi state qua SyncStep2 (mở lại với thay đổi ngoại tuyến) cũng không được áp", async () => {
    const offlineDoc = (await import("yjs")).Doc;
    const d = new offlineDoc();
    d.getText("t").insert(0, "sửa lén khi chưa kết nối");
    const viewer = connect(h, { docId: DOC, userId: VIEWER, mode: "view", doc: d });
    const editor = connect(h, { docId: DOC, userId: EDITOR });
    await waitFor(() => synced(editor) && synced(viewer));
    await sleep(400);
    expect(editor.text.toString()).toBe("");
    expect(h.be.textOf(DOC)).toBe("");
  });
});
