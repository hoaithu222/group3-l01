import * as Y from "yjs";
import { mergeYjsStates } from "../../../shared/collab";
import { replaceWhiteboardContent } from "../services/whiteboard-yjs";
import { buildState, elementOf, readState } from "./support/whiteboards-harness";

describe("replaceWhiteboardContent (khôi phục bản lưu)", () => {
  it("thay elements + order bằng nội dung snapshot trong MỘT transaction; meta giữ nguyên; delta áp lên bản sao cũ ra đúng kết quả", () => {
    const current = new Y.Doc();
    Y.applyUpdate(current, buildState([elementOf("a"), elementOf("b"), elementOf("c")]));
    current.getMap("meta").set("background", "dots");
    const currentState = Y.encodeStateAsUpdate(current);
    const snapshot = buildState([elementOf("a", { x: 999 }), elementOf("z")]);

    const { newState, delta, elementCount } = replaceWhiteboardContent(currentState, snapshot);
    expect(elementCount).toBe(2);
    const after = readState(newState);
    expect(Object.keys(after.elements).sort()).toEqual(["a", "z"]);
    expect(after.elements["a"]?.["x"]).toBe(999);
    expect(after.order).toEqual(["a", "z"]);

    const replica = new Y.Doc();
    Y.applyUpdate(replica, currentState);
    Y.applyUpdate(replica, delta);
    expect(Object.keys(replica.getMap("elements").toJSON()).sort()).toEqual(["a", "z"]);
    expect(replica.getMap("meta").get("background")).toBe("dots");
    expect(replica.getArray("order").toArray()).toEqual(["a", "z"]);
  });

  it("state hiện tại rỗng → nhận nguyên snapshot; snapshot rỗng → bảng trống", () => {
    expect(readState(replaceWhiteboardContent(null, buildState([elementOf("a")])).newState).order).toEqual(["a"]);
    const cleared = replaceWhiteboardContent(buildState([elementOf("a")]), new Uint8Array());
    expect(cleared.elementCount).toBe(0);
    expect(readState(cleared.newState)).toEqual({ elements: {}, order: [] });
  });

  it("phần tử khôi phục là bản SAO độc lập: sửa sau đó không ảnh hưởng snapshot gốc", () => {
    const snapshot = buildState([elementOf("a")]);
    const { newState } = replaceWhiteboardContent(null, snapshot);
    const doc = new Y.Doc();
    Y.applyUpdate(doc, newState);
    (doc.getMap("elements").get("a") as Y.Map<unknown>).set("x", 5);
    expect(readState(snapshot).elements["a"]?.["x"]).toBe(0);
  });
});

describe("cấu trúc Y.Map lồng nhau — WB-01 hai người sửa CÙNG một hình nhưng khác trường thì giữ cả hai", () => {
  it("một đổi màu, một di chuyển → hợp nhất giữ fillColor VÀ x/y (không bên nào thắng cả phần tử)", () => {
    const base = buildState([elementOf("shape")]);
    const alice = new Y.Doc();
    const bob = new Y.Doc();
    Y.applyUpdate(alice, base);
    Y.applyUpdate(bob, base);

    (alice.getMap("elements").get("shape") as Y.Map<unknown>).set("fillColor", "yellow");
    const moved = bob.getMap("elements").get("shape") as Y.Map<unknown>;
    moved.set("x", 250);
    moved.set("y", 90);

    const merged = mergeYjsStates(Y.encodeStateAsUpdate(alice), Y.encodeStateAsUpdate(bob));
    expect(readState(merged).elements["shape"]).toMatchObject({ fillColor: "yellow", x: 250, y: 90 });
  });

  it("hai người cùng đổi MỘT trường → hội tụ về một giá trị duy nhất ở mọi bản sao (CRDT)", () => {
    const base = buildState([elementOf("shape")]);
    const a = new Y.Doc();
    const b = new Y.Doc();
    Y.applyUpdate(a, base);
    Y.applyUpdate(b, base);
    (a.getMap("elements").get("shape") as Y.Map<unknown>).set("strokeColor", "red");
    (b.getMap("elements").get("shape") as Y.Map<unknown>).set("strokeColor", "blue");
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    const av = (a.getMap("elements").get("shape") as Y.Map<unknown>).get("strokeColor");
    const bv = (b.getMap("elements").get("shape") as Y.Map<unknown>).get("strokeColor");
    expect(av).toBe(bv);
    expect(["red", "blue"]).toContain(av);
  });
});
