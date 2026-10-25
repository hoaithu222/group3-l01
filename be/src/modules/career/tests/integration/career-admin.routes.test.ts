import { installMocks } from "./career-test-mocks";
import { prisma } from "../../../../infrastructure/database";
import { buildRig, cleanup, completedPayload, ensureCareerIndexes, makeApi, seedDoneTask, seedUser, seedWorkspace, tokenFor, type Api, type Rig } from "./career-test-kit";

/** Tích hợp ADMIN (Prisma thật + Express): quyền, tạo/sửa (SKILL_001, RES_003), bật → outbox, thu hồi/khôi phục (CR-25), đánh giá lại (SKILL_006), preview. */
let rig: Rig;
let api: Api;
const users: string[] = [];
const workspaces: string[] = [];
const skills: string[] = [];
let admin: string;
let member: string;
let ws: string;
const code = `nodejs-${Date.now().toString(36)}`;
const REASON = "Kiểm thử quy trình vận hành kỹ năng";

beforeAll(async () => {
  installMocks();
  await ensureCareerIndexes();
  rig = buildRig();
  api = makeApi(rig.app);
  admin = await seedUser("Vận hành");
  member = await seedUser("Sinh viên");
  users.push(admin, member);
  ws = await seedWorkspace(`Nhóm ${member.slice(-4)}`, { [member]: "OWNER" });
  workspaces.push(ws);
});

beforeEach(() => installMocks());

afterAll(async () => {
  await cleanup(users, workspaces, skills);
});

const body = { code, name: "Node.js", category: "BACKEND", labelMatch: ["Node.js", "node js"], criteria: { requiredTasksDone: 2, requireReview: false }, icon: "service", order: 3 };

describe("admin kỹ năng", () => {
  it("quyền: người dùng thường 403; manager tạo → 403 (thiếu skill:create), admin tạo → 201 (tắt, nhãn đã chuẩn hoá, bỏ trùng)", async () => {
    expect((await api("get", "/admin/skills", tokenFor(member))).status).toBe(403);
    expect((await api("post", "/admin/skills", tokenFor(admin, "manager"), body)).status).toBe(403);
    const res = await api("post", "/admin/skills", tokenFor(admin, "admin"), body);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ code, isActive: false, labelMatch: ["nodejs"], version: 1, holdersCount: 0 });
    skills.push(res.body.data.id as string);
    expect(rig.audit.records.at(-1)).toMatchObject({ action: "skill.create", targetType: "SkillDefinition" });
  });

  it("SKILL_001 mã trùng; SKILL_002 tiêu chí sai", async () => {
    expect((await api("post", "/admin/skills", tokenFor(admin, "admin"), body)).body.error.code).toBe("SKILL_001");
    const bad = await api("post", "/admin/skills", tokenFor(admin, "admin"), { ...body, code: `${code}-x`, criteria: { requiredTasksDone: 0 } });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("SKILL_002");
  });

  it("PATCH lệch version → 409 RES_003; bật (lý do) → outbox skill.reevaluate-skill; danh sách lọc q không dấu", async () => {
    const id = skills[0];
    expect((await api("patch", `/admin/skills/${id}`, tokenFor(admin, "manager"), { expectedVersion: 99, name: "Node" })).body.error.code).toBe("RES_003");
    expect((await api("post", `/admin/skills/${id}/activate`, tokenFor(admin, "manager"), { reason: "ngắn" })).status).toBe(400);
    const on = await api("post", `/admin/skills/${id}/activate`, tokenFor(admin, "manager"), { reason: REASON });
    expect(on.body.data).toMatchObject({ isActive: true, version: 2 });
    expect(await prisma.outboxEvent.count({ where: { dedupeKey: `skill.reevaluate:skill:${id}:v2` } })).toBe(1);
    const list = await api("get", `/admin/skills?q=${encodeURIComponent("NODE.JS")}&active=true`, tokenFor(admin, "manager"));
    expect(list.body.data.map((s: { id: string }) => s.id)).toContain(id);
  });

  it("CR-25 qua HTTP: đạt → thu hồi (lý do) → làm thêm task không cấp lại → khôi phục; tab Kỹ năng + minh chứng admin không tiêu đề", async () => {
    const id = skills[0];
    for (let i = 0; i < 2; i += 1) {
      const t = await seedDoneTask(ws, `Việc bí mật ${i}`, [member]);
      await rig.c.progressService.onTaskCompleted(completedPayload(t, ws, [member], { labelNames: ["NODEJS"] }));
    }
    const tab = await api("get", `/admin/users/${member}/skills`, tokenFor(admin, "manager"));
    expect(tab.body.data.find((r: { skill: { id: string } }) => r.skill.id === id)).toMatchObject({ progress: { tasksDone: 2 }, badge: { revokedAt: null } });

    const proof = await api("get", `/admin/users/${member}/skills/${id}/proof`, tokenFor(admin, "manager"));
    expect(proof.body.data.tasks).toHaveLength(2);
    expect(JSON.stringify(proof.body)).not.toContain("bí mật");

    const revoked = await api("post", `/admin/users/${member}/skills/${id}/revoke`, tokenFor(admin, "manager"), { reason: REASON });
    expect(revoked.body.data).toMatchObject({ revokedReason: REASON, revokedBy: { id: admin } });
    const t3 = await seedDoneTask(ws, "Việc 3", [member]);
    await rig.c.progressService.onTaskCompleted(completedPayload(t3, ws, [member], { labelNames: ["node.js"] }));
    expect((await prisma.userSkillBadge.findFirst({ where: { userId: member, skillId: id } }))?.revokedAt).not.toBeNull();

    expect((await api("post", `/admin/users/${member}/skills/${id}/revoke`, tokenFor(admin, "manager"), { reason: REASON })).status).toBe(409);
    expect((await api("post", `/admin/users/${member}/skills/${id}/restore`, tokenFor(admin, "manager"), { reason: REASON })).body.data.revokedAt).toBeNull();
    expect((await api("post", `/admin/users/${member}/skills/${id}/restore`, tokenFor(admin, "manager"), { reason: REASON })).body.error.code).toBe("SKILL_004");
    expect((await api("post", `/admin/users/${admin}/skills/${id}/revoke`, tokenFor(admin, "manager"), { reason: REASON })).body.error.code).toBe("SKILL_003");
  });

  it("preview theo tiêu chí chưa lưu; JSON hỏng → 400; đánh giá lại toàn bộ lần 2 trong giờ → 429 SKILL_006", async () => {
    const id = skills[0];
    const p = await api("get", `/admin/skills/${id}/eligible-preview?criteria=${encodeURIComponent(JSON.stringify({ requiredTasksDone: 3, requireReview: false }))}`, tokenFor(admin, "manager"));
    expect(p.body.data).toEqual({ eligibleCount: 1, alreadyHolding: 1, willGrant: 0, sampleUserIds: [member] });
    expect((await api("get", `/admin/skills/${id}/eligible-preview?criteria=%7Bx`, tokenFor(admin, "manager"))).status).toBe(400);
    const first = await api("post", "/admin/skills/reevaluate", tokenFor(admin, "manager"), { reason: REASON });
    expect(first.status).toBe(202);
    expect(first.body.data.jobId).toMatch(/^skill\.reevaluate-all/);
    const second = await api("post", "/admin/skills/reevaluate", tokenFor(admin, "manager"), { reason: REASON });
    expect(second.status).toBe(429);
    expect(second.body.error.code).toBe("SKILL_006");
  });
});
