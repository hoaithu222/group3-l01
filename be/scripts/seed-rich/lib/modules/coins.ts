/**
 * Phân hệ Coins (module `coins`): ví xu, sổ cái, nhiệm vụ ngày, cửa hàng vật phẩm, chợ tài liệu.
 *
 * Mọi dòng đều ghi ĐÚNG như `CoinLedgerService`/`CoinEarnService`/`ShopService`/`MarketplaceService`:
 *  · số dư ví = Σ `CoinTransaction.amount` (mỗi dòng cập nhật ví bằng `walletDeltaOf`: balance/lifetimeEarned/lifetimeSpent/version) và `balanceAfter` đọc
 *    sau khi cập nhật, trong CÙNG transaction; khoá chống trùng `(type, refType, refId, userId)`;
 *  · thưởng sự kiện (`EARN_EVENT`) DỰNG LẠI từ chính `XpEvent` có trong DB — cùng luật `CoinRule`, cùng trần ngày (`awardWithCaps`), mỏ neo `CoinEarnEvent.dedupeKey`
 *    = `XpEvent.dedupeKey`; tiến độ nhiệm vụ (`UserQuestProgress`) đếm từ cùng các sự kiện đó, nhận thưởng (`EARN_QUEST`) chỉ cho ngày đã qua;
 *  · mua vật phẩm: `SPEND_SHOP` (refId = itemId) + `UserInventory`, tối đa một món trang bị mỗi loại;
 *  · chợ tài liệu: tin niêm yết trỏ tới `StudySet` PUBLIC thật, mỗi lượt mua = `MarketplacePurchase` + 3 dòng (người mua −giá, người bán +giá, người bán −phí 10%)
 *    + bản sao bộ học PRIVATE cho người mua (`accessRef`).
 * Luật/nhiệm vụ/vật phẩm cửa hàng dùng bản đã có (chỉ tạo khi THIẾU, không ghi đè). Không outbox/thông báo/socket. Idempotent theo các khoá trên.
 */
import type { Prisma } from "@prisma/client";
import { createHash } from "crypto";
import { LIMITS } from "../../../../src/core/constants/limits";
import { DEFAULT_TIME_ZONE, localDate, localDayRangeUtc } from "../../../../src/core/utils/local-date";
import { newObjectId } from "../../../../src/core/utils/object-id";
import { normalizeSearch } from "../../../../src/core/utils/normalize";
import { awardWithCaps, earnDedupeKey, questRefId, QUEST_METRIC_BY_SOURCE, walletDeltaOf, xpRefId } from "../../../../src/modules/coins/domain/coin-math";
import { COIN_SOURCE_TYPES, type CoinTxTypeValue } from "../../../../src/modules/coins/entities/coins.interface";
import { seedCoins as seedCoinCatalog } from "../../../../src/modules/coins/seed/coins.seed";
import { DAY_MS, MIN_MS, prisma } from "../core";
import type { ModuleSeed } from "../module-ctx";
import { GRANTS, LISTINGS, MARKET_BUYS, SHOP_BUYS } from "./coins.content";

const HOUR_MS = 3_600_000;
const FEE_PERCENT = 10; // mặc định của SystemConfig `economy.marketplaceFeePercent`
const THU = "thu";

type Tx = Prisma.TransactionClient;

interface Entry {
  userId: string;
  at: number;
  seq: number;
  type: CoinTxTypeValue;
  amount: number;
  refType: "XP_EVENT" | "QUEST" | "SHOP_ITEM" | "ADMIN" | "PURCHASE";
  refId: string;
  counterpartyId?: string | null;
  note?: string | null;
  actorId?: string | null;
  /** Việc đi kèm trong CÙNG transaction với dòng sổ cái (mỏ neo sự kiện, kho đồ…). */
  after?: (tx: Tx) => Promise<void>;
}

const sha = (s: string) => createHash("sha256").update(s).digest();

