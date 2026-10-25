import { AUTHOR, OWNER } from "./support/harness";
import { makeLearningHarness, seedQuizSet } from "./support/learning-harness";

const DAY = 86_400_000;

describe("SrReminderService — nhắc ôn hằng ngày theo múi giờ (p4-02)", () => {
  async function setup() {
    const h = makeLearningHarness();
    const { setId } = await seedQuizSet(h, 2);
    await h.sr.enroll(AUTHOR, { setId });
    return { h, setId };
  }

  it("07:00 giờ địa phương: chỉ người ở múi giờ đang là 07:00 và có thẻ cần ôn nhận một thông báo; dedupeKey theo ngày địa phương", async () => {
    const { h } = await setup();
    h.users.timezones.set(AUTHOR.id, "Asia/Ho_Chi_Minh");
    h.clock.now = new Date("2026-09-21T00:30:00.000Z"); // 07:30 tại Hà Nội, 17:30 (hôm trước) tại Los Angeles

    expect(await h.srReminder.run()).toBe(1);
    expect(h.notifier.sent).toHaveLength(1);
    expect(h.notifier.sent[0]).toMatchObject({
      type: "study.sr-due-reminder",
      scope: null,
      recipients: [{ userId: AUTHOR.id }],
      dedupeKey: `sr-due:${AUTHOR.id}:2026-09-21`,
      refs: { dueCount: 2, localDate: "2026-09-21" },
    });
  });

  it("không đúng giờ nhắc (múi giờ khác 07:00) hoặc không có thẻ đến hạn → không gửi", async () => {
    const { h } = await setup();
    h.users.timezones.set(AUTHOR.id, "America/Los_Angeles");
    h.users.timezones.set(OWNER.id, "Asia/Ho_Chi_Minh");
    h.clock.now = new Date("2026-09-21T00:30:00.000Z"); // Hà Nội 07:30 nhưng AUTHOR ở Los Angeles (17:30)
    expect(await h.srReminder.run()).toBe(0); // OWNER đúng giờ nhưng không có thẻ nào

    h.clock.now = new Date("2026-09-21T14:30:00.000Z"); // Los Angeles 07:30 (PDT)
    expect(await h.srReminder.run()).toBe(1);
    expect(h.notifier.sent[0].dedupeKey).toBe(`sr-due:${AUTHOR.id}:2026-09-21`);
  });

  it("chạy lại trong cùng giờ/ngày không nhắc hai lần (Notification.dedupeKey); sang ngày mới nhắc lại", async () => {
    const { h } = await setup();
    h.users.timezones.set(AUTHOR.id, "Asia/Ho_Chi_Minh");
    h.clock.now = new Date("2026-09-21T00:10:00.000Z");
    await h.srReminder.run();
    await h.srReminder.run();
    expect(h.notifier.sent).toHaveLength(1);

    h.clock.now = new Date(h.clock.now.getTime() + DAY);
    await h.srReminder.run();
    expect(h.notifier.sent.map((n) => n.dedupeKey)).toEqual([`sr-due:${AUTHOR.id}:2026-09-21`, `sr-due:${AUTHOR.id}:2026-09-22`]);
  });

  it("bỏ qua người không còn hoạt động; người mất quyền bộ (thẻ SUSPENDED) không được nhắc", async () => {
    const { h, setId } = await setup();
    h.users.timezones.set(AUTHOR.id, "Asia/Ho_Chi_Minh");
    h.clock.now = new Date("2026-09-21T00:30:00.000Z");
    h.users.inactive.add(AUTHOR.id);
    expect(await h.srReminder.run()).toBe(0);

    h.users.inactive.delete(AUTHOR.id);
    await h.setService.remove(AUTHOR, setId);
    expect(await h.srReminder.run()).toBe(0);
    expect(h.notifier.sent).toHaveLength(0);
  });

  it("lỗi khi gửi cho một người bị nuốt + ghi log, không làm hỏng cả job", async () => {
    const { h } = await setup();
    h.users.timezones.set(AUTHOR.id, "Asia/Ho_Chi_Minh");
    h.clock.now = new Date("2026-09-21T00:30:00.000Z");
    const original = h.notifier.notify.bind(h.notifier);
    let calls = 0;
    h.notifier.notify = (tx, input) => {
      calls += 1;
      return calls === 1 ? Promise.reject(new Error("notify lỗi")) : original(tx, input);
    };
    expect(await h.srReminder.run()).toBe(0); // lỗi được nuốt + log, không ném ra job
    expect(calls).toBe(1);
  });
});
