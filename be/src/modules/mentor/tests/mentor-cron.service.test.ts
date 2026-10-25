import { newObjectId } from "../../../core/utils/object-id";
import { makeKit, user, type Kit } from "./mentor-test-kit";
import { MentorPostReportTarget } from "../services/mentor-report.service";

const DAY = 86_400_000;

describe("MentorCronService — mentor.expire / mentor.ending-soon / mentor.post-expire", () => {
  let k: Kit;
  const ws = newObjectId();
  const owner = user();
  beforeEach(() => {
    k = makeKit();
    k.setRole(ws, owner.id, "OWNER");
  });

  it("IR-02 (service) — đợt quá endsAt → ENDED(EXPIRED) + outbox thu hồi; chạy lại không làm gì", async () => {
    const post = k.posts.seed({ workspaceId: ws, createdBy: owner.id, status: "FULFILLED", activeEngagements: 1 });
    const due = k.engagements.seed({ postId: post.id, workspaceId: ws, mentorId: newObjectId(), endsAt: new Date(Date.now() - 1000) });
    k.engagements.seed({ postId: post.id, workspaceId: ws, mentorId: newObjectId(), endsAt: new Date(Date.now() + DAY) });

    expect(await k.services.cron.expireDue()).toEqual({ processed: 1 });
    expect(await k.engagements.findById(due.id)).toMatchObject({ status: "ENDED", endedReason: "EXPIRED", endedBy: null });
    expect(k.outbox.events.map((e) => e.dedupeKey)).toEqual([`mentor.ended:engagement:${due.id}`]);
    expect(await k.services.cron.expireDue()).toEqual({ processed: 0 });
  });

  it("sắp hết hạn: báo MỘT lần cho cố vấn (scope null) + người đăng (WORKSPACE)", async () => {
    const post = k.posts.seed({ workspaceId: ws, createdBy: owner.id });
    const mentorId = newObjectId();
    k.engagements.seed({ postId: post.id, workspaceId: ws, mentorId, endsAt: new Date(Date.now() + 2 * DAY) });
    k.engagements.seed({ postId: post.id, workspaceId: ws, mentorId: newObjectId(), endsAt: new Date(Date.now() + 10 * DAY) });

    expect(await k.services.cron.notifyEndingSoon()).toEqual({ processed: 1 });
    expect(k.notifications.map((n) => [n.type, n.recipients[0].userId, n.scope?.type ?? null])).toEqual([
      ["mentor.ending-soon", mentorId, null],
      ["mentor.ending-soon", owner.id, "WORKSPACE"],
    ]);
    expect(await k.services.cron.notifyEndingSoon()).toEqual({ processed: 0 });
  });

  it("bài quá hạn → CLOSED + đơn PENDING → EXPIRED; đợt đang chạy giữ nguyên", async () => {
    const post = k.posts.seed({ workspaceId: ws, createdBy: owner.id, status: "FULFILLED", activeEngagements: 1, expiresAt: new Date(Date.now() - 1000) });
    const app = k.applications.seed({ postId: post.id, workspaceId: ws, applicantId: newObjectId() });
    const e = k.engagements.seed({ postId: post.id, workspaceId: ws, mentorId: newObjectId() });
    expect(await k.services.cron.expirePosts()).toEqual({ processed: 1 });
    expect((await k.posts.findById(post.id))?.status).toBe("CLOSED");
    expect((await k.applications.findById(app.id))?.status).toBe("EXPIRED");
    expect((await k.engagements.findById(e.id))?.status).toBe("ACTIVE");
  });

  it("đích báo cáo MENTOR_POST: người đăng/OWNER/ADMIN = SELF, bài ẩn = NOT_FOUND, người khác → PLATFORM_ONLY; reportedCount tuyệt đối", async () => {
    const post = k.posts.seed({ workspaceId: ws, createdBy: owner.id });
    const target = new MentorPostReportTarget(k.posts, k.deps.access);
    const admin = user();
    k.setRole(ws, admin.id, "ADMIN");
    expect(await target.resolve(owner, post.id)).toBe("SELF");
    expect(await target.resolve(admin, post.id)).toBe("SELF");
    expect(await target.resolve(user(), post.id)).toMatchObject({ targetType: "MENTOR_POST", groupKey: `MENTOR_POST:${post.id}`, handlerLevel: "PLATFORM_ONLY", workspaceId: ws });
    await target.onReportCreated({ targetId: post.id, openCount: 3 });
    await target.onReportCreated({ targetId: post.id, openCount: 3 });
    expect((await k.posts.findById(post.id))?.reportedCount).toBe(3);
    await k.posts.setHidden(post.id, { at: new Date(), by: admin.id, reason: "x" });
    expect(await target.resolve(user(), post.id)).toBe("NOT_FOUND");
  });
});