export const seedCoins: ModuleSeed = async (c) => {
  const { dir, now } = c;
  const nowMs = now.getTime();
  const cap = (ms: number) => Math.min(ms, nowMs - 10 * MIN_MS);
  await seedCoinCatalog(prisma); // chỉ tạo phần còn thiếu của luật/nhiệm vụ/vật phẩm đề xuất — bản đã có được giữ nguyên

  const [rules, quests, itemList] = await Promise.all([
    prisma.coinRule.findMany().then((r) => new Map(r.map((x) => [x.sourceType, x]))),
    prisma.coinQuest.findMany({ where: { isActive: true } }),
    prisma.shopItem.findMany(),
  ]);
  const items = new Map(itemList.map((i) => [i.code, i]));

  // ── Người tham gia: mọi người có XpEvent + người trong nội dung + thu ──
  const xpAll = await prisma.xpEvent.findMany({ where: { sourceType: { in: [...COIN_SOURCE_TYPES] }, xp: { gt: 0 } }, orderBy: [{ occurredAt: "asc" }, { id: "asc" }] });
  const xpEvents = xpAll.filter((e) => !e.blockedReason && dir.keyOfId(e.userId) !== undefined);
  const keys = new Set<string>([THU, ...GRANTS.map((g) => g.to), ...SHOP_BUYS.map((s) => s.who), ...LISTINGS.map((l) => l.seller), ...MARKET_BUYS.map((m) => m.buyer)]);
  for (const e of xpEvents) keys.add(dir.keyOfId(e.userId) as string);
  const userIds = [...keys].map((k) => dir.id(k));
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, createdAt: true } });
  const createdOf = new Map(users.map((u) => [u.id, u.createdAt.getTime()]));
  // Mốc sớm nhất của bản ghi một người: không cũ hơn tài khoản (`thu` là tài khoản thật có từ trước nên không chặn).
  const floorOf = (key: string): number => (key === THU ? 0 : (createdOf.get(dir.id(key)) ?? 0));

  const admin = await prisma.user.findFirst({ where: { role: { startsWith: "admin" } }, orderBy: { createdAt: "asc" }, select: { id: true } });
  const entries: Entry[] = [];
  let seq = 0;
  const push = (e: Omit<Entry, "seq">) => entries.push({ ...e, seq: seq++ });

  // ── 1) Thưởng sự kiện XP + tiến độ nhiệm vụ ──
  const earnRows = await prisma.coinEarnEvent.findMany({ where: { userId: { in: userIds } }, select: { dedupeKey: true, userId: true, localDate: true, sourceType: true, coins: true } });
  const seenEarn = new Set(earnRows.map((r) => r.dedupeKey));
  const sumDay = new Map<string, number>();
  const sumRule = new Map<string, number>();
  for (const r of earnRows) {
    sumDay.set(`${r.userId}|${r.localDate}`, (sumDay.get(`${r.userId}|${r.localDate}`) ?? 0) + r.coins);
    sumRule.set(`${r.userId}|${r.localDate}|${r.sourceType}`, (sumRule.get(`${r.userId}|${r.localDate}|${r.sourceType}`) ?? 0) + r.coins);
  }
  const progress = new Map<string, { userId: string; questId: string; date: string; count: number; lastAt: number }>();
  const earnOnly: Array<{ dedupeKey: string; userId: string; sourceType: string; sourceId: string; localDate: string; coins: number; capped: boolean; at: Date }> = [];
  for (const e of xpEvents) {
    const dedupeKey = earnDedupeKey(e.sourceType, e.sourceId, e.userId);
    if (seenEarn.has(dedupeKey)) continue;
    const rule = rules.get(e.sourceType);
    const metric = QUEST_METRIC_BY_SOURCE[e.sourceType as keyof typeof QUEST_METRIC_BY_SOURCE];
    const matched = metric ? quests.filter((q) => q.metric === metric) : [];
    const earning = rule !== undefined && rule.isActive && rule.coins > 0;
    if (!earning && matched.length === 0) continue;

    let allowed = 0;
    let capped = false;
    if (earning && rule) {
      ({ allowed, capped } = awardWithCaps({
        ruleCoins: rule.coins,
        ruleDailyCap: rule.dailyCap,
        earnedRuleToday: rule.dailyCap === null ? 0 : (sumRule.get(`${e.userId}|${e.localDate}|${e.sourceType}`) ?? 0),
        earnedToday: sumDay.get(`${e.userId}|${e.localDate}`) ?? 0,
        globalCap: LIMITS.coins.dailyEarnCap,
      }));
    }
    sumDay.set(`${e.userId}|${e.localDate}`, (sumDay.get(`${e.userId}|${e.localDate}`) ?? 0) + allowed);
    sumRule.set(`${e.userId}|${e.localDate}|${e.sourceType}`, (sumRule.get(`${e.userId}|${e.localDate}|${e.sourceType}`) ?? 0) + allowed);
    for (const q of matched) {
      const k = `${e.userId}|${q.id}|${e.localDate}`;
      const cur = progress.get(k) ?? { userId: e.userId, questId: q.id, date: e.localDate, count: 0, lastAt: 0 };
      cur.count += 1;
      cur.lastAt = Math.max(cur.lastAt, e.occurredAt.getTime());
      progress.set(k, cur);
    }
    const earn = { dedupeKey, userId: e.userId, sourceType: e.sourceType, sourceId: e.sourceId, localDate: e.localDate, coins: allowed, capped, at: e.occurredAt };
    if (allowed > 0) {
      push({
        userId: e.userId, at: e.occurredAt.getTime(), type: "EARN_EVENT", amount: allowed, refType: "XP_EVENT", refId: xpRefId(e.sourceType, e.sourceId),
        after: async (tx) => { await tx.coinEarnEvent.create({ data: earn }); },
      });
    } else {
      earnOnly.push(earn);
    }
  }
  for (const earn of earnOnly) await prisma.coinEarnEvent.create({ data: earn });

  // Tiến độ nhiệm vụ ngày + nhận thưởng (chỉ ngày đã qua, vẫn chừa vài lần "quên nhận").
  const today = localDate(now, DEFAULT_TIME_ZONE);
  const questById = new Map(quests.map((q) => [q.id, q]));
  let progressNew = 0;
  let claims = 0;
  for (const p of progress.values()) {
    const quest = questById.get(p.questId);
    if (!quest) continue;
    const row = await prisma.userQuestProgress.findUnique({ where: { userId_questId_date: { userId: p.userId, questId: p.questId, date: p.date } } });
    const total = (row?.progress ?? 0) + p.count;
    const claimable = p.date < today && total >= quest.target && !row?.claimedAt && (p.userId === dir.id(THU) || sha(`claim:${p.userId}:${p.questId}:${p.date}`)[0] / 255 < 0.85);
    const dayEnd = localDayRangeUtc(p.date, DEFAULT_TIME_ZONE).to.getTime() - MIN_MS;
    const claimedAt = claimable ? new Date(Math.min(p.lastAt + (10 + (sha(`claimAt:${p.userId}:${p.date}`)[0] % 80)) * MIN_MS, dayEnd)) : null;
    const updatedAt = new Date(claimedAt ? claimedAt.getTime() : p.lastAt);
    if (row) {
      await prisma.userQuestProgress.update({ where: { id: row.id }, data: { progress: { increment: p.count }, ...(claimedAt && { claimedAt }), updatedAt } });
    } else {
      await prisma.userQuestProgress.create({ data: { userId: p.userId, questId: p.questId, date: p.date, progress: p.count, claimedAt, updatedAt } });
      progressNew += 1;
    }
    if (claimedAt) {
      claims += 1;
      push({ userId: p.userId, at: claimedAt.getTime(), type: "EARN_QUEST", amount: quest.coins, refType: "QUEST", refId: questRefId(quest.id, p.date) });
    }
  }

  // ── 2) Thưởng của quản trị viên ──
  for (const g of GRANTS) {
    const userId = dir.id(g.to);
    const jitter = (sha(`grant:${g.to}:${g.note}`)[0] % 10) * HOUR_MS;
    const at = cap(Math.max(nowMs - g.daysAgo * DAY_MS + jitter, floorOf(g.to) + HOUR_MS));
    push({
      userId, at, type: "ADJUST_ADMIN", amount: g.amount, refType: "ADMIN", refId: `seed-rich:grant:${g.to}:${g.daysAgo}:${g.amount}`,
      note: g.note, actorId: admin && admin.id !== userId ? admin.id : null,
    });
  }

  // ── 3) Mua vật phẩm cửa hàng ──
  for (const b of SHOP_BUYS) {
    const item = items.get(b.item);
    if (!item) continue;
    const userId = dir.id(b.who);
    const at = cap(Math.max(nowMs - b.daysAgo * DAY_MS - (sha(`shop:${b.who}:${b.item}`)[0] % 12) * HOUR_MS, floorOf(b.who) + 3 * HOUR_MS));
    push({
      userId, at, type: "SPEND_SHOP", amount: -item.price, refType: "SHOP_ITEM", refId: item.id,
      after: async (tx) => {
        if (await tx.userInventory.findUnique({ where: { userId_itemId: { userId, itemId: item.id } }, select: { id: true } })) return;
        if (b.equip) await tx.userInventory.updateMany({ where: { userId, kind: item.kind, equipped: true }, data: { equipped: false } });
        await tx.userInventory.create({ data: { userId, itemId: item.id, kind: item.kind, equipped: b.equip, acquiredAt: new Date(at), updatedAt: new Date(at) } });
      },
    });
  }

  // ── 4) Chợ tài liệu ──
  const market = await seedMarketplace({ dir, now, floorOf, push, cap });

  // ── 5) Ghi sổ cái theo thứ tự thời gian (bổ sung "thưởng khởi động" nếu có ai sắp âm số dư) ──
  const fresh: Entry[] = [];
  for (const e of entries) {
    if (!(await prisma.coinTransaction.findUnique({ where: { type_refType_refId_userId: { type: e.type, refType: e.refType, refId: e.refId, userId: e.userId } }, select: { id: true } }))) fresh.push(e);
  }
  fresh.sort((a, b) => a.at - b.at || a.seq - b.seq);
  const wallets = new Map((await prisma.coinWallet.findMany({ where: { userId: { in: userIds } } })).map((w) => [w.userId, w]));
  const bal = new Map([...wallets].map(([id, w]) => [id, w.balance]));
  const ordered: Entry[] = [];
  let topups = 0;
  for (const e of fresh) {
    const have = bal.get(e.userId) ?? 0;
    if (e.amount < 0 && have + e.amount < 0) {
      const need = Math.ceil((-e.amount - have) / 50) * 50;
      ordered.push({ userId: e.userId, at: e.at - MIN_MS, seq: -1, type: "ADJUST_ADMIN", amount: need, refType: "ADMIN", refId: `seed-rich:topup:${e.refId}`, note: "Thưởng bổ sung cho thành viên tích cực", actorId: admin && admin.id !== e.userId ? admin.id : null });
      bal.set(e.userId, have + need);
      topups += 1;
    }
    ordered.push(e);
    bal.set(e.userId, (bal.get(e.userId) ?? 0) + e.amount);
  }

  const firstAt = new Map<string, number>();
  for (const e of ordered) if (!firstAt.has(e.userId)) firstAt.set(e.userId, e.at);
  let walletsNew = 0;
  for (const [userId, at] of firstAt) {
    if (wallets.has(userId)) continue;
    const created = await prisma.coinWallet.create({ data: { userId, balance: 0, lifetimeEarned: 0, lifetimeSpent: 0, createdAt: new Date(at), updatedAt: new Date(at) } });
    wallets.set(userId, created);
    walletsNew += 1;
  }

  let ledgerNew = 0;
  let skipped = 0;
  for (const e of ordered) {
    const done = await prisma.$transaction(async (tx) => {
      const delta = walletDeltaOf(e.type, e.amount);
      const res = await tx.coinWallet.updateMany({
        where: { userId: e.userId, balance: { gte: delta.balance < 0 ? -delta.balance : 0, lte: LIMITS.coins.balanceMax - Math.max(delta.balance, 0) } },
        data: { balance: { increment: delta.balance }, lifetimeEarned: { increment: delta.earned }, lifetimeSpent: { increment: delta.spent }, version: { increment: 1 }, updatedAt: new Date(e.at) },
      });
      if (res.count === 0) return false; // không đủ xu (không xảy ra sau bước bổ sung) — bỏ dòng này
      const w = await tx.coinWallet.findUniqueOrThrow({ where: { userId: e.userId } });
      await tx.coinTransaction.create({
        data: {
          userId: e.userId, amount: e.amount, type: e.type, refType: e.refType, refId: e.refId, balanceAfter: w.balance,
          counterpartyId: e.counterpartyId ?? null, note: e.note ?? null, actorId: e.actorId ?? null, at: new Date(e.at),
        },
      });
      if (e.after) await e.after(tx);
      return true;
    });
    if (done) ledgerNew += 1;
    else skipped += 1;
  }
  await market.finish();

  return `Coins: +${walletsNew} ví, +${ledgerNew} giao dịch (${topups} thưởng bổ sung${skipped ? `, ${skipped} bỏ vì thiếu xu` : ""}), +${progressNew} tiến độ nhiệm vụ (${claims} đã nhận), +${market.listings} tin niêm yết, +${market.purchases} lượt mua`;
};

