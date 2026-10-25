import { LIMITS } from "../../../core/constants/limits";
import { initialNewState, initialWrongState, lapse, nextEasiness, RATING_GRADE, resumeStatus, review, type SrState } from "../services/sm2";

const TZ = "Asia/Ho_Chi_Minh";
/** 10:00 ngày 21/09/2026 giờ Việt Nam. */
const DAY0 = new Date("2026-09-21T03:00:00.000Z");
const at = (days: number) => new Date(DAY0.getTime() + days * 86_400_000);
const localMidnight = (days: number) => new Date(Date.UTC(2026, 8, 21 + days) - 7 * 3_600_000);

describe("sm2 (thuần)", () => {
  it("ST-07: ôn thẻ mới mức EASY ba ngày liên tiếp → interval 1 → 6 → 16, EF 2.6 → 2.7 → 2.8", () => {
    const s1 = review(initialNewState(DAY0), "EASY", at(0), TZ);
    expect([s1.interval, s1.easiness, s1.repetition, s1.status]).toEqual([1, 2.6, 1, "REVIEW"]);

    const s2 = review(s1, "EASY", at(1), TZ);
    expect([s2.interval, s2.easiness, s2.repetition]).toEqual([6, 2.7, 2]);

    // Khoảng ôn dùng EF TRƯỚC lượt này: round(6 × 2.7) = 16 (plan cũ ghi 15).
    const s3 = review(s2, "EASY", at(7), TZ);
    expect([s3.interval, s3.easiness, s3.repetition]).toEqual([16, 2.8, 3]);
  });

  it("nextReviewAt = 00:00 ngày địa phương + interval (không phải now + interval × 24h)", () => {
    const s1 = review(initialNewState(DAY0), "GOOD", at(0), TZ);
    expect(s1.nextReviewAt).toEqual(localMidnight(1));
    const s2 = review(s1, "GOOD", at(1), TZ);
    expect(s2.nextReviewAt).toEqual(localMidnight(1 + 6));
  });

  it("AGAIN/HARD mapping q = 1/3/4/5 và AGAIN đặt lại về học (interval 1, repetition 0, lapses + 1)", () => {
    expect(RATING_GRADE).toEqual({ AGAIN: 1, HARD: 3, GOOD: 4, EASY: 5 });
    const mature: SrState = { ...initialNewState(DAY0), status: "REVIEW", interval: 30, repetition: 5, easiness: 2.5 };
    const again = review(mature, "AGAIN", at(0), TZ);
    expect(again).toMatchObject({ status: "LEARNING", interval: 1, repetition: 0, lapses: 1, easiness: 1.96, lastRating: "AGAIN" });
    expect(again.nextReviewAt).toEqual(localMidnight(1));

    const hard = review(mature, "HARD", at(0), TZ);
    expect(hard).toMatchObject({ status: "REVIEW", repetition: 6, interval: 75, easiness: 2.36 }); // q = 3: EF − 0.14, interval = round(30 × 2.5)
  });

  it("EF không xuống dưới sàn 1.3", () => {
    let s: SrState = { ...initialNewState(DAY0), easiness: 1.4 };
    for (let i = 0; i < 5; i += 1) s = review(s, "AGAIN", at(i), TZ);
    expect(s.easiness).toBe(1.3);
    expect(nextEasiness(1.3, 1)).toBe(1.3);
  });

  it("khoảng ôn có trần LIMITS.sr.intervalMaxDays (365)", () => {
    const old: SrState = { ...initialNewState(DAY0), status: "REVIEW", interval: 300, repetition: 9, easiness: 2.5 };
    expect(review(old, "GOOD", at(0), TZ).interval).toBe(LIMITS.sr.intervalMaxDays);
  });

  it("lapse (thi thử sai, thẻ đã có tiến độ) ≈ q = 2 và không đổi lastRating/lastReviewedAt", () => {
    const mature: SrState = { ...initialNewState(DAY0), status: "REVIEW", interval: 10, repetition: 3, easiness: 2.5, lastRating: "GOOD", lastReviewedAt: at(-1) };
    const l = lapse(mature, at(0), TZ);
    expect(l).toMatchObject({ status: "LEARNING", interval: 1, repetition: 0, lapses: 1, easiness: 2.18, lastRating: "GOOD" });
    expect(l.lastReviewedAt).toEqual(at(-1));
    expect(l.nextReviewAt).toEqual(localMidnight(1));
  });

  it("trạng thái khởi tạo: thẻ sai lần đầu (LEARNING interval 1, mai 00:00) và thẻ mới (NEW, now)", () => {
    expect(initialWrongState(DAY0, TZ)).toMatchObject({ status: "LEARNING", interval: 1, repetition: 0, lapses: 0, nextReviewAt: localMidnight(1) });
    expect(initialNewState(DAY0)).toMatchObject({ status: "NEW", interval: 0, nextReviewAt: DAY0 });
  });

  it("resumeStatus: NEW / LEARNING / REVIEW theo dấu vết học", () => {
    expect(resumeStatus({ interval: 0, repetition: 0 })).toBe("NEW");
    expect(resumeStatus({ interval: 1, repetition: 0 })).toBe("LEARNING");
    expect(resumeStatus({ interval: 6, repetition: 2 })).toBe("REVIEW");
  });
});
