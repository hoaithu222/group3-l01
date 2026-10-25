import { computeOrders, ORDER_STEP, type OrderOp } from "../services/study-item-order";

const cur = (...orders: number[]) => orders.map((order, i) => ({ ref: `e${i + 1}`, order }));
const orderOf = (r: ReturnType<typeof computeOrders>, ref: string) => r.orders.get(ref) as number;

describe("study-item-order — thứ tự tương đối bằng trung điểm", () => {
  it("mục mới không nêu vị trí → xuống cuối; mục cũ không nêu vị trí → giữ chỗ (không có trong kết quả)", () => {
    const r = computeOrders(cur(1024, 2048), [
      { ref: "new:a", existing: false, after: undefined },
      { ref: "e1", existing: true, after: undefined },
    ]);
    expect(orderOf(r, "new:a")).toBe(2048 + ORDER_STEP);
    expect(r.orders.has("e1")).toBe(false);
    expect(r.renumbered).toBe(false);
  });

  it("danh sách rỗng: mục đầu tiên = ORDER_STEP, mục thứ hai ngay sau", () => {
    const r = computeOrders([], [
      { ref: "new:a", existing: false, after: undefined },
      { ref: "new:b", existing: false, after: undefined },
    ]);
    expect(orderOf(r, "new:a")).toBe(ORDER_STEP);
    expect(orderOf(r, "new:b")).toBe(2 * ORDER_STEP);
  });

  it("chèn SAU một mục = trung điểm với hàng xóm kế tiếp; after=null = đầu danh sách", () => {
    const r = computeOrders(cur(1024, 2048), [
      { ref: "new:mid", existing: false, after: "e1" },
      { ref: "new:first", existing: false, after: null },
    ]);
    expect(orderOf(r, "new:mid")).toBe(1536);
    expect(orderOf(r, "new:first")).toBe(1024 - ORDER_STEP);
  });

  it("mục sau có thể tham chiếu mục MỚI đứng trước trong cùng lượt", () => {
    const r = computeOrders(cur(1024), [
      { ref: "new:a", existing: false, after: "e1" },
      { ref: "new:b", existing: false, after: "new:a" },
    ]);
    expect(orderOf(r, "new:a")).toBe(1024 + ORDER_STEP);
    expect(orderOf(r, "new:b")).toBe(1024 + 2 * ORDER_STEP);
  });

  it("dời mục cũ: nêu after → order mới nằm giữa hai hàng xóm còn lại", () => {
    const r = computeOrders(cur(1024, 2048, 3072), [{ ref: "e1", existing: true, after: "e3" }]);
    expect(orderOf(r, "e1")).toBe(3072 + ORDER_STEP);
    const r2 = computeOrders(cur(1024, 2048, 3072), [{ ref: "e3", existing: true, after: "e1" }]);
    expect(orderOf(r2, "e3")).toBe(1536);
  });

  it("tham chiếu không tìm thấy → coi như cuối danh sách (validator đã chặn trước đó)", () => {
    const r = computeOrders(cur(1024), [{ ref: "new:a", existing: false, after: "khong-co" }]);
    expect(orderOf(r, "new:a")).toBe(2048);
  });

  it("chèn liên tiếp vào cùng một khe tới khi quá sát → nén lại toàn bộ danh sách (renumbered)", () => {
    // 60 lần chèn ngay sau e1 làm khoảng cách giảm nửa mỗi lần: 1024 → dưới 1e-6.
    const ops: OrderOp[] = Array.from({ length: 60 }, (_, i) => ({ ref: `new:${i}`, existing: false, after: "e1" }));
    const r = computeOrders(cur(1024, 2048), ops);
    expect(r.renumbered).toBe(true);
    // Sau khi nén: khoảng cách đều ORDER_STEP, thứ tự tương đối giữ nguyên (mục chèn SAU cùng đứng gần e1 nhất).
    const orders = [...r.orders.entries()];
    expect(orders.length).toBeGreaterThan(60); // gồm cả mục cũ đổi order (e2); e1 vẫn 1 × STEP nên KHÔNG có mặt
    expect(r.orders.has("e1")).toBe(false);
    expect(orderOf(r, "e2")).toBe(62 * ORDER_STEP);
    expect(orderOf(r, "new:59")).toBe(2 * ORDER_STEP); // chèn cuối cùng ngay sau e1
    expect(orderOf(r, "new:0")).toBe(61 * ORDER_STEP);
  });

  it("không đổi đầu vào (hàm thuần)", () => {
    const input = cur(1024, 2048);
    computeOrders(input, [{ ref: "new:a", existing: false, after: null }]);
    expect(input).toEqual(cur(1024, 2048));
  });
});
