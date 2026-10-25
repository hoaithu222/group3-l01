import { newObjectId } from "../../../core/utils/object-id";
import { expectCode, makeKit, user, type Kit } from "./mentor-test-kit";

describe("MentorAcceptService — chấp nhận cố vấn (be.md §5 accept)", () => {
  let k: Kit;
  const ws = newObjectId();
  const owner = user();
  const pubChannel = newObjectId();
  const privChannel = newObjectId();

  beforeEach(() => {
    k = makeKit();
    k.setRole(ws, owner.id, "OWNER");
    k.channels.push(
      { id: pubChannel, workspaceId: ws, name: "Chung", status: "ACTIVE", visibility: "PUBLIC" },
      { id: privChannel, workspaceId: ws, name: "Riêng", status: "ACTIVE", visibility: "PRIVATE" }
    );
  });

  function scenario(mentorsNeeded = 1) {
    const post = k.posts.seed({ workspaceId: ws, createdBy: owner.id, mentorsNeeded });
    const mentor = user();
    const app = k.applications.seed({ postId: post.id, workspaceId: ws, applicantId: mentor.id });
    return { post, mentor, app };
  }
  const dto = (over: object = {}) => ({ durationDays: 30, channelIds: [pubChannel], createConversation: true, includeMemberIds: [], expectedPostVersion: 1, ...over });

  it("IR-01 (service) — GUEST có hạn + nhãn MENTOR + kênh chỉ định; đợt ACTIVE; bài FULFILLED; outbox mentor.accepted; audit", async () => {
    const { post, mentor, app } = scenario();
    const res = await k.services.accept.accept(owner, app.id, dto());

    expect(res.conversationId).toBeNull();
    expect(res.engagement).toMatchObject({ status: "ACTIVE", totalDays: 30, channelIds: [pubChannel], mentor: { id: mentor.id } });
    const [grant] = k.membership.grants;
    expect(grant).toMatchObject({ workspaceId: ws, userId: mentor.id, displayTag: "MENTOR", channelIds: [pubChannel], grantedBy: owner.id });
    expect(grant.expiresAt.getTime() - k.clock.now.getTime()).toBe(30 * 86_400_000);
    expect(k.membership.afterCalls).toBe(1);
    expect(await k.posts.findById(post.id)).toMatchObject({ status: "FULFILLED", activeEngagements: 1, version: 2 });
    expect((await k.applications.findById(app.id))?.status).toBe("ACCEPTED");
    expect(k.outbox.events).toEqual([
      expect.objectContaining({ jobName: "mentor.accepted-effects", dedupeKey: `mentor.accepted:engagement:${res.engagement.id}` }),
    ]);
    expect(k.audits).toEqual([{ action: "mentor.accept", targetId: res.engagement.id }]);
  });

  it("bỏ trống durationDays → dùng số ngày mặc định của hệ thống (SystemConfig mentor.defaultDurationDays); có gửi thì tôn trọng giá trị gửi", async () => {
    k.settings.defaultDays = 45;
    const a = scenario();
    const defaulted = await k.services.accept.accept(owner, a.app.id, dto({ durationDays: undefined }));
    expect(defaulted.engagement.totalDays).toBe(45);
    expect(k.membership.grants[0]?.expiresAt.getTime()).toBe(k.clock.now.getTime() + 45 * 86_400_000);

    const b = scenario();
    const explicit = await k.services.accept.accept(owner, b.app.id, dto({ durationDays: 14 }));
    expect(explicit.engagement.totalDays).toBe(14);
    expect(k.membership.grants[1]?.expiresAt.getTime()).toBe(k.clock.now.getTime() + 14 * 86_400_000);
  });

  it("acceptSchema: durationDays tuỳ chọn; có gửi thì phải trong [7, 60]", async () => {
    const { acceptSchema } = await import("../dtos");
    const base = { channelIds: [pubChannel], expectedPostVersion: 1 };
    expect(acceptSchema.safeParse(base).success).toBe(true);
    expect(acceptSchema.safeParse({ ...base, durationDays: 7 }).success).toBe(true);
    expect(acceptSchema.safeParse({ ...base, durationDays: 60 }).success).toBe(true);
    expect(acceptSchema.safeParse({ ...base, durationDays: 6 }).success).toBe(false);
    expect(acceptSchema.safeParse({ ...base, durationDays: 61 }).success).toBe(false);
  });

  it("mentorsNeeded=2: chấp nhận người đầu → bài vẫn OPEN, version tăng", async () => {
    const { post, app } = scenario(2);
    await k.services.accept.accept(owner, app.id, dto());
    expect(await k.posts.findById(post.id)).toMatchObject({ status: "OPEN", activeEngagements: 1, version: 2 });
  });

  it("IR-22 (service) — expectedPostVersion lệch (người khác vừa chấp nhận) → 409 MENTOR_005, không cấp khách", async () => {
    const { post, app } = scenario(1);
    const other = k.applications.seed({ postId: post.id, workspaceId: ws, applicantId: newObjectId() });
    await k.services.accept.accept(owner, app.id, dto());
    await expectCode(k.services.accept.accept(owner, other.id, dto()), "MENTOR_005", 409);
    expect(k.membership.grants).toHaveLength(1);
  });

  it("kênh riêng tư người duyệt không quản lý / kênh nhóm khác / kênh lưu trữ → 400 MENTOR_008 (details.channelIds)", async () => {
    const { app } = scenario();
    const archived = newObjectId();
    const foreign = newObjectId();
    k.channels.push({ id: archived, workspaceId: ws, name: "Cũ", status: "ARCHIVED", visibility: "PUBLIC" });
    k.channels.push({ id: foreign, workspaceId: newObjectId(), name: "Khác", status: "ACTIVE", visibility: "PUBLIC" });
    await expect(k.services.accept.accept(owner, app.id, dto({ channelIds: [pubChannel, privChannel, archived, foreign] }))).rejects.toMatchObject({
      errorCode: "MENTOR_008",
      details: { channelIds: [privChannel, archived, foreign] },
    });
    k.manageableChannels.add(privChannel);
    await expect(k.services.accept.accept(owner, app.id, dto({ channelIds: [privChannel] }))).resolves.toBeDefined();
  });

  it("người ứng tuyển đã thành thành viên → 400 MENTOR_004; đơn đã rút → 409 MENTOR_010", async () => {
    const { mentor, app, post } = scenario();
    k.membership.set(ws, mentor.id, "ACTIVE");
    await expectCode(k.services.accept.accept(owner, app.id, dto()), "MENTOR_004", 400);
    const withdrawn = k.applications.seed({ postId: post.id, workspaceId: ws, applicantId: newObjectId(), status: "WITHDRAWN" });
    await expectCode(k.services.accept.accept(owner, withdrawn.id, dto()), "MENTOR_010", 409);
  });

  it("thành viên thường → 403 PERM_001; khách → 404; bài đã đóng → 409 MENTOR_002", async () => {
    const { app, post } = scenario();
    const member = user();
    const guest = user();
    k.setRole(ws, member.id, "MEMBER");
    k.setRole(ws, guest.id, "GUEST");
    await expectCode(k.services.accept.accept(member, app.id, dto()), "PERM_001", 403);
    await expectCode(k.services.accept.accept(guest, app.id, dto()), "PERM_404", 404);
    await k.posts.close({} as never, post.id, new Date());
    await expectCode(k.services.accept.accept(owner, app.id, dto({ expectedPostVersion: 2 })), "MENTOR_002", 409);
  });
});
