import { Counter, Gauge } from "prom-client";
import { registry } from "./metrics.client";

/**
 * Metric kinh tế xu (p7-02 be.md §5/§7) — đăng ký vào `registry` chung, khai ở file riêng như `call.metrics.ts`. Nhãn ít giá trị, KHÔNG gắn userId/số xu (metric không được chứa dữ liệu
 * cá nhân).
 */

/** Sự kiện `xp.awarded` không được thưởng xu: `reason` = CAPPED (hết trần ngày) | NO_RULE | USER_INACTIVE | DISABLED (phân hệ tắt). */
export const coinsEarnSkippedTotal = new Counter({
  name: "coins_earn_skipped_total",
  help: "Số sự kiện XP không được thưởng xu, gộp theo lý do",
  labelNames: ["reason"] as const,
  registers: [registry],
});

/** Số ví có `balance` lệch Σ sổ cái ở lần đối soát gần nhất (> 0 ⇒ cảnh báo; job KHÔNG tự sửa). */
export const coinsReconcileMismatchGauge = new Gauge({
  name: "coins_reconcile_mismatch",
  help: "Số ví xu lệch sổ cái ở lần đối soát gần nhất",
  registers: [registry],
});
