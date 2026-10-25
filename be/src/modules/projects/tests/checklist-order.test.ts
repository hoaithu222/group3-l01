import type { ChecklistItem } from "../entities/task.interface";
import { CHECKLIST_ORDER_STEP, isStrictlyBetween, neighborsAfter, orderBetween } from "../services/checklist-order";

const item = (id: string, order: number): ChecklistItem => ({ id, text: id, done: false, doneBy: null, doneAt: null, order });

describe("checklist-order", () => {
  it("orderBetween: rỗng, đầu, cuối, giữa (trung bình)", () => {
    expect(orderBetween(null, null)).toBe(CHECKLIST_ORDER_STEP);
    expect(orderBetween(null, 1024)).toBe(0);
    expect(orderBetween(2048, null)).toBe(3072);
    expect(orderBetween(1024, 2048)).toBe(1536);
  });

  it("chèn liên tiếp vào CÙNG một chỗ luôn nằm giữa cho tới khi cạn độ chính xác, rồi isStrictlyBetween báo sai", () => {
    let prev = 1024;
    const next = 2048;
    let value = orderBetween(prev, next);
    let steps = 0;
    while (isStrictlyBetween(value, prev, next) && steps < 200) {
      prev = value;
      value = orderBetween(prev, next);
      steps += 1;
    }
    expect(steps).toBeGreaterThan(30); // số thực đủ cho cả checklist 100 mục chèn hàng chục lần cùng chỗ
    expect(steps).toBeLessThan(200); // nhưng KHÔNG vô hạn → cần đường đánh lại `order`
  });

  it("neighborsAfter: đầu danh sách, sau một mục, cuối danh sách, mốc không còn → cuối, bỏ mục đang di chuyển", () => {
    const items = [item("a", 1), item("b", 2), item("c", 3)];
    expect(neighborsAfter(items, null)).toEqual({ prev: null, next: 1 });
    expect(neighborsAfter(items, "a")).toEqual({ prev: 1, next: 2 });
    expect(neighborsAfter(items, "c")).toEqual({ prev: 3, next: null });
    expect(neighborsAfter(items, undefined)).toEqual({ prev: 3, next: null });
    expect(neighborsAfter(items, "đã-xoá")).toEqual({ prev: 3, next: null });
    // Di chuyển "a" ra sau "b": hàng xóm tính trên danh sách KHÔNG có "a".
    expect(neighborsAfter(items, "b", "a")).toEqual({ prev: 2, next: 3 });
    expect(neighborsAfter(items, null, "a")).toEqual({ prev: null, next: 2 });
    expect(neighborsAfter([], null)).toEqual({ prev: null, next: null });
  });
});
