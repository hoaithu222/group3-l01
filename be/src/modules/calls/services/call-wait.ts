import type { CallEntity } from "../entities/call.interface";
import type { ICallRepository } from "../repositories/call.repository.interface";

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Khoá Redis (`call:active`/`call:busy`) được GIỮ TRƯỚC khi hàng `Call` được commit (người tạo còn đang trong transaction).
 * Thấy khoá mà chưa thấy hàng `Call` CHƯA có nghĩa là khoá mồ côi — nhả nhầm sẽ cho 2 người cùng tạo cuộc gọi (đúng lỗi
 * "hai CallId" của Sun PMS). Chờ ngắn cho hàng xuất hiện; quá hạn (người tạo chết giữa chừng — khoá tự hết hạn sau 90 s)
 * mới coi là mồ côi.
 */
export async function waitForCall(repo: Pick<ICallRepository, "findById">, id: string, attempts = 40, delayMs = 50): Promise<CallEntity | null> {
  for (let i = 0; i < attempts; i += 1) {
    const call = await repo.findById(id);
    if (call) return call;
    await sleep(delayMs);
  }
  return null;
}
