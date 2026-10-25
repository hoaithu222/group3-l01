import { requireRegisteredMessageScope, requireRegisteredResolver } from "../services/runtime-guards";

describe("runtime-guards — worker riêng chưa boot registry phải LỖI to, không im lặng", () => {
  it("MessageScope đã đăng ký → trả lại đúng đối tượng", () => {
    const scope = { readerIds: () => Promise.resolve(["u1"]) };
    expect(requireRegisteredMessageScope(scope, "CHANNEL")).toBe(scope);
  });

  it("MessageScope thiếu → ném lỗi nêu rõ scopeType + hướng xử lý (thay vì audience rỗng lặng lẽ)", () => {
    expect(() => requireRegisteredMessageScope(undefined, "CONVERSATION")).toThrow(/MessageScope "CONVERSATION" chưa đăng ký.*router\.ts/);
    expect(() => requireRegisteredMessageScope(null, "CHANNEL")).toThrow(/CHANNEL/);
  });

  it("ScopeResolver: có → im lặng; thiếu → ném lỗi (thay vì coi người nhận là mất quyền rồi huỷ mục hộp thư)", () => {
    expect(() => requireRegisteredResolver({ type: "CHANNEL" }, "CHANNEL")).not.toThrow();
    expect(() => requireRegisteredResolver(undefined, "CHANNEL")).toThrow(/ScopeResolver "CHANNEL" chưa đăng ký/);
  });
});
