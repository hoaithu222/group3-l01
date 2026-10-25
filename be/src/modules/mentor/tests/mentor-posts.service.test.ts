import { newObjectId } from "../../../core/utils/object-id";
import { expectCode, makeKit, user, type Kit } from "./mentor-test-kit";
import { normalizeSkills, parseSkillsCsv } from "../services/mentor-skills";

const BODY = {
  title: "Cần cố vấn kiến trúc React Native",
  description: "Nhóm đang làm đồ án và cần người review kiến trúc, gợi ý cách tổ chức state.",
  skills: ["React Native", "react native", "Thiết kế hệ thống"],
  commitmentHoursPerWeek: 2,
  mentorsNeeded: 1,
  expiresInDays: 14,
};

describe("MentorPostsService — đăng/sửa/đóng + bảng tin", () => {
  let k: Kit;
  const ws = newObjectId();
  const owner = user();
  beforeEach(() => {
    k = makeKit();
    k.setRole(ws, owner.id, "OWNER");
  });

  it("chuẩn hoá kỹ năng: bỏ trùng không dấu, giữ nhãn gốc; CSV lọc", () => {
    expect(normalizeSkills(["React Native", "react  native", "Thiết kế"])).toEqual({ skills: ["react native", "thiet ke"], labels: ["React Native", "Thiết kế"] });
    expect(parseSkillsCsv("React, NODE ,")).toEqual(["react", "node"]);
    expect(parseSkillsCsv("")).toBeUndefined();
  });

  it("đăng bài: OWNER/ADMIN; skills chuẩn hoá; hạn = now + expiresInDays; thành viên 403, người ngoài 404", async () => {
    const res = await k.services.posts.create(owner, ws, BODY);
    expect(res).toMatchObject({ status: "OPEN", skillLabels: ["React Native", "Thiết kế hệ thống"], version: 1, myActions: { manage: true, apply: false } });
    expect(res.expiresAt.getTime() - k.clock.now.getTime()).toBe(14 * 86_400_000);
    const member = user();
    k.setRole(ws, member.id, "MEMBER");
    await expectCode(k.services.posts.create(member, ws, BODY), "PERM_001", 403);
    await expectCode(k.services.posts.create(user(), ws, BODY), "PERM_404", 404);
  });

  it("quá 3 bài OPEN/nhóm → 409 MENTOR_001", async () => {
    for (let i = 0; i < 3; i += 1) await k.services.posts.create(owner, ws, BODY);
    await expectCode(k.services.posts.create(owner, ws, BODY), "MENTOR_001", 409);
  });

  it("sửa: expectedVersion lệch → 409 RES_003; mentorsNeeded < đang hoạt động → 400; tăng mentorsNeeded → OPEN lại", async () => {
    const p = k.posts.seed({ workspaceId: ws, createdBy: owner.id, mentorsNeeded: 2, activeEngagements: 2, status: "FULFILLED" });
    await expectCode(k.services.posts.update(owner, p.id, { expectedVersion: 9, title: "Tiêu đề mới hơn" }), "RES_003", 409);
    await expectCode(k.services.posts.update(owner, p.id, { expectedVersion: 1, mentorsNeeded: 1 }), "VAL_001", 400);
    await expect(k.services.posts.update(owner, p.id, { expectedVersion: 1, mentorsNeeded: 3 })).resolves.toMatchObject({ status: "OPEN", version: 2 });
  });

  it("đóng bài: đơn PENDING → EXPIRED", async () => {
    const p = k.posts.seed({ workspaceId: ws, createdBy: owner.id });
    const app = k.applications.seed({ postId: p.id, workspaceId: ws, applicantId: newObjectId() });
    await expect(k.services.posts.close(owner, p.id)).resolves.toMatchObject({ status: "CLOSED" });
    expect((await k.applications.findById(app.id))?.status).toBe("EXPIRED");
  });

  it("bảng tin: chỉ OPEN chưa hết hạn, không ẩn; lọc kỹ năng (đủ mọi kỹ năng) + q; đánh dấu đơn của tôi", async () => {
    const viewer = user();
    const a = k.posts.seed({ workspaceId: ws, createdBy: owner.id, title: "React cơ bản", normalizedTitle: "react co ban", skills: ["react", "node"] });
    k.posts.seed({ workspaceId: ws, createdBy: owner.id, skills: ["react"], hiddenAt: new Date() });
    k.posts.seed({ workspaceId: ws, createdBy: owner.id, skills: ["react"], expiresAt: new Date(Date.now() - 1000) });
    const b = k.posts.seed({ workspaceId: ws, createdBy: owner.id, skills: ["react"] });
    k.applications.seed({ postId: a.id, workspaceId: ws, applicantId: viewer.id });

    const all = await k.services.posts.feed(viewer, { status: "OPEN", limit: 20 });
    expect(all.data.map((p) => p.id).sort()).toEqual([a.id, b.id].sort());
    const both = await k.services.posts.feed(viewer, { status: "OPEN", limit: 20, skills: "React,Node" });
    expect(both.data.map((p) => p.id)).toEqual([a.id]);
    expect(both.data[0].myApplication).toMatchObject({ status: "PENDING" });
    const q = await k.services.posts.feed(viewer, { status: "OPEN", limit: 20, q: "Cơ bản" });
    expect(q.data.map((p) => p.id)).toEqual([a.id]);
  });

  it("chi tiết: bài ẩn → 404 với người ngoài, OWNER vẫn xem; myActions theo vai trò", async () => {
    const p = k.posts.seed({ workspaceId: ws, createdBy: owner.id });
    const outsider = user();
    expect((await k.services.posts.detail(outsider, p.id)).myActions).toEqual({ apply: true, manage: false, report: true, withdraw: false });
    const member = user();
    k.setRole(ws, member.id, "MEMBER");
    expect((await k.services.posts.detail(member, p.id)).myActions.apply).toBe(false);
    await k.posts.setHidden(p.id, { at: new Date(), by: newObjectId(), reason: "vi phạm" });
    await expectCode(k.services.posts.detail(outsider, p.id), "PERM_404", 404);
    await expect(k.services.posts.detail(owner, p.id)).resolves.toMatchObject({ hidden: true });
  });
});
