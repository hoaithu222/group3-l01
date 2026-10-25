import type { Prisma, PrismaClient } from "@prisma/client";
import type { CoinQuestMetric, CoinSourceTypeValue, ShopItemKindValue } from "../entities/coins.interface";

/**
 * Seed ĐỀ XUẤT của p7-02 (README §7 — CHỦ DỰ ÁN DUYỆT trước khi bật cờ `coins`; cờ mặc định TẮT nên dữ liệu vô hại). Idempotent theo `sourceType`/`code`: CHỈ TẠO khi thiếu, KHÔNG BAO GIỜ ghi đè bản admin đã sửa.
 * Nhận `PrismaClient` của script `prisma/seed.ts` (không dùng singleton của ứng dụng để script tự thoát). Mọi số ở đây là ĐỀ XUẤT cân bằng ban đầu (trần chung 200 xu/ngày từ sự kiện); admin chỉnh ở
 * `/admin/economy/*`. ⛔ Không có luật cho `ADMIN_ADJUST`; `POMODORO_CYCLE` để TẮT (p5-02 còn chờ chốt chống gian lận, giống luật XP).
 */
export interface CoinRuleSeed {
  sourceType: CoinSourceTypeValue;
  coins: number;
  dailyCap: number | null;
  isActive: boolean;
}

export const COIN_RULE_SEEDS: readonly CoinRuleSeed[] = [
  { sourceType: "TASK_COMPLETED", coins: 3, dailyCap: 30, isActive: true },
  { sourceType: "TASK_ON_TIME", coins: 2, dailyCap: 20, isActive: true },
  { sourceType: "QUIZ_SCORED", coins: 5, dailyCap: 25, isActive: true },
  { sourceType: "QUIZ_PASSED", coins: 5, dailyCap: 25, isActive: true },
  // `SR_REVIEW` có XP 0 (chỉ đếm counter) nên không bao giờ phát `xp.awarded` — không có luật.
  { sourceType: "SR_REVIEW_DAY", coins: 5, dailyCap: 5, isActive: true },
  { sourceType: "REVIEW_SUBMITTED", coins: 4, dailyCap: 20, isActive: true },
  { sourceType: "STUDY_SET_PUBLISHED", coins: 10, dailyCap: 10, isActive: true },
  { sourceType: "POMODORO_CYCLE", coins: 1, dailyCap: 10, isActive: false },
];

export interface CoinQuestSeed {
  code: string;
  title: string;
  description: string;
  metric: CoinQuestMetric;
  target: number;
  coins: number;
  order: number;
}

export const COIN_QUEST_SEEDS: readonly CoinQuestSeed[] = [
  { code: "daily-tasks-3", title: "Hoàn thành 3 thẻ công việc", description: "Đưa 3 thẻ công việc sang trạng thái Hoàn thành trong ngày", metric: "tasksDone", target: 3, coins: 15, order: 10 },
  { code: "daily-review", title: "Ôn tập hôm nay", description: "Ôn tập ngắt quãng ít nhất một lần trong ngày", metric: "srReviewDays", target: 1, coins: 10, order: 20 },
  { code: "daily-mock", title: "Làm một bài thi thử", description: "Nộp một bài thi thử hoặc live quiz trong ngày", metric: "quizzesTaken", target: 1, coins: 10, order: 30 },
  { code: "daily-peer-review", title: "Chấm chéo một lần", description: "Nộp một lượt chấm chéo cho đồng đội", metric: "reviewsGiven", target: 1, coins: 10, order: 40 },
];

export interface ShopItemSeed {
  code: string;
  name: string;
  kind: ShopItemKindValue;
  price: number;
  data: Record<string, unknown>;
}

export const SHOP_ITEM_SEEDS: readonly ShopItemSeed[] = [
  { code: "frame-gold", name: "Khung vàng", kind: "AVATAR_FRAME", price: 150, data: { color: "#F5B301", width: 3 } },
  { code: "frame-emerald", name: "Khung ngọc lục bảo", kind: "AVATAR_FRAME", price: 150, data: { color: "#10B981", width: 3 } },
  { code: "theme-ocean", name: "Giao diện Đại dương", kind: "PROFILE_THEME", price: 300, data: { primary: "#0EA5E9", accent: "#22D3EE" } },
  { code: "theme-sunset", name: "Giao diện Hoàng hôn", kind: "PROFILE_THEME", price: 300, data: { primary: "#F97316", accent: "#F43F5E" } },
  { code: "emoji-study", name: "Gói emoji Học tập", kind: "EMOJI_PACK", price: 200, data: { emojis: ["📚", "✏️", "🧠", "💡", "🎯", "🚀", "🔥", "✅"] } },
];

/** Tạo luật/nhiệm vụ/vật phẩm còn thiếu. Trả số bản ghi tạo mới (chạy lại = 0). Các trường tuỳ chọn ghi `null` TƯỜNG MINH (Mongo: vắng mặt ≠ null). */
export async function seedCoins(client: PrismaClient): Promise<{ rules: number; quests: number; items: number }> {
  const haveRules = new Set((await client.coinRule.findMany({ select: { sourceType: true } })).map((r) => r.sourceType));
  const rules = COIN_RULE_SEEDS.filter((r) => !haveRules.has(r.sourceType));
  if (rules.length > 0) await client.coinRule.createMany({ data: rules.map((r) => ({ ...r, updatedBy: null })) });

  const haveQuests = new Set((await client.coinQuest.findMany({ select: { code: true } })).map((q) => q.code));
  const quests = COIN_QUEST_SEEDS.filter((q) => !haveQuests.has(q.code));
  if (quests.length > 0) await client.coinQuest.createMany({ data: quests.map((q) => ({ ...q, isActive: true, updatedBy: null })) });

  const haveItems = new Set((await client.shopItem.findMany({ select: { code: true } })).map((i) => i.code));
  const items = SHOP_ITEM_SEEDS.filter((i) => !haveItems.has(i.code));
  if (items.length > 0) {
    await client.shopItem.createMany({ data: items.map((i) => ({ ...i, data: i.data as Prisma.InputJsonObject, assetId: null, isActive: true, availableFrom: null, availableTo: null, updatedBy: null })) });
  }
  return { rules: rules.length, quests: quests.length, items: items.length };
}
