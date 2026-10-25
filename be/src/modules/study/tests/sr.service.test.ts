import { LIMITS } from "../../../core/constants/limits";
import { AUTHOR, MEMBER, STRANGER, WS, flash, mc, seedSet } from "./support/harness";
import { makeLearningHarness, seedQuizSet, type LearningHarness } from "./support/learning-harness";

const DAY = 86_400_000;
let seq = 0;
const rid = () => `review-${(seq += 1).toString().padStart(6, "0")}`;
const advance = (h: LearningHarness, ms: number) => {
  h.clock.now = new Date(h.clock.now.getTime() + ms);
};
const rows = (h: LearningHarness) => [...h.progress.rows.values()];
const review = (h: LearningHarness, itemId: string, rating: "AGAIN" | "HARD" | "GOOD" | "EASY", user = AUTHOR) =>
  h.srReview.review(user, { itemId, rating, clientReviewId: rid() });

describe("SrService + SrReviewService — đăng ký, hàng đợi, ôn, tóm tắt (p4-02)", () => {
  it("đăng ký ôn cả bộ: mọi mục (kể cả thẻ ghi nhớ) thành thẻ NEW theo thứ tự bộ; đăng ký lại không nhân bản; bộ rỗng → SR_002; người ngoài → 404", async () => {
    const h = makeLearningHarness();
    const { setId, items } = await seedQuizSet(h, 2, 2);
    const res = await h.sr.enroll(AUTHOR, { setId });
    expect(res).toEqual({ setId, enrolledItems: 4, newPerDay: LIMITS.sr.newPerDay });
    expect(rows(h).map((r) => r.status)).toEqual(["NEW", "NEW", "NEW", "NEW"]);
    expect(rows(h).map((r) => r.itemOrder)).toEqual(items.map((i) => i.order));

    await h.sr.enroll(AUTHOR, { setId, newPerDay: 5 });
    expect(rows(h)).toHaveLength(4);
    expect((await h.enrollments.find(AUTHOR.id, setId))?.newPerDay).toBe(5);

    const empty = await h.setService.create(AUTHOR, { title: "Rỗng", tags: [], visibility: "PRIVATE" });
    await expect(h.sr.enroll(AUTHOR, { setId: empty.id })).rejects.toMatchObject({ errorCode: "SR_002", statusCode: 409 });
    await expect(h.sr.enroll(STRANGER, { setId })).rejects.toMatchObject({ statusCode: 404 });
  });

  it("thẻ mới/ngày: chỉ đưa newPerDay thẻ mới vào hàng đợi; ôn một thẻ mới thì hạn mức còn lại giảm; sang ngày mới được thêm", async () => {
    const h = makeLearningHarness();
    const { setId } = await seedQuizSet(h, 5);
    await h.sr.enroll(AUTHOR, { setId, newPerDay: 3 });

    const q1 = await h.sr.due(AUTHOR, { limit: 50 });
    expect(q1.items).toHaveLength(3);
    expect(q1.items.every((i) => i.status === "NEW")).toBe(true);
    expect(q1.remainingToday).toBe(0);

    await review(h, q1.items[0].itemId, "GOOD");
    const q2 = await h.sr.due(AUTHOR, { limit: 50 });
    expect(q2.items).toHaveLength(2); // 3 − 1 đã ôn hôm nay; thẻ vừa ôn hẹn ngày mai
    expect(q2.items.map((i) => i.itemId)).not.toContain(q1.items[0].itemId);

    advance(h, DAY);
    const q3 = await h.sr.due(AUTHOR, { limit: 50 });
    expect(q3.items.filter((i) => i.status === "NEW")).toHaveLength(3);
    expect(q3.items.filter((i) => i.status === "REVIEW")).toHaveLength(1);
  });

  it("due kèm nội dung thẻ (chế độ học) và giới hạn theo limit; remainingToday = phần chưa trả", async () => {
    const h = makeLearningHarness();
    const { setId } = await seedQuizSet(h, 4);
    await h.sr.enroll(AUTHOR, { setId });
    const q = await h.sr.due(AUTHOR, { limit: 3 });
    expect(q.items).toHaveLength(3);
    expect(q.remainingToday).toBe(1);
    expect(q.items[0]).toMatchObject({ setTitle: "Bộ thi thử", type: "MULTIPLE_CHOICE" });
    expect(q.items[0].correctOptionIds).toHaveLength(1);
  });

  it("ST-07 (qua dịch vụ): ôn thẻ mới mức EASY ba lần theo lịch → interval 1 → 6 → 16, EF 2.6 → 2.7 → 2.8", async () => {
    const h = makeLearningHarness();
    const { setId, items } = await seedQuizSet(h, 1);
    await h.sr.enroll(AUTHOR, { setId });
    const itemId = items[0].id;

    const r1 = await review(h, itemId, "EASY");
    expect(r1.progress).toMatchObject({ interval: 1, easiness: 2.6, status: "REVIEW", repetition: 1 });
    advance(h, DAY);
    expect((await h.sr.due(AUTHOR, { limit: 50 })).items.map((i) => i.itemId)).toEqual([itemId]);
    const r2 = await review(h, itemId, "EASY");
    expect(r2.progress).toMatchObject({ interval: 6, easiness: 2.7 });
    advance(h, 6 * DAY);
    const r3 = await review(h, itemId, "EASY");
    expect(r3.progress).toMatchObject({ interval: 16, easiness: 2.8 });
    // Hẹn 00:00 ngày địa phương thứ 16 sau lượt ôn cuối (ngày 28/09 + 16 = 14/10).
    expect(r3.progress.nextReviewAt).toBe("2026-10-13T17:00:00.000Z");
  });

  it("idempotent theo clientReviewId: trùng → trả tiến độ hiện tại, không ôn hai lần, không thêm log/sự kiện", async () => {
    const h = makeLearningHarness();
    const { setId, items } = await seedQuizSet(h, 1);
    await h.sr.enroll(AUTHOR, { setId });
    const dto = { itemId: items[0].id, rating: "GOOD" as const, clientReviewId: "client-review-dup-1" };
    const first = await h.srReview.review(AUTHOR, dto);
    const again = await h.srReview.review(AUTHOR, dto);
    expect(again.progress).toEqual(first.progress);
    expect(h.logs.rows).toHaveLength(1);
    expect(rows(h)[0].version).toBe(2);
    expect(h.outbox.ofType("sr.reviewed")).toHaveLength(1);
  });

  it("sr.reviewed: MỘT sự kiện cho mỗi thẻ mỗi ngày (ôn lại cùng ngày không phát thêm), qua gamification/xp.consume", async () => {
    const h = makeLearningHarness();
    const { setId, items } = await seedQuizSet(h, 1);
    await h.sr.enroll(AUTHOR, { setId });
    await review(h, items[0].id, "AGAIN");
    await review(h, items[0].id, "GOOD");
    const events = h.outbox.ofType("sr.reviewed");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      queue: "gamification",
      jobName: "xp.consume",
      dedupeKey: `sr.reviewed:user:${AUTHOR.id}:2026-09-21:${items[0].id}`,
      payload: { userId: AUTHOR.id, itemId: items[0].id, grade: 1, localDate: "2026-09-21" },
    });
    advance(h, DAY);
    await review(h, items[0].id, "GOOD");
    expect(h.outbox.ofType("sr.reviewed")).toHaveLength(2);
  });

  it("reviewedAt bị kẹp về [now − 24h, now] (không tin đồng hồ máy)", async () => {
    const h = makeLearningHarness();
    const { setId, items } = await seedQuizSet(h, 2);
    await h.sr.enroll(AUTHOR, { setId });
    await h.srReview.review(AUTHOR, { itemId: items[0].id, rating: "GOOD", clientReviewId: rid(), reviewedAt: new Date(h.clock.now.getTime() + 10 * DAY) });
    await h.srReview.review(AUTHOR, { itemId: items[1].id, rating: "GOOD", clientReviewId: rid(), reviewedAt: new Date(h.clock.now.getTime() - 10 * DAY) });
    const [a, b] = rows(h);
    expect(a.lastReviewedAt).toEqual(h.clock.now);
    expect(b.lastReviewedAt).toEqual(new Date(h.clock.now.getTime() - DAY));
  });

  it("SR_003: quá reviewsPerDayMax lượt ôn/ngày → 429; SR_001: thẻ tạm ngừng thủ công; mục không có tiến độ → 404", async () => {
    const h = makeLearningHarness();
    const { setId, items } = await seedQuizSet(h, 3);
    await h.sr.enroll(AUTHOR, { setId });
    const sr = LIMITS.sr as { reviewsPerDayMax: number };
    const original = sr.reviewsPerDayMax;
    sr.reviewsPerDayMax = 2;
    try {
      await review(h, items[0].id, "GOOD");
      await review(h, items[1].id, "GOOD");
      await expect(review(h, items[2].id, "GOOD")).rejects.toMatchObject({ errorCode: "SR_003", statusCode: 429 });
    } finally {
      sr.reviewsPerDayMax = original;
    }
    Object.assign(rows(h).find((r) => r.itemId === items[2].id)!, { status: "SUSPENDED", suspendedReason: "PAUSED" });
    await expect(review(h, items[2].id, "GOOD")).rejects.toMatchObject({ errorCode: "SR_001", statusCode: 409 });
    await expect(review(h, "e".repeat(24), "GOOD")).rejects.toMatchObject({ statusCode: 404 });
    await expect(review(h, items[0].id, "GOOD", STRANGER)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("ST-24: chủ bộ đổi WORKSPACE → PRIVATE khi người khác có thẻ đến hạn → due không trả thẻ, tiến độ SUSPENDED; đổi lại → mở lại", async () => {
    const h = makeLearningHarness();
    const set = await seedSet(h, { visibility: "WORKSPACE", workspaceId: WS });
    const saved = await h.bulk.save(AUTHOR, set.id, { expectedVersion: set.version, upsert: [mc("a"), mc("b"), flash("c")], delete: [] } as never);
    await h.sr.enroll(MEMBER, { setId: set.id });
    expect((await h.sr.due(MEMBER, { limit: 50 })).items).toHaveLength(3);
    const firstItem = rows(h)[0].itemId;

    const priv = await h.setService.patch(AUTHOR, set.id, { expectedVersion: saved.version, visibility: "PRIVATE" } as never);
    const hidden = await h.sr.due(MEMBER, { limit: 50 });
    expect(hidden.items).toEqual([]);
    expect(rows(h).every((r) => r.status === "SUSPENDED" && r.suspendedReason === "LOST_ACCESS")).toBe(true);
    await expect(review(h, firstItem, "GOOD", MEMBER)).rejects.toMatchObject({ statusCode: 404 });
    expect((await h.sr.summary(MEMBER, {})).dueToday).toBe(0);

    await h.setService.patch(AUTHOR, set.id, { expectedVersion: priv.version, visibility: "WORKSPACE", workspaceId: WS } as never);
    const back = await h.sr.due(MEMBER, { limit: 50 });
    expect(back.items).toHaveLength(3);
    expect(rows(h).every((r) => r.status === "NEW" && r.suspendedReason === null)).toBe(true);
  });

  it("bộ bị xoá → tiến độ SUSPENDED (SET_HIDDEN), không lộ nội dung; tác giả vẫn ôn được bộ PRIVATE của mình", async () => {
    const h = makeLearningHarness();
    const { setId } = await seedQuizSet(h, 2);
    await h.sr.enroll(AUTHOR, { setId });
    expect((await h.sr.due(AUTHOR, { limit: 50 })).items).toHaveLength(2);
    await h.setService.remove(AUTHOR, setId);
    expect((await h.sr.due(AUTHOR, { limit: 50 })).items).toEqual([]);
    expect(rows(h).every((r) => r.suspendedReason === "SET_HIDDEN")).toBe(true);
  });

  it("mục thêm vào bộ SAU khi đăng ký được nạp vào hàng đợi (đồng bộ theo version bộ); bỏ đăng ký ngừng đưa thẻ mới nhưng thẻ đã học vẫn đến hạn", async () => {
    const h = makeLearningHarness();
    const { setId, version, items } = await seedQuizSet(h, 1);
    await h.sr.enroll(AUTHOR, { setId });
    await review(h, items[0].id, "GOOD");
    await h.bulk.save(AUTHOR, setId, { expectedVersion: version, upsert: [mc("moi")], delete: [] } as never);

    const q = await h.sr.due(AUTHOR, { limit: 50 });
    expect(rows(h)).toHaveLength(2);
    expect(q.items.map((i) => i.status)).toEqual(["NEW"]);

    await h.sr.unenroll(AUTHOR, setId);
    expect((await h.sr.due(AUTHOR, { limit: 50 })).items).toEqual([]);
    advance(h, DAY);
    expect((await h.sr.due(AUTHOR, { limit: 50 })).items.map((i) => i.itemId)).toEqual([items[0].id]);
    await expect(h.sr.unenroll(AUTHOR, "d".repeat(24))).resolves.toBeUndefined();
  });

  it("mục bị xoá khỏi bộ: due bỏ qua + dọn tiến độ mồ côi; review → 404; purgeItems (job sr.item-deleted) xoá mọi người", async () => {
    const h = makeLearningHarness();
    const { setId, version, items } = await seedQuizSet(h, 3);
    await h.sr.enroll(AUTHOR, { setId });
    await h.bulk.save(AUTHOR, setId, { expectedVersion: version, upsert: [], delete: [items[0].id] } as never);
    const deleted = h.outbox.ofType("sr.item-deleted");
    expect(deleted).toHaveLength(1);
    expect(deleted[0]).toMatchObject({ queue: "cron", jobName: "sr.item-deleted", payload: { setId, itemIds: [items[0].id] } });

    await expect(review(h, items[0].id, "GOOD")).rejects.toMatchObject({ statusCode: 404 });
    expect(rows(h).map((r) => r.itemId)).not.toContain(items[0].id);
    expect(await h.sr.purgeItems([items[1].id])).toBe(1);
  });

  it("tóm tắt: dueToday, newToday, 7 ngày tới (đủ 7 phần tử), reviewedToday, chuỗi ngày ôn liên tiếp", async () => {
    const h = makeLearningHarness();
    const { setId, items } = await seedQuizSet(h, 3);
    await h.sr.enroll(AUTHOR, { setId, newPerDay: 3 });
    expect(await h.sr.summary(AUTHOR, {})).toMatchObject({ dueToday: 0, newToday: 3, reviewedToday: 0, reviewStreakDays: 0 });

    await review(h, items[0].id, "EASY"); // interval 1 → mai
    await review(h, items[1].id, "AGAIN"); // học lại → mai
    let s = await h.sr.summary(AUTHOR, {});
    expect(s).toMatchObject({ dueToday: 0, newToday: 1, reviewedToday: 2, reviewStreakDays: 1 });
    expect(s.dueNext7Days).toHaveLength(7);
    expect(s.dueNext7Days[0]).toEqual({ date: "2026-09-22", count: 2 });
    expect(s.dueNext7Days.slice(1).every((d) => d.count === 0)).toBe(true);

    advance(h, DAY);
    await review(h, items[0].id, "GOOD");
    s = await h.sr.summary(AUTHOR, {});
    expect(s).toMatchObject({ reviewStreakDays: 2, reviewedToday: 1 });
    advance(h, DAY); // hôm nay chưa ôn nhưng hôm qua có → chuỗi chưa gãy
    expect((await h.sr.summary(AUTHOR, {})).reviewStreakDays).toBe(2);
    advance(h, DAY); // bỏ một ngày → gãy
    expect((await h.sr.summary(AUTHOR, {})).reviewStreakDays).toBe(0);
  });

  it("due/summary theo setId chỉ tính bộ đó; setId không đọc được → rỗng", async () => {
    const h = makeLearningHarness();
    const a = await seedQuizSet(h, 2);
    const b = await seedQuizSet(h, 3);
    await h.sr.enroll(AUTHOR, { setId: a.setId });
    await h.sr.enroll(AUTHOR, { setId: b.setId });
    expect((await h.sr.due(AUTHOR, { limit: 50, setId: b.setId })).items).toHaveLength(3);
    expect((await h.sr.summary(AUTHOR, { setId: a.setId })).newToday).toBe(2);
    expect((await h.sr.due(AUTHOR, { limit: 50, setId: "c".repeat(24) })).items).toEqual([]);
  });
});
