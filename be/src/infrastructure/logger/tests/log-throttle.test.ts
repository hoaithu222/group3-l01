import { createLogThrottle } from "../log-throttle";

describe("createLogThrottle", () => {
  let t = 1_000;
  const throttle = () => createLogThrottle(60_000, () => t);
  beforeEach(() => {
    t = 1_000;
  });

  it("lần đầu được ghi (suppressed 0); trong cửa sổ thì nén (null)", () => {
    const th = throttle();
    expect(th.tryAcquire("a")).toEqual({ suppressed: 0 });
    t += 59_999;
    expect(th.tryAcquire("a")).toBeNull();
  });

  it("hết cửa sổ: ghi lại kèm số lần đã nén, rồi đếm lại từ 0", () => {
    const th = throttle();
    th.tryAcquire("a");
    t += 10_000;
    th.tryAcquire("a");
    t += 10_000;
    th.tryAcquire("a");
    t += 40_000;
    expect(th.tryAcquire("a")).toEqual({ suppressed: 2 });
    t += 60_000;
    expect(th.tryAcquire("a")).toEqual({ suppressed: 0 });
  });

  it("mỗi key độc lập", () => {
    const th = throttle();
    expect(th.tryAcquire("a")).not.toBeNull();
    expect(th.tryAcquire("b")).not.toBeNull();
    expect(th.tryAcquire("a")).toBeNull();
  });

  it("clear: trả true nếu key đang được theo dõi, và lỗi kế tiếp được ghi ngay (không mang số nén cũ)", () => {
    const th = throttle();
    expect(th.clear("a")).toBe(false);
    th.tryAcquire("a");
    th.tryAcquire("a");
    expect(th.clear("a")).toBe(true);
    expect(th.tryAcquire("a")).toEqual({ suppressed: 0 });
  });
});
