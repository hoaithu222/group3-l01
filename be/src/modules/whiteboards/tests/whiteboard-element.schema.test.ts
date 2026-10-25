import fs from "node:fs";
import path from "node:path";
import { LIMITS } from "../../../core/constants/limits";
import { BACKGROUNDS, ELEMENT_TYPES, isValidElement, whiteboardElementSchema } from "../services/whiteboard-element.schema";
import { elementOf } from "./support/whiteboards-harness";

/** `contracts/whiteboard-elements.schema.json` ở GỐC repo (be/src/modules/whiteboards/tests → lên 5 cấp). */
const CONTRACT_PATH = path.resolve(__dirname, "../../../../../contracts/whiteboard-elements.schema.json");

interface JsonSchema {
  properties?: Record<string, JsonSchema>;
  required?: string[];
  enum?: unknown[];
  maxItems?: number;
  maxLength?: number;
  maxProperties?: number;
  minimum?: number;
  maximum?: number;
  additionalProperties?: unknown;
  $defs?: Record<string, JsonSchema>;
}
const contract = JSON.parse(fs.readFileSync(CONTRACT_PATH, "utf8")) as JsonSchema;
const elementDef = contract.$defs?.["element"] as JsonSchema;

describe("schema phần tử (Zod) — hợp đồng p6-02 §2.1", () => {
  it("phần tử tối thiểu hợp lệ; mọi loại phần tử (kể cả P1 image/frame) được nhận", () => {
    expect(whiteboardElementSchema.safeParse(elementOf("a")).success).toBe(true);
    for (const type of ELEMENT_TYPES) expect(whiteboardElementSchema.safeParse(elementOf("a", { type })).success).toBe(true);
    expect(whiteboardElementSchema.safeParse(elementOf("a", { type: "hình-lạ" })).success).toBe(false);
  });

  it("nét tự do: points ≤ 1000 số (WB spec) và phải là các cặp x,y — 1001 số hoặc số lẻ bị từ chối", () => {
    const max = LIMITS.whiteboard.freehandPointsMax;
    expect(max).toBe(1000);
    const ok = whiteboardElementSchema.safeParse(elementOf("s", { type: "freehand", points: Array.from({ length: max }, (_v, i) => i) }));
    expect(ok.success).toBe(true);
    const tooMany = whiteboardElementSchema.safeParse(elementOf("s", { type: "freehand", points: Array.from({ length: max + 2 }, (_v, i) => i) }));
    expect(tooMany.success).toBe(false);
    expect(whiteboardElementSchema.safeParse(elementOf("s", { type: "freehand", points: Array.from({ length: max + 1 }, (_v, i) => i) })).success).toBe(false);
    expect(whiteboardElementSchema.safeParse(elementOf("s", { type: "freehand", points: [1, 2, 3] })).success).toBe(false);
    expect(whiteboardElementSchema.safeParse(elementOf("s", { type: "freehand", points: [1, Number.NaN] })).success).toBe(false);
  });

  it("chữ ≤ 2000 ký tự; cỡ chữ 12..96; độ dày nét 1..12; toạ độ hữu hạn", () => {
    expect(whiteboardElementSchema.safeParse(elementOf("t", { type: "text", text: "a".repeat(2000), fontSize: 12 })).success).toBe(true);
    expect(whiteboardElementSchema.safeParse(elementOf("t", { type: "text", text: "a".repeat(2001) })).success).toBe(false);
    expect(whiteboardElementSchema.safeParse(elementOf("t", { fontSize: 11 })).success).toBe(false);
    expect(whiteboardElementSchema.safeParse(elementOf("t", { fontSize: 97 })).success).toBe(false);
    expect(whiteboardElementSchema.safeParse(elementOf("t", { strokeWidth: 0.5 })).success).toBe(false);
    expect(whiteboardElementSchema.safeParse(elementOf("t", { strokeWidth: 13 })).success).toBe(false);
    expect(whiteboardElementSchema.safeParse(elementOf("t", { x: Number.POSITIVE_INFINITY })).success).toBe(false);
  });

  it("màu là ID TOKEN (không phải mã màu); fillColor null hợp lệ; mũi tên nối hình qua startBinding/endBinding", () => {
    expect(whiteboardElementSchema.safeParse(elementOf("c", { strokeColor: "blue", fillColor: "yellow" })).success).toBe(true);
    expect(whiteboardElementSchema.safeParse(elementOf("c", { strokeColor: "#ff0000" })).success).toBe(false);
    expect(whiteboardElementSchema.safeParse(elementOf("c", { fillColor: "Yellow" })).success).toBe(false);
    expect(whiteboardElementSchema.safeParse(elementOf("ar", { type: "arrow", startBinding: { elementId: "a" }, endBinding: { elementId: "b" } })).success).toBe(true);
    expect(whiteboardElementSchema.safeParse(elementOf("ar", { type: "arrow", startBinding: { id: "a" } })).success).toBe(false);
  });

  it("thiếu trường bắt buộc / trường lạ (strict) bị từ chối; khoá trong `elements` phải trùng `id`", () => {
    const missing = elementOf("m");
    delete missing["updatedAt"];
    expect(whiteboardElementSchema.safeParse(missing).success).toBe(false);
    expect(whiteboardElementSchema.safeParse({ ...elementOf("m"), extra: 1 }).success).toBe(false);
    expect(isValidElement("m", elementOf("m"))).toBe(true);
    expect(isValidElement("khác", elementOf("m"))).toBe(false);
    expect(isValidElement("m", "không-phải-object")).toBe(false);
  });
});

describe("đối chiếu contracts/whiteboard-elements.schema.json ↔ Zod (chống lệch hợp đồng)", () => {
  it("cùng tập khoá, cùng tập khoá bắt buộc, cùng loại phần tử/nền, additionalProperties=false", () => {
    const shape = whiteboardElementSchema.shape as Record<string, { isOptional(): boolean }>;
    const zodKeys = Object.keys(shape).sort();
    const zodRequired = zodKeys.filter((k) => !shape[k]?.isOptional()).sort();
    expect(Object.keys(elementDef.properties ?? {}).sort()).toEqual(zodKeys);
    expect([...(elementDef.required ?? [])].sort()).toEqual(zodRequired);
    expect(elementDef.additionalProperties).toBe(false);
    expect(elementDef.properties?.["type"]?.enum).toEqual([...ELEMENT_TYPES]);
    expect(contract.properties?.["meta"]?.properties?.["background"]?.enum).toEqual([...BACKGROUNDS]);
    expect([...(contract.required ?? [])].sort()).toEqual(["elements", "order"]);
  });

  it("cùng trần số học: 5000 phần tử, text 2000, points 1000, cỡ chữ 12..96, độ dày 1..12", () => {
    expect(contract.properties?.["elements"]?.maxProperties).toBe(LIMITS.whiteboard.elementsMax);
    expect(contract.properties?.["order"]?.maxItems).toBe(LIMITS.whiteboard.elementsMax);
    expect(elementDef.properties?.["text"]?.maxLength).toBe(LIMITS.whiteboard.elementTextMax);
    expect(elementDef.properties?.["points"]?.maxItems).toBe(LIMITS.whiteboard.freehandPointsMax);
    expect(elementDef.properties?.["fontSize"]).toMatchObject({ minimum: 12, maximum: 96 });
    expect(elementDef.properties?.["strokeWidth"]).toMatchObject({ minimum: 1, maximum: 12 });
  });
});
