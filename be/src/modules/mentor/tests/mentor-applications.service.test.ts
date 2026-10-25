import { newObjectId } from "../../../core/utils/object-id";
import { LIMITS } from "../../../core/constants/limits";
import { expectCode, makeKit, user, type Kit } from "./mentor-test-kit";

const APPLY = { message: "Tôi đã cố vấn nhiều đồ án React và muốn giúp nhóm." };

describe("MentorApplicationsService — ứng tuyển (be.md §5 apply)", () => {
  let k: Kit;
  const ws = newObjectId();
  const owner = user();
  beforeEach(() => {
    k = makeKit();
    k.setRole(ws, owner.id, "OWNER");
  });

  const post = (over: Parameters<Kit["posts"]["seed"]>[0] | object = {}) => k.posts.seed({ workspaceId: ws, createdBy: owner.id, ...over });

  it("người ngoài ứng tuyển → PENDING, applicantsCount+1, thông báo OWNER/ADMIN (mentor.application)", async () => {
    const p = post();
    const outsider = user();
    const res = await k.services.applications.apply(outsider, p.id, { ...APPLY, portfolioUrl: "https://github.com/a" });
    expect(res.status).toBe("PENDING");
    expect(res.portfolioUrl).toBe("https://github.com/a");
    expect((await k.posts.findById(p.id))?.applicantsCount).toBe(1);
    expect(k.notifications).toEqual([
      expect.objectContaining({ type: "mentor.application", recipients: [{ userId: owner.id }], scope: { type: "WORKSPACE", id: ws } }),
    ]);
  });

  it("IR-21 — ứng tuyển lần 2 cùng bài → 409 MENTOR_003 (chỉ một đơn)", async () => {
    const p = post();
    const outsider = user();
    await k.services.applications.apply(outsider, p.id, APPLY);
    await expectCode(k.services.applications.apply(outsider, p.id, APPLY), "MENTOR_003", 409);
    expect([...k.applications.rows.values()].filter((a) => a.postId === p.id)).toHaveLength(1);
  });

  it.each(["ACTIVE", "PENDING", "BANNED"] as const)("IR-23 — membership %s của nhóm → 400 MENTOR_004", async (status) => {
    const p = post();
    const u = user();
    k.membership.set(ws, u.id, status);
    await expectCode(k.services.applications.apply(u, p.id, APPLY), "MENTOR_004", 400);
  });

  it("người đã rời/bị loại (REMOVED/LEFT) ứng tuyển lại được", async () => {
    const p = post();
    const u = user();
    k.membership.set(ws, u.id, "REMOVED");
    await expect(k.services.applications.apply(u, p.id, APPLY)).resolves.toMatchObject({ status: "PENDING" });
  });

  it("bài không OPEN/đã hết hạn → 409 MENTOR_002; bài ẩn → 404", async () => {
    await expectCode(k.services.applications.apply(user(), post({ status: "FULFILLED" }).id, APPLY), "MENTOR_002", 409);
    await expectCode(k.services.applications.apply(user(), post({ expiresAt: new Date(Date.now() - 1000) }).id, APPLY), "MENTOR_002", 409);
    await expectCode(k.services.applications.apply(user(), post({ hiddenAt: new Date() }).id, APPLY), "PERM_404", 404);
  });

  it("quá số đơn PENDING toàn hệ thống → 429 MENTOR_006", async () => {
    const u = user();
    for (let i = 0; i < LIMITS.mentor.applicationsPendingPerUser; i += 1) {
      k.applications.seed({ postId: newObjectId(), workspaceId: newObjectId(), applicantId: u.id });
    }
    await expectCode(k.services.applications.apply(u, post().id, APPLY), "MENTOR_006", 429);
  });

  it("rút đơn: chỉ chính người ứng tuyển, chỉ PENDING (MENTOR_010)", async () => {
    const p = post();
    const u = user();
    const app = await k.services.applications.apply(u, p.id, APPLY);
    await expectCode(k.services.applications.withdraw(user(), app.id), "PERM_404", 404);
    await expect(k.services.applications.withdraw(u, app.id)).resolves.toMatchObject({ status: "WITHDRAWN" });
    await expectCode(k.services.applications.withdraw(u, app.id), "MENTOR_010", 409);
  });

  it("từ chối: OWNER/ADMIN; thành viên thường 403, người ngoài 404; thông báo mentor.rejected cho người ứng tuyển", async () => {
    const p = post();
    const u = user();
    const app = await k.services.applications.apply(u, p.id, APPLY);
    const member = user();
    k.setRole(ws, member.id, "MEMBER");
    await expectCode(k.services.applications.reject(member, app.id, {}), "PERM_001", 403);
    await expectCode(k.services.applications.reject(user(), app.id, {}), "PERM_404", 404);
    const res = await k.services.applications.reject(owner, app.id, { reason: "Chưa phù hợp" });
    expect(res).toMatchObject({ status: "REJECTED", rejectReason: "Chưa phù hợp" });
    expect(k.notifications.at(-1)).toMatchObject({ type: "mentor.rejected", scope: null, recipients: [{ userId: u.id }] });
  });

  it("ảnh: người ứng tuyển có ảnh → applicant.avatarUrl ký sẵn (THUMB); nhóm có ảnh → post.workspace.avatarUrl ở `listMine`; chưa có ảnh → null", async () => {
    const p = post();
    const withAvatar = user();
    const noAvatar = user();
    k.avatars.set(withAvatar.id, "65f0000000000000000000d1");
    k.avatars.set(ws, "65f0000000000000000000d2");
    const signedThumb = (assetId: string) => new RegExp(`^https?://\\S+/api/v1/assets/${assetId}/image\\?v=THUMB&e=\\d+&s=[0-9a-f]{64}$`);

    expect((await k.services.applications.apply(withAvatar, p.id, APPLY)).applicant.avatarUrl).toMatch(signedThumb("65f0000000000000000000d1"));
    expect((await k.services.applications.apply(noAvatar, p.id, APPLY)).applicant.avatarUrl).toBeNull();

    const { data } = await k.services.applications.listForPost(owner, p.id, { limit: 20 });
    expect(data.find((a) => a.applicant.id === withAvatar.id)?.applicant.avatarUrl).toMatch(signedThumb("65f0000000000000000000d1"));
    expect(data.find((a) => a.applicant.id === noAvatar.id)?.applicant.avatarUrl).toBeNull();

    const mine = await k.services.applications.listMine(withAvatar, undefined, 20);
    expect(mine.data[0].post.workspace.id).toBe(ws);
    expect(mine.data[0].post.workspace.avatarUrl).toMatch(signedThumb("65f0000000000000000000d2"));
  });
});
