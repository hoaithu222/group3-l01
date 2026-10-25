import * as Y from "yjs";
import { WhiteboardStateInspector } from "../services/whiteboard-state-inspector.service";
import { buildState, elementOf } from "./support/whiteboards-harness";

const inspector = new WhiteboardStateInspector();

describe("WhiteboardStateInspector — BE tự đếm phần tử từ Yjs", () => {
  it("state rỗng/null → 0 phần tử", () => {
    expect(inspector.inspect(null)).toEqual({ elementCount: 0, orderCount: 0, invalidElements: 0 });
    expect(inspector.inspect(new Uint8Array())).toEqual({ elementCount: 0, orderCount: 0, invalidElements: 0 });
    expect(inspector.count(null)).toBe(0);
  });

  it("đếm đúng số phần tử và độ dài order; phần tử hợp lệ không bị tính là sai", () => {
    const state = buildState(Array.from({ length: 7 }, (_v, i) => elementOf(`e${i}`)));
    expect(inspector.inspect(state)).toEqual({ elementCount: 7, orderCount: 7, invalidElements: 0 });
    expect(inspector.count(state)).toBe(7);
  });

  it("phần tử đã xoá (Y.Map.delete) không còn được đếm", () => {
    const doc = new Y.Doc();
    Y.applyUpdate(doc, buildState([elementOf("a"), elementOf("b"), elementOf("c")]));
    doc.getMap("elements").delete("b");
    expect(inspector.inspect(Y.encodeStateAsUpdate(doc))).toMatchObject({ elementCount: 2 });
  });

  it("đếm phần tử sai schema (loại lạ, points > 1000, khoá ≠ id, thiếu trường) nhưng KHÔNG ném lỗi", () => {
    const state = buildState([
      elementOf("ok"),
      elementOf("kind", { type: "kiểu-lạ" }),
      elementOf("long", { type: "freehand", points: Array.from({ length: 1002 }, (_v, i) => i) }),
      elementOf("kept"),
    ]);
    const doc = new Y.Doc();
    Y.applyUpdate(doc, state);
    // Khoá lệch id: gắn phần tử id "x" vào khoá "y"
    const wrongKey = new Y.Map<unknown>();
    for (const [k, v] of Object.entries(elementOf("x"))) wrongKey.set(k, v);
    doc.getMap("elements").set("y", wrongKey);
    const incomplete = new Y.Map<unknown>();
    incomplete.set("id", "z");
    doc.getMap("elements").set("z", incomplete);

    expect(inspector.inspect(Y.encodeStateAsUpdate(doc))).toMatchObject({ elementCount: 6, invalidElements: 4 });
  });

  it("đọc được points lưu dạng Y.Array và phần tử lưu dạng JSON thuần (không phải Y.Map)", () => {
    const doc = new Y.Doc();
    const stroke = new Y.Map<unknown>();
    for (const [k, v] of Object.entries(elementOf("s", { type: "freehand" }))) stroke.set(k, v);
    const pts = new Y.Array<number>();
    pts.push([1, 2, 3, 4]);
    stroke.set("points", pts);
    doc.getMap("elements").set("s", stroke);
    doc.getMap("elements").set("plain", elementOf("plain"));
    expect(inspector.inspect(Y.encodeStateAsUpdate(doc))).toEqual({ elementCount: 2, orderCount: 0, invalidElements: 0 });
  });

  it("dữ liệu không phải Yjs update → 400 (ValidationError), không làm sập tiến trình", () => {
    expect(() => inspector.inspect(Uint8Array.from([255, 255, 255, 255, 1, 2, 3]))).toThrow(expect.objectContaining({ statusCode: 400 }));
  });
});
