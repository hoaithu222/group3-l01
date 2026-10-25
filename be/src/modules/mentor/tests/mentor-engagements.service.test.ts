import { newObjectId } from "../../../core/utils/object-id";
import { expectCode, makeKit, user, type Kit } from "./mentor-test-kit";

const DAY = 86_400_000;

describe("MentorEngagementsService — gia hạn/kết thúc (be.md §5 end/extend)", () => {
  let k: Kit;
  const ws = newObjectId();
  const owner = user();

  beforeEach(() => {
    k = makeKit();
    k.setRole(ws, owner.id, "OWNER");
  });

  function active(totalDays = 30, postOver: object = {}) {
    const post = k.posts.seed({ workspaceId: ws, createdBy: owner.id, status: "FULFILLED", activeEngagements: 1, ...postOver });
    const mentor = user();
    k.setRole(ws, mentor.id, "GUEST");
    const e = k.engagements.seed({ postId: post.id, workspaceId: ws, mentorId: mentor.id, totalDays, endsAt: new Date(Date.now() + totalDays * DAY) });
    return { post, mentor, e };
  }

  it("gia hạn trong giới hạn → endsAt + addDays, totalDays tăng, hạn khách đổi theo, audit", async () => {
    const { e, mentor } = active(30);
    const res = await k.services.engagements.extend(owner, e.id, { addDays: 30, expectedVersion: 1 });
    expect(res).toMatchObject({ totalDays: 60, version: 2 });
    expect(res.endsAt.getTime()).toBe(e.endsAt.getTime() + 30 * DAY);
    expect(k.membership.expiries).toEqual([{ workspaceId: ws, userId: mentor.id, expiresAt: res.endsAt }]);
    expect(k.audits.map((a) => a.action)).toEqual(["mentor.engagement-extend"]);
  });

  it("IR-24 — gia hạn vượt 90 ngày tổng → 400 MENTOR_007 (details.remaining)", async () => {
    const { e } = active(60);
    await expect(k.services.engagements.extend(owner, e.id, { addDays: 31, expectedVersion: 1 })).rejects.toMatchObject({
      errorCode: "MENTOR_007",
      statusCode: 400,
      details: { max: 90, remaining: 30 },
    });
    await expect(k.services.engagements.extend(owner, e.id, { addDays: 30, expectedVersion: 1 })).resolves.toMatchObject({ totalDays: 90 });
  });

  it("gia hạn với expectedVersion cũ → 409 RES_003", async () => {
    const { e } = active();
    await expectCode(k.services.engagements.extend(owner, e.id, { addDays: 7, expectedVersion: 5 }), "RES_003", 409);
  });

  it("OWNER kết thúc → ENDED_BY_OWNER, bài FULFILLED → OPEN (chưa hết hạn), outbox mentor.ended, audit", async () => {
    const { e, post } = active();
    const res = await k.services.engagements.endByUser(owner, e.id, {});
    expect(res).toMatchObject({ status: "ENDED", endedReason: "ENDED_BY_OWNER" });
    expect(await k.posts.findById(post.id)).toMatchObject({ status: "OPEN", activeEngagements: 0 });
    expect(k.outbox.events.map((ev) => ev.jobName)).toEqual(["mentor.ended-effects"]);
    expect(k.audits.map((a) => a.action)).toEqual(["mentor.engagement-end"]);
  });

  it("cố vấn tự kết thúc → LEFT_BY_MENTOR (không audit quản trị); lần 2 → 409 MENTOR_009", async () => {
    const { e, mentor } = active();
    await expect(k.services.engagements.endByUser(mentor, e.id, {})).resolves.toMatchObject({ endedReason: "LEFT_BY_MENTOR" });
    expect(k.audits).toEqual([]);
    await expectCode(k.services.engagements.endByUser(mentor, e.id, {}), "MENTOR_009", 409);
  });

  it("bài đã hết hạn khi đợt kết thúc → giữ FULFILLED (không mở lại)", async () => {
    const { e, post } = active(30, { expiresAt: new Date(Date.now() - DAY) });
    await k.services.engagements.endByUser(owner, e.id, {});
    expect(await k.posts.findById(post.id)).toMatchObject({ status: "FULFILLED", activeEngagements: 0 });
  });

  it("thành viên thường không kết thúc được đợt của người khác → 403", async () => {
    const { e } = active();
    const member = user();
    k.setRole(ws, member.id, "MEMBER");
    await expectCode(k.services.engagements.endByUser(member, e.id, {}), "PERM_001", 403);
  });

  it("effects: onEnded gỡ khỏi nhóm chat + thu hồi khách + báo cố vấn/người đăng; onAccepted tạo nhóm chat 1 lần (khoá mentor:<id>)", async () => {
    const { e, mentor } = active();
    await k.services.effects.onAccepted({ engagementId: e.id, createConversation: true, includeMemberIds: [] });
    await k.services.effects.onAccepted({ engagementId: e.id, createConversation: true, includeMemberIds: [] });
    expect(k.conversations.created).toHaveLength(1);
    expect(k.conversations.created[0]).toMatchObject({ guestIds: [mentor.id], dedupeKey: `mentor:${e.id}` });
    const convId = (await k.engagements.findById(e.id))?.conversationId;
    expect(convId).toBeTruthy();

    await k.services.engagements.endByUser(owner, e.id, {});
    await k.services.effects.onEnded({ engagementId: e.id });
    expect(k.conversations.removed).toEqual([{ conversationId: convId, userId: mentor.id }]);
    expect(k.membership.revokes).toEqual([{ workspaceId: ws, userId: mentor.id, reason: "REMOVED" }]);
    expect(k.notifications.filter((n) => n.type === "mentor.ended").map((n) => n.recipients[0].userId)).toEqual([mentor.id]);
  });

  it("tin hệ thống: MENTOR_JOINED kèm hạn đợt khi nhóm chat được tạo; MENTOR_LEFT (lý do theo endedReason) khi kết thúc — mỗi tin một dedupeKey ổn định", async () => {
    const { e, mentor } = active();
    await k.services.effects.onAccepted({ engagementId: e.id, createConversation: true, includeMemberIds: [] });
    const convId = (await k.engagements.findById(e.id))?.conversationId as string;
    expect(k.systemPosts).toEqual([{ type: "MENTOR_JOINED", conversationId: convId, workspaceId: ws, mentorId: mentor.id, endsAt: e.endsAt, dedupeKey: `mentor-joined:${e.id}` }]);

    await k.services.engagements.endByUser(owner, e.id, {});
    await k.services.effects.onEnded({ engagementId: e.id });
    await k.services.effects.onEnded({ engagementId: e.id }); // job chạy lại: cùng dedupeKey (messages bỏ bản trùng)
    const left = k.systemPosts.filter((p) => p.type === "MENTOR_LEFT");
    expect(left).toEqual(Array(2).fill({ type: "MENTOR_LEFT", conversationId: convId, workspaceId: ws, mentorId: mentor.id, reason: "REMOVED", dedupeKey: `mentor-left:${e.id}` }));
  });

  it("MENTOR_LEFT: cố vấn tự rời → reason LEFT; hết hạn → EXPIRED; không có nhóm chat → không đăng tin", async () => {
    const own = active();
    await k.services.effects.onAccepted({ engagementId: own.e.id, createConversation: true, includeMemberIds: [] });
    await k.services.engagements.endByUser(own.mentor, own.e.id, {});
    await k.services.effects.onEnded({ engagementId: own.e.id });
    expect(k.systemPosts.at(-1)).toMatchObject({ type: "MENTOR_LEFT", reason: "LEFT" });

    const post = k.posts.seed({ workspaceId: ws, createdBy: owner.id, status: "FULFILLED", activeEngagements: 1 });
    const mentor = user();
    k.setRole(ws, mentor.id, "GUEST");
    const due = k.engagements.seed({ postId: post.id, workspaceId: ws, mentorId: mentor.id, endsAt: new Date(Date.now() - 1000) });
    await k.services.effects.onAccepted({ engagementId: due.id, createConversation: true, includeMemberIds: [] });
    await k.services.cron.expireDue();
    await k.services.effects.onEnded({ engagementId: due.id });
    expect(k.systemPosts.at(-1)).toMatchObject({ type: "MENTOR_LEFT", mentorId: mentor.id, reason: "EXPIRED" });

    const before = k.systemPosts.length;
    const noChat = active();
    await k.services.engagements.endByUser(owner, noChat.e.id, {});
    await k.services.effects.onEnded({ engagementId: noChat.e.id });
    expect(k.systemPosts).toHaveLength(before);
  });

  it("đăng MENTOR_LEFT thất bại (nhóm chat đã giải tán…) KHÔNG chặn thu hồi khách và thông báo kết thúc", async () => {
    const { e, mentor } = active();
    await k.services.effects.onAccepted({ engagementId: e.id, createConversation: true, includeMemberIds: [] });
    k.deps.systemMessages.mentorLeft = () => Promise.reject(new Error("conversation dissolved"));
    await k.services.engagements.endByUser(owner, e.id, {});
    await expect(k.services.effects.onEnded({ engagementId: e.id })).resolves.toBeUndefined();
    expect(k.membership.revokes).toEqual([{ workspaceId: ws, userId: mentor.id, reason: "REMOVED" }]);
    expect(k.notifications.filter((n) => n.type === "mentor.ended")).toHaveLength(1);
  });
});