interface MarketCtx {
  dir: { id(key: string): string };
  now: Date;
  floorOf: (key: string) => number;
  push: (e: Omit<Entry, "seq">) => void;
  cap: (ms: number) => number;
}

/** Tin niêm yết + lượt mua (bản ghi `MarketplacePurchase`, bản sao bộ học cho người mua và 3 dòng sổ cái của mỗi lượt). */
async function seedMarketplace(m: MarketCtx): Promise<{ listings: number; purchases: number; finish: () => Promise<void> }> {
  const nowMs = m.now.getTime();
  const sets = (await prisma.studySet.findMany({ where: { visibility: "PUBLIC", status: "ACTIVE" } })).filter((s) => !s.deletedAt);
  const byTitle = new Map<string, { id: string; sellerId: string; price: number; status: string; createdAt: Date; setId: string }>();
  let listings = 0;
  for (const spec of LISTINGS) {
    const sellerId = m.dir.id(spec.seller);
    const set = sets.find((s) => s.ownerId === sellerId && s.title === spec.setTitle);
    if (!set) continue;
    let row = await prisma.marketplaceListing.findUnique({ where: { contentType_contentId: { contentType: "STUDY_SET", contentId: set.id } } });
    if (!row) {
      const createdAt = new Date(m.cap(Math.max(nowMs - spec.daysAgo * DAY_MS, set.createdAt.getTime() + 3 * HOUR_MS, m.floorOf(spec.seller) + 3 * HOUR_MS)));
      row = await prisma.marketplaceListing.create({
        data: {
          sellerId, contentType: "STUDY_SET", contentId: set.id, title: spec.title, normalizedTitle: normalizeSearch(spec.title), description: spec.description,
          tags: spec.tags, price: spec.price, status: spec.status ?? "ACTIVE", sales: 0, reportCount: spec.reports ?? 0, hiddenReason: null, createdAt, updatedAt: createdAt,
        },
      });
      listings += 1;
    }
    byTitle.set(spec.setTitle, { id: row.id, sellerId, price: row.price, status: row.status, createdAt: row.createdAt, setId: set.id });
  }

  let purchases = 0;
  for (const b of MARKET_BUYS) {
    const l = byTitle.get(b.listing);
    const buyerId = m.dir.id(b.buyer);
    if (!l || l.status !== "ACTIVE" || l.sellerId === buyerId) continue;
    let p = await prisma.marketplacePurchase.findUnique({ where: { listingId_buyerId: { listingId: l.id, buyerId } } });
    if (!p) {
      const lo = Math.max(l.createdAt.getTime() + HOUR_MS, m.floorOf(b.buyer) + 3 * HOUR_MS);
      const at = new Date(m.cap(Math.max(lo, l.createdAt.getTime() + b.at * (nowMs - 30 * MIN_MS - l.createdAt.getTime()))));
      p = await prisma.marketplacePurchase.create({
        data: { id: newObjectId(), listingId: l.id, buyerId, price: l.price, fee: Math.floor((l.price * FEE_PERCENT) / 100), accessRef: null, refundedAt: null, createdAt: at },
      });
      purchases += 1;
    }
    const at = p.createdAt.getTime();
    const base = { refType: "PURCHASE" as const, refId: p.id };
    // Giống `CoinLedgerService.transfer`: người mua −giá, người bán +giá rồi −phí đốt.
    m.push({ ...base, userId: buyerId, at, type: "SPEND_MARKETPLACE", amount: -p.price, counterpartyId: l.sellerId });
    m.push({ ...base, userId: l.sellerId, at: at + 1, type: "EARN_SALE", amount: p.price, counterpartyId: buyerId });
    if (p.fee > 0) m.push({ ...base, userId: l.sellerId, at: at + 2, type: "BURN_FEE", amount: -p.fee, counterpartyId: null });
  }

  return {
    listings,
    purchases,
    // Chạy SAU khi sổ cái đã ghi: cấp bản sao bộ học cho người mua và chốt số lượt bán của từng tin.
    finish: async () => {
      for (const l of byTitle.values()) {
        for (const p of await prisma.marketplacePurchase.findMany({ where: { listingId: l.id, accessRef: null } })) {
          const source = await prisma.studySet.findUnique({ where: { id: l.setId } });
          const srcItems = await prisma.studyItem.findMany({ where: { setId: l.setId }, orderBy: { order: "asc" } });
          if (!source) continue;
          const copyId = newObjectId();
          const createdAt = new Date(p.createdAt.getTime() + 2000);
          await prisma.studySet.create({
            data: {
              id: copyId, ownerId: p.buyerId, workspaceId: null, title: source.title, normalizedTitle: source.normalizedTitle, description: source.description,
              tags: source.tags.filter((t) => !t.startsWith("seed-rich:")), coverAssetId: null, language: source.language, visibility: "PRIVATE", status: "ACTIVE",
              hiddenReason: null, hiddenBy: null, hiddenAt: null, itemCount: srcItems.length, itemTypesMask: source.itemTypesMask, copiedFromId: source.id, deletedAt: null,
              createdAt, updatedAt: createdAt,
            },
          });
          if (srcItems.length > 0) {
            await prisma.studyItem.createMany({
              data: srcItems.map((i) => ({
                setId: copyId, ownerId: p.buyerId, order: i.order, type: i.type, prompt: i.prompt, answerText: i.answerText, options: i.options, correctOptionIds: i.correctOptionIds,
                acceptedAnswers: i.acceptedAnswers, matchMode: i.matchMode, explanation: i.explanation, frontMediaAssetId: null, backMediaAssetId: null, audioAssetId: null, tags: i.tags,
                createdAt, updatedAt: createdAt,
              })),
            });
          }
          await prisma.marketplacePurchase.update({ where: { id: p.id }, data: { accessRef: copyId } });
        }
        const sales = await prisma.marketplacePurchase.count({ where: { listingId: l.id } });
        await prisma.marketplaceListing.updateMany({ where: { id: l.id, sales: { not: sales } }, data: { sales } });
      }
    },
  };
}
