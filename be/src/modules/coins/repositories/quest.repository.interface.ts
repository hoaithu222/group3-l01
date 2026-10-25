import type { CoinQuest, CoinQuestWrite, QuestProgress } from "../entities/coins.interface";
import type { TxHandle } from "./tx";

/** `code` không đổi được (nhật ký/thống kê tham chiếu theo mã) nên không nằm trong bản vá. */
export type CoinQuestPatch = Partial<Omit<CoinQuestWrite, "code">>;

export interface ICoinQuestRepository {
  listAll(): Promise<CoinQuest[]>;
  /** Nhiệm vụ đang bật theo `order` rồi `code` (hiển thị + xác định nhiệm vụ nào nhận tiến độ). */
  listActive(): Promise<CoinQuest[]>;
  find(id: string): Promise<CoinQuest | null>;
  /** `null` khi trùng `code` (unique). */
  create(data: CoinQuestWrite, actorId: string): Promise<CoinQuest | null>;
  /** CAS theo `version`: `null` khi lệch/không có nhiệm vụ. Chỉ các trường có trong `patch` được ghi. */
  updateIf(id: string, expectedVersion: number, patch: CoinQuestPatch, actorId: string): Promise<CoinQuest | null>;
}

export interface IQuestProgressRepository {
  /** Tạo trước NGOÀI transaction các dòng tiến độ (unique `userId+questId+date`) để `increment` trong transaction chỉ là `$inc`; nuốt đua unique. */
  ensure(userId: string, questIds: readonly string[], date: string): Promise<void>;
  increment(userId: string, questId: string, date: string, by: number, tx: TxHandle): Promise<void>;
  find(userId: string, questId: string, date: string, tx?: TxHandle): Promise<QuestProgress | null>;
  listForDay(userId: string, date: string): Promise<QuestProgress[]>;
  /** Đánh dấu đã nhận CÓ ĐIỀU KIỆN (`progress ≥ target` và chưa nhận) — `true` đúng một lần dù bị gọi song song. */
  claimIf(userId: string, questId: string, date: string, target: number, at: Date, tx: TxHandle): Promise<boolean>;
}
