import { DEFAULT_TIME_ZONE, localDate } from "../../../core/utils/local-date";
import { questRefId } from "../domain/coin-math";
import { coinErrors } from "../coins.errors";
import type { ICoinsDirectory } from "../repositories/directory";
import type { ICoinQuestRepository, IQuestProgressRepository } from "../repositories/quest.repository.interface";
import { UniqueViolationError, type ITxRunner } from "../repositories/tx";
import type { CoinCatalogCache } from "./coin-catalog.service";
import type { CoinLedgerService } from "./coin-ledger.service";
import type { ICoinsEmitter } from "./coins.ports";
import { toQuestDto, type QuestDto } from "./coins-presenter";

export interface CoinQuestDeps {
  catalog: CoinCatalogCache;
  quests: ICoinQuestRepository;
  progress: IQuestProgressRepository;
  ledger: CoinLedgerService;
  directory: ICoinsDirectory;
  tx: ITxRunner;
  emitter: ICoinsEmitter;
  now?: () => Date;
}

/**
 * Nhiệm vụ ngày (p7-02 be.md §5): tiến độ theo NGÀY ĐỊA PHƯƠNG của người dùng (`User.timezone`), tăng bởi consumer `xp.awarded` (`CoinEarnService`); thưởng nhận CHỦ ĐỘNG bấm — không tự cộng
 * âm thầm. Nhận = MỘT transaction: `claimedAt` đặt bằng cập nhật CÓ ĐIỀU KIỆN (`progress ≥ target` và chưa nhận) rồi dòng sổ cái `EARN_QUEST` (`refId = <questId>:<ngày>`, unique) — hai lần bấm/song song
 * chỉ một lần thắng (COIN-03), lỗi ở bước sổ cái hoàn tác cả `claimedAt`. Chỉ nhận được thưởng của HÔM NAY (ngày địa phương); qua ngày mới thì tiến độ hôm qua không còn nhận được.
 */
export class CoinQuestService {
  private readonly now: () => Date;

  constructor(private readonly d: CoinQuestDeps) {
    this.now = d.now ?? (() => new Date());
  }

  async listMine(userId: string): Promise<QuestDto[]> {
    const user = await this.d.directory.getUser(userId);
    const day = localDate(this.now(), user?.timezone ?? DEFAULT_TIME_ZONE);
    const [quests, rows] = await Promise.all([this.d.catalog.activeQuests(), this.d.progress.listForDay(userId, day)]);
    const byQuest = new Map(rows.map((r) => [r.questId, r] as const));
    return quests.map((q) => toQuestDto(q, byQuest.get(q.id)?.progress ?? 0, byQuest.get(q.id)?.claimedAt ?? null));
  }

  async claim(userId: string, questId: string): Promise<{ balance: number; delta: number }> {
    const quest = await this.d.quests.find(questId);
    if (!quest || !quest.isActive) throw coinErrors.notFound("Không tìm thấy nhiệm vụ");
    const user = await this.d.directory.getUser(userId);
    const day = localDate(this.now(), user?.timezone ?? DEFAULT_TIME_ZONE);
    await this.d.ledger.ensureWallets([userId]);

    try {
      const res = await this.d.tx.run(async (tx) => {
        const claimed = await this.d.progress.claimIf(userId, quest.id, day, quest.target, this.now(), tx);
        if (!claimed) {
          const row = await this.d.progress.find(userId, quest.id, day, tx);
          if (row?.claimedAt) throw coinErrors.questAlreadyClaimed();
          throw coinErrors.questNotCompleted(row?.progress ?? 0, quest.target);
        }
        return this.d.ledger.credit(tx, { userId, amount: quest.coins, type: "EARN_QUEST", refType: "QUEST", refId: questRefId(quest.id, day) });
      });
      this.d.emitter.updated(userId, { coins: { balance: res.balance, delta: quest.coins, reason: "QUEST" } });
      return { balance: res.balance, delta: quest.coins };
    } catch (err) {
      // Dòng sổ cái cùng (nhiệm vụ, ngày) đã có = đã nhận (đua hiếm với `claimedAt`) → cùng kết quả với lần nhận thứ hai.
      if (err instanceof UniqueViolationError) throw coinErrors.questAlreadyClaimed();
      throw err;
    }
  }
}
