import { installMocks } from "./career-test-mocks";
import { cleanup, completedPayload, ensureCareerIndexes, buildRig, makeApi, seedDoneTask, seedUser, seedWorkspace, tokenFor, type Api, type Rig } from "./career-test-kit";

/**
 * Tích hợp phía NGƯỜI DÙNG (Prisma thật + Express): CR-03 (không có đường tạo huy hiệu), CR-26 (minh chứng lọc riêng tư), quyền xem huy hiệu (404),
 * PUT quyền riêng tư, danh mục + tiến độ.
 */
let rig: Rig;
let api: Api;
const users: string[] = [];
const workspaces: string[] = [];
const skills: string[] = [];
let owner: string;
let teammate: string;
let outsider: string;
let skillId: string;

beforeAll(async () => {
  installMocks();
  await ensureCareerIndexes();
  rig = buildRig();
  api = makeApi(rig.app);
  owner = await seedUser("Chủ huy hiệu");
  teammate = await seedUser("Đồng đội");
  outsider = await seedUser("Người ngoài");
  users.push(owner, teammate, outsider);
  const ws = await seedWorkspace(`Nhóm Alpha ${owner.slice(-4)}`, { [owner]: "OWNER", [teammate]: "MEMBER" });
  workspaces.push(ws);
  const created = await rig.c.admin.create({ id: owner, email: "a@e.com", role: "admin" }, {
    code: `reactjs-${owner.slice(-6)}`,
    name: "ReactJS",
    category: "FRONTEND",
    labelMatch: ["React JS"],
    criteria: { requiredTasksDone: 1, requireReview: false },
    icon: "keyboard",
    order: 0,
  });
  skillId = created.id;
  skills.push(skillId);
  await rig.c.admin.setActive({ id: owner, email: "a@e.com", role: "admin" }, skillId, true, "Bật để kiểm thử tích hợp");
  const taskId = await seedDoneTask(ws, "Trang thanh toán nội bộ", [owner]);
  await rig.c.progressService.onTaskCompleted(completedPayload(taskId, ws, [owner]));
});

beforeEach(() => installMocks());

afterAll(async () => {
  await cleanup(users, workspaces, skills);
});

describe("career routes (người dùng)", () => {
  it("CR-03: KHÔNG có route tạo huy hiệu phía người dùng → 404", async () => {
    for (const path of ["/me/skills", `/users/${owner}/skills`, `/users/${owner}/skills/${skillId}`, "/skills"]) {
      const res = await api("post", path, tokenFor(owner), { skillId });
      expect(res.status).toBe(404);
    }
  });

  it("GET /skills: tiến độ của tôi + huy hiệu đã mở; GET /skills/:id; GET /me/skills", async () => {
    const res = await api("get", "/skills", tokenFor(owner));
    expect(res.status).toBe(200);
    const mine = (res.body.data as Array<{ id: string; myProgress: { tasksDone: number; achieved: boolean }; myBadge: { revoked: boolean } | null }>).find((s) => s.id === skillId);
    expect(mine).toMatchObject({ myProgress: { tasksDone: 1, achieved: true }, myBadge: { revoked: false } });
    expect((await api("get", `/skills/${skillId}`, tokenFor(owner))).body.data.labelMatch).toEqual(["reactjs"]);
    const badges = await api("get", "/me/skills", tokenFor(owner));
    expect(badges.body.data).toEqual([expect.objectContaining({ revoked: false, proof: { tasksDone: 1, storyPoints: 5, avgPeerScore: null } })]);
  });

  it("CR-26: người ngoài được phép xem (vận hành) + proofTitles=false → không tiêu đề, không tên nhóm; đồng đội thấy đủ", async () => {
    const byManager = await api("get", `/users/${owner}/skills/${skillId}/proof`, tokenFor(outsider, "manager"));
    expect(byManager.status).toBe(200);
    expect(byManager.body.data.tasks).toEqual([expect.objectContaining({ title: null, workspaceName: null, storyPoints: 5 })]);
    expect(JSON.stringify(byManager.body)).not.toContain("thanh toán");

    const byTeammate = await api("get", `/users/${owner}/skills/${skillId}/proof`, tokenFor(teammate));
    expect(byTeammate.body.data.tasks[0]).toMatchObject({ title: "Trang thanh toán nội bộ", workspaceName: expect.stringContaining("Nhóm Alpha") });
  });

  it("xem huy hiệu người khác: người ngoài 404; đồng đội 200; tắt showSkills → đồng đội 404", async () => {
    expect((await api("get", `/users/${owner}/skills`, tokenFor(outsider))).status).toBe(404);
    expect((await api("get", `/users/${owner}/skills`, tokenFor(teammate))).body.data).toHaveLength(1);

    const put = await api("put", "/me/career/visibility", tokenFor(owner), { showSkills: false, proofTitles: false, showContribution: false, showQuiz: false });
    expect(put.status).toBe(200);
    expect(put.body.data.visibility).toEqual({ showSkills: false, proofTitles: false, showContribution: false, showQuiz: false, appearInOthersPortfolios: false });
    expect((await api("get", `/users/${owner}/skills`, tokenFor(teammate))).status).toBe(404);
    expect((await api("get", "/me/career", tokenFor(owner))).body.data.visibility.showSkills).toBe(false);
  });

  it("PUT visibility: trường lạ / thiếu trường → 400", async () => {
    expect((await api("put", "/me/career/visibility", tokenFor(owner), { showSkills: true })).status).toBe(400);
    expect((await api("put", "/me/career/visibility", tokenFor(owner), { showSkills: true, proofTitles: false, showContribution: false, showQuiz: false, hack: 1 })).status).toBe(400);
  });
});
