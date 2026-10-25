import { PRINT_ORDER_STATUSES, type PrintOrderStatus } from "../../entities/o2o.interface";
import { canPerform, isTerminal, nextStatus, PRINT_ORDER_ACTIONS, type PrintOrderAction } from "../../domain/print-order.state-machine";

/** Bảng mong đợi đầy đủ (be.md §5): action → (from → to). Cặp không liệt kê = không hợp lệ (O2O_004). */
const EXPECTED: Record<PrintOrderAction, Partial<Record<PrintOrderStatus, PrintOrderStatus>>> = {
  UPDATE_SETTINGS: { DRAFT: "DRAFT", QUOTED: "QUOTED" },
  SUBMIT: { QUOTED: "PENDING" },
  ACCEPT: { PENDING: "ACCEPTED" },
  REJECT: { PENDING: "REJECTED" },
  CANCEL: { DRAFT: "CANCELLED", QUOTED: "CANCELLED", PENDING: "CANCELLED", ACCEPTED: "CANCELLED" },
  START_PRINTING: { ACCEPTED: "PRINTING" },
  MARK_READY: { PRINTING: "READY" },
  PICKUP: { READY: "PICKED_UP" },
  MARK_PAID: { READY: "READY", PICKED_UP: "PICKED_UP" },
  REGENERATE_PIN: { PENDING: "PENDING", ACCEPTED: "ACCEPTED", PRINTING: "PRINTING", READY: "READY" },
  EXPIRE: { PENDING: "EXPIRED", READY: "EXPIRED" },
  NOTIFY_EXPIRING: { READY: "READY" },
  ABANDON: { DRAFT: "CANCELLED", QUOTED: "CANCELLED" },
  ADMIN_CANCEL: { DRAFT: "CANCELLED", QUOTED: "CANCELLED", PENDING: "CANCELLED", ACCEPTED: "CANCELLED", PRINTING: "CANCELLED", READY: "CANCELLED" },
};

describe("print-order.state-machine — mọi cặp (action × trạng thái)", () => {
  const cases = PRINT_ORDER_ACTIONS.flatMap((action) => PRINT_ORDER_STATUSES.map((from) => [action, from, EXPECTED[action][from]] as const));

  it.each(cases)("%s từ %s → %s", (action, from, to) => {
    expect(nextStatus(action, from)).toBe(to);
    expect(canPerform(action, from)).toBe(to !== undefined);
  });

  it("IR-12: khách KHÔNG huỷ được khi đang in / sẵn sàng", () => {
    expect(canPerform("CANCEL", "PRINTING")).toBe(false);
    expect(canPerform("CANCEL", "READY")).toBe(false);
  });

  it("trạng thái kết thúc không còn hành động nghiệp vụ nào ngoài đánh dấu đã thu tiền sau giao", () => {
    for (const s of ["PICKED_UP", "REJECTED", "CANCELLED", "EXPIRED"] as const) {
      expect(isTerminal(s)).toBe(true);
      const allowed = PRINT_ORDER_ACTIONS.filter((a) => canPerform(a, s));
      expect(allowed).toEqual(s === "PICKED_UP" ? ["MARK_PAID"] : []);
    }
    expect(isTerminal("READY")).toBe(false);
  });
});
