import { AUTHOR, MEMBER, WS, flash } from "./support/harness";
import { makeLearningHarness, seedQuizSet } from "./support/learning-harness";

/** p4-01/p4-02 — `GET /study-sets/:id` trả `srEnrolled` (theo NGƯỜI XEM) để app chỉ hiện "Ngừng ôn bộ này" khi đã đăng ký. */
describe("StudySetDetailDto.srEnrolled", () => {
  it("false khi chưa đăng ký → true sau enroll → false sau 'Ngừng ôn' (hàng còn nhưng active=false)", async () => {
    const h = makeLearningHarness();
    const { setId } = await seedQuizSet(h, 2);

    expect((await h.setService.get(AUTHOR, setId)).srEnrolled).toBe(false);
    await h.sr.enroll(AUTHOR, { setId });
    expect((await h.setService.get(AUTHOR, setId)).srEnrolled).toBe(true);
    await h.sr.unenroll(AUTHOR, setId);
    expect((await h.enrollments.find(AUTHOR.id, setId))?.active).toBe(false);
    expect((await h.setService.get(AUTHOR, setId)).srEnrolled).toBe(false);
  });

  it("theo người xem: người khác cùng xem được bộ không thấy đăng ký của tác giả", async () => {
    const h = makeLearningHarness();
    const set = await h.setService.create(AUTHOR, { title: "Bộ nhóm", tags: [], visibility: "WORKSPACE", workspaceId: WS });
    await h.bulk.save(AUTHOR, set.id, { expectedVersion: set.version, upsert: [flash("a")], delete: [] } as never);
    await h.sr.enroll(AUTHOR, { setId: set.id });

    expect((await h.setService.get(AUTHOR, set.id)).srEnrolled).toBe(true);
    expect((await h.setService.get(MEMBER, set.id)).srEnrolled).toBe(false);
  });

  it("bộ vừa tạo luôn srEnrolled=false", async () => {
    const h = makeLearningHarness();
    const created = await h.setService.create(AUTHOR, { title: "Mới", tags: [], visibility: "PRIVATE" });
    expect(created.srEnrolled).toBe(false);
  });
});
