import type { ITxRunner, TxHandle } from "./tx";

/** Thành phần tham gia transaction giả — chụp trạng thái trước, hoàn tác khi `fn` ném lỗi (giống rollback thật). Mẫu `modules/live-quiz/repositories/tx.inmemory.ts`. */
export interface Restorable {
  snapshot(): unknown;
  restore(snapshot: unknown): void;
}

/**
 * `ITxRunner` giả CHO TEST: các transaction chạy TUẦN TỰ (hàng đợi lời hứa) — tương đương kết quả của Mongo khi write-conflict ép giao dịch chạy lại lần lượt; lỗi ⇒ hoàn tác mọi thành
 * phần đã đăng ký (kể cả các dòng sổ cái/ví đã ghi trước điểm lỗi ⇒ kiểm được "lỗi giữa chừng khi chuyển xu thì cả hai ví không đổi"). `failAfterRun` mô phỏng tiến trình chết ngay trước commit.
 * ⛔ KHÔNG lồng `run` trong `run` (sẽ treo) — service thật cũng không lồng.
 */
export class InMemoryTxRunner implements ITxRunner {
  /** Số lần `run` kế tiếp sẽ ném lỗi SAU khi `fn` chạy xong (mô phỏng crash trước commit → toàn bộ bị hoàn tác). */
  failAfterRun = 0;
  /** Số transaction đã COMMIT (không tính bị hoàn tác) — test kiểm "chỉ một giao dịch thành công". */
  committed = 0;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private readonly parts: Restorable[]) {}

  run<T>(fn: (tx: TxHandle) => Promise<T>): Promise<T> {
    const exec = async (): Promise<T> => {
      const saved = this.parts.map((p) => p.snapshot());
      try {
        const out = await fn({} as TxHandle);
        if (this.failAfterRun > 0) {
          this.failAfterRun -= 1;
          throw new Error("Giả lập: crash trước commit");
        }
        this.committed += 1;
        return out;
      } catch (err) {
        this.parts.forEach((p, i) => p.restore(saved[i]));
        throw err;
      }
    };
    const result = this.chain.then(exec, exec);
    this.chain = result.catch(() => undefined);
    return result;
  }
}

/** Chạy `fn` ngay, KHÔNG tuần tự hoá, KHÔNG hoàn tác — chỉ để test độ an toàn của điều kiện CAS khi các lời gọi xen kẽ thật sự (mỗi bước repo nhường luồng). */
export class ParallelTxRunner implements ITxRunner {
  run<T>(fn: (tx: TxHandle) => Promise<T>): Promise<T> {
    return fn({} as TxHandle);
  }
}
