import { afterEach, describe, expect, it, vi } from "vitest";

type Proto = Record<string, unknown>;
const saved = new Map<string, PropertyDescriptor | undefined>();

function remove(target: object, name: string): void {
  saved.set(`${target === Array.prototype ? "Array" : "String"}.${name}`, Object.getOwnPropertyDescriptor(target, name));
  Reflect.deleteProperty(target, name);
}

afterEach(() => {
  for (const [key, descriptor] of saved) {
    const [owner, name] = key.split(".") as [string, string];
    const target = owner === "Array" ? Array.prototype : String.prototype;
    if (descriptor) Object.defineProperty(target, name, descriptor);
  }
  saved.clear();
  vi.resetModules();
});

describe("polyfills cho WebView cũ", () => {
  it("bổ sung at/findLast/findLastIndex/replaceAll khi thiếu và chạy đúng", async () => {
    for (const name of ["at", "findLast", "findLastIndex"]) remove(Array.prototype, name);
    remove(String.prototype, "replaceAll");
    expect((Array.prototype as unknown as Proto)["findLast"]).toBeUndefined();

    await import("../src/polyfills");
    const a = [1, 2, 3, 4];
    expect(a.at(-1)).toBe(4);
    expect(a.at(0)).toBe(1);
    expect(a.at(9)).toBeUndefined();
    expect(a.findLast((n) => n % 2 === 1)).toBe(3);
    expect(a.findLast((n) => n > 9)).toBeUndefined();
    expect(a.findLastIndex((n) => n < 3)).toBe(1);
    expect("a-b-c".replaceAll("-", "_")).toBe("a_b_c");
    expect("a-b-c".replaceAll(/-/g, "+")).toBe("a+b+c");
    expect(() => "x".replaceAll(/x/, "y")).toThrow(TypeError);
  });

  it("không ghi đè bản gốc của trình duyệt", async () => {
    const original = Array.prototype.findLast;
    await import("../src/polyfills");
    expect(Array.prototype.findLast).toBe(original);
  });
});
