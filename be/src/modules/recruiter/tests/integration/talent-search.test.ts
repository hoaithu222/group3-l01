import { installMocks, redisStore, setRecruiterEnabled } from "./recruiter-test-mocks";
import { buildRig, cleanup, ensureRecruiterIndexes, makeApi, seedCompany, seedMember, seedOffer, seedTalent, seedUser, tokenFor, type Api, type Rig } from "./recruiter-test-kit";
import { badgeDto } from "../support/fakes";
import { prisma } from "../../../../infrastructure/database";
import { newObjectId } from "../../../../core/utils/object-id";

/**
 * Tìm/xem ứng viên phía HR: CR-08 (công ty chưa duyệt → RECR_002 cả ba), bộ lọc cứng + sắp xếp + phân trang, CR-42 (không email/phone/workspace*, trường bị ẩn vắng hẳn), CR-12 (chặn công ty),
 * CR-11 (audit mọi lượt xem + TalentProfileView gộp + trần RECR_010), cache 60 s bị vô hiệu bằng `talent:search:ver`, minh chứng qua cổng career.
 */
let rig: Rig;
let api: Api;
const users: string[] = [];
const companies: string[] = [];
let company: { id: string; ownerId: string };
let hr: string;

const ids = (res: { body: { data: Array<{ userId: string }> } }): string[] => res.body.data.map((c) => c.userId);
const search = (qs = "", who = hr) => api("get", `/companies/${company.id}/talent/search${qs}`, tokenFor(who));

beforeAll(async () => {
  installMocks();
  await ensureRecruiterIndexes();
  rig = buildRig();
  api = makeApi(rig.app);
  company = await seedCompany({ status: "APPROVED", name: "Công ty Tìm Người" });
  hr = await seedUser("HR tìm người");
  users.push(company.ownerId, hr);
  companies.push(company.id);
  await seedMember(company.id, hr);
});

beforeEach(() => {
  installMocks();
  redisStore.clear();
  setRecruiterEnabled(true);
  rig.audit.records.length = 0;
});

afterAll(async () => {
  await cleanup(users, companies);
});

async function talent(over: Parameters<typeof seedTalent>[0] = {}) {
  const t = await seedTalent(over);
  users.push(t.id);
  return t;
}

describe("CR-08 — công ty chưa được duyệt", () => {
  it("PENDING / REJECTED / SUSPENDED: tìm, xem hồ sơ, gửi lời mời đều 403 RECR_002 (nhân sự ACTIVE)", async () => {
    const student = await talent({ name: "Ứng viên CR08" });
    for (const status of ["PENDING", "REJECTED", "SUSPENDED"] as const) {
      const co = await seedCompany({ status, name: `Công ty ${status} cr08` });
      users.push(co.ownerId);
      companies.push(co.id);
      const t = tokenFor(co.ownerId);
      for (const res of [
        await api("get", `/companies/${co.id}/talent/search`, t),
        await api("get", `/companies/${co.id}/talent/${student.id}`, t),
        await api("post", `/companies/${co.id}/offers`, t, { studentId: student.id, title: "Thực tập", message: "Chúng tôi muốn mời bạn tham gia dự án.", employmentType: "INTERNSHIP" }),
      ]) {
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe("RECR_002");
      }
    }
  });
});

describe("tìm kiếm — bộ lọc cứng, sắp xếp, phân trang", () => {
  let a: string; // reactjs + nodejs, điểm 90
  let b: string; // reactjs, điểm 60
  let c: string; // nodejs, không đóng góp (tắt showContribution), Đà Nẵng
  let d: string; // không kỹ năng (tắt showSkills)

  beforeAll(async () => {
    a = (await talent({ name: "Nguyễn Văn An", skills: [{ code: "reactjs" }, { code: "nodejs" }], contribution: { pctX10: 900, workspaces: 3 }, roles: ["Backend Developer"], location: "Hà Nội" })).id;
    b = (await talent({ name: "Trần Thị Bình", skills: [{ code: "reactjs" }], contribution: { pctX10: 600, workspaces: 1 }, roles: ["Frontend Developer"], location: "Hà Nội" })).id;
    c = (await talent({ name: "Lê Công Chính", skills: [{ code: "nodejs" }], showContribution: false, contribution: { pctX10: 990, workspaces: 5 }, roles: ["Backend Developer"], location: "Đà Nẵng" })).id;
    d = (await talent({ name: "Phạm Đức Dũng", showSkills: false, skills: [{ code: "reactjs" }], contribution: { pctX10: 500, workspaces: 1 }, roles: ["Data Analyst"], location: "Hồ Chí Minh" })).id;
  });

  it("không bộ lọc: mọi ứng viên Open to work; kỹ năng bị ẩn (showSkills=false) không lọt qua bộ lọc kỹ năng", async () => {
    const all = await search("?limit=50");
    expect(all.status).toBe(200);
    expect(ids(all)).toEqual(expect.arrayContaining([a, b, c, d]));
    expect(ids(await search("?skills=reactjs"))).toEqual(expect.arrayContaining([a, b]));
    expect(ids(await search("?skills=reactjs"))).not.toContain(d);
    expect(ids(await search("?skills=reactjs,nodejs"))).toEqual([a]);
  });

  it("sắp xếp: số kỹ năng khớp → điểm đóng góp (null cuối) → cập nhật gần nhất; kèm matchedSkills", async () => {
    const res = await search("?skills=reactjs&limit=50");
    const order = ids(res).filter((id) => [a, b].includes(id));
    expect(order).toEqual([a, b]); // cùng 1 kỹ năng khớp → điểm 90 trước 60
    expect(res.body.data.find((x: { userId: string }) => x.userId === a).matchedSkills).toBe(1);
    const two = await search("?skills=reactjs,nodejs");
    expect(two.body.data[0].matchedSkills).toBe(2);
    const all = await search("?limit=50");
    const own = ids(all).filter((id) => [a, b, c, d].includes(id));
    expect(own.indexOf(a)).toBeLessThan(own.indexOf(b)); // 90 > 60
    expect(own.indexOf(b)).toBeLessThan(own.indexOf(c)); // c không có điểm (null cuối) dù nguồn 99
  });

  it("minContribution / minBadges / role / location / từ khoá không dấu (đầu từ)", async () => {
    expect(ids(await search("?minContribution=70"))).toEqual(expect.arrayContaining([a]));
    expect(ids(await search("?minContribution=70"))).not.toContain(b);
    expect(ids(await search("?minContribution=1"))).not.toContain(c); // tắt showContribution → không có điểm
    expect(ids(await search("?minBadges=2"))).toEqual([a]);
    expect(ids(await search("?role=backend"))).toEqual(expect.arrayContaining([a, c]));
    expect(ids(await search("?role=backend"))).not.toContain(b);
    expect(ids(await search("?location=da%20nang"))).toEqual([c]);
    expect(ids(await search("?q=tran%20thi"))).toEqual([b]);
    expect(ids(await search("?q=binh"))).toEqual([b]);
    expect(ids(await search("?q=inh"))).not.toContain(b); // khớp ĐẦU từ, không phải chứa
    expect(ids(await search("?q=%28a%2B%29%2B"))).toEqual([]); // ký tự regex bị escape → literal
  });

  it("phân trang theo chỉ số: trang sau không trùng trang trước, hasMore đúng ở trang cuối", async () => {
    const p1 = await search("?limit=2&skills=nodejs,reactjs");
    expect(p1.status).toBe(200);
    const nodejs = await search("?skills=nodejs&limit=50");
    const total = nodejs.body.data.length;
    expect(total).toBeGreaterThanOrEqual(2);
    const first = await search("?skills=nodejs&limit=1");
    expect(first.body.meta.hasMore).toBe(total > 1);
    expect(first.body.data).toHaveLength(1);
    const cursor = first.body.meta.nextCursor as string;
    expect(cursor).toBeTruthy();
    const second = await search(`?skills=nodejs&limit=1&cursor=${cursor}`);
    expect(second.body.data[0].userId).not.toBe(first.body.data[0].userId);
    expect(ids(nodejs).slice(0, 2)).toEqual([first.body.data[0].userId, second.body.data[0].userId]);
    const lastPage = await search(`?skills=nodejs&limit=${total}`);
    expect(lastPage.body.meta).toMatchObject({ hasMore: false, nextCursor: null });
  });

  it("CR-42: không email/phone/workspace*; trường bị ẩn VẮNG hẳn; ≤ 6 kỹ năng", async () => {
    const res = await search("?limit=50");
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/email|phone|workspaceName|workspaceId|"workspaces"/i);
    const byId = new Map<string, Record<string, unknown>>(res.body.data.map((x: { userId: string }) => [x.userId, x as Record<string, unknown>]));
    expect(byId.get(a)).toMatchObject({ contributionPct: 90, contributionWorkspaces: 3 });
    expect(Object.keys(byId.get(c) ?? {})).not.toContain("contributionPct");
    expect(Object.keys(byId.get(c) ?? {})).not.toContain("contributionWorkspaces");
    expect(Object.keys(byId.get(a) ?? {})).not.toContain("portfolioUrl");
    expect(byId.get(d)?.skills).toEqual([]);
    expect(byId.get(d)?.badgeCount).toBe(0);
  });

  it("validate query: kỹ năng sai dạng/quá nhiều, số ngoài khoảng → 400 VAL_001", async () => {
    for (const qs of ["?skills=SAI%20D%E1%BA%A0NG!", "?minContribution=101", "?minBadges=99", "?limit=999", "?q=a"]) {
      const res = await search(qs);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VAL_001");
    }
  });

  it("cache 60 s: kết quả đã cache không đổi tới khi `talent:search:ver` tăng", async () => {
    const t = await talent({ name: "Cache Case Người", skills: [{ code: "cache-skill" }] });
    const q = "?skills=cache-skill";
    expect(ids(await search(q))).toEqual([t.id]);
    await prisma.talentSearchIndex.deleteMany({ where: { userId: t.id } }); // xoá thẳng DB, KHÔNG qua service
    expect(ids(await search(q))).toEqual([t.id]); // vẫn từ cache
    await rig.c.deps.searchCache.bump();
    expect(ids(await search(q))).toEqual([]);
  });
});

describe("CR-12 — sinh viên chặn doanh nghiệp", () => {
  it("công ty bị chặn: không thấy trong tìm kiếm, xem hồ sơ 404, gửi lời mời 422 RECR_007; thread cũ khoá; công ty khác vẫn thấy", async () => {
    const student = await talent({ name: "Sinh viên chặn", skills: [{ code: "blocker-skill" }] });
    const other = await seedCompany({ status: "APPROVED", name: "Công ty Khác Không Bị Chặn" });
    users.push(other.ownerId);
    companies.push(other.id);
    const offerId = await seedOffer({ companyId: company.id, recruiterId: hr, studentId: student.id, status: "INTERESTED" });

    const q = "?skills=blocker-skill";
    expect(ids(await search(q))).toEqual([student.id]);
    const blocked = await api("post", "/me/company-blocks", tokenFor(student.id), { companyId: company.id });
    expect(blocked.status).toBe(201);
    // idempotent
    expect((await api("post", "/me/company-blocks", tokenFor(student.id), { companyId: company.id })).status).toBe(201);
    expect(await prisma.companyBlock.count({ where: { userId: student.id, companyId: company.id } })).toBe(1);

    expect(ids(await search(q))).toEqual([]);
    expect((await api("get", `/companies/${company.id}/talent/${student.id}`, tokenFor(hr))).status).toBe(404);
    const offer = await api("post", `/companies/${company.id}/offers`, tokenFor(hr), { studentId: student.id, title: "Thực tập", message: "Chúng tôi muốn mời bạn tham gia dự án.", employmentType: "INTERNSHIP" });
    expect(offer.status).toBe(422);
    expect(offer.body.error.code).toBe("RECR_007");

    // Thread lời mời cũ bị khoá (giữ trạng thái), HR không được báo lý do
    const row = await prisma.jobOffer.findUniqueOrThrow({ where: { id: offerId } });
    expect(row).toMatchObject({ status: "INTERESTED", threadLocked: true });
    const send = await api("post", `/offers/${offerId}/messages`, tokenFor(hr), { content: "Xin chào", clientMessageId: "cr12-msg-0001" });
    expect(send.status).toBe(403);
    expect(send.body.error.code).toBe("RECR_008");

    // Công ty khác vẫn thấy sinh viên
    const otherSearch = await api("get", `/companies/${other.id}/talent/search?skills=blocker-skill`, tokenFor(other.ownerId));
    expect(ids(otherSearch)).toEqual([student.id]);

    const list = await api("get", "/me/company-blocks", tokenFor(student.id));
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].company).toMatchObject({ id: company.id, name: "Công ty Tìm Người" });

    // Bỏ chặn: thấy lại nhưng thread cũ vẫn khoá
    expect((await api("delete", `/me/company-blocks/${company.id}`, tokenFor(student.id))).status).toBe(200);
    expect(ids(await search(q))).toEqual([student.id]);
    expect((await prisma.jobOffer.findUniqueOrThrow({ where: { id: offerId } })).threadLocked).toBe(true);
    expect((await api("post", "/me/company-blocks", tokenFor(student.id), { companyId: newObjectId() })).status).toBe(404);
  });
});

describe("CR-11 — xem hồ sơ ứng viên", () => {
  it("3 lượt xem trong ngày → 3 AuditLog talent.profile-view + 1 TalentProfileView viewCount=3 (recruiterIds gộp 2 HR); hồ sơ không email", async () => {
    const student = await talent({ name: "Ứng viên bị xem", skills: [{ id: "65f0000000000000000000c1", code: "reactjs", name: "ReactJS" }], portfolioUrl: "https://superapp.test/p/xem" });
    rig.badges.byUser.set(student.id, [badgeDto("65f0000000000000000000c1", "reactjs", "ReactJS")]);
    const hr2 = await seedUser("HR thứ hai");
    users.push(hr2);
    await seedMember(company.id, hr2);

    const r1 = await api("get", `/companies/${company.id}/talent/${student.id}`, tokenFor(hr));
    expect(r1.status).toBe(200);
    expect(r1.body.data.card).toMatchObject({ userId: student.id, displayName: "Ứng viên bị xem", portfolioUrl: "https://superapp.test/p/xem" });
    expect(r1.body.data.badges).toEqual([expect.objectContaining({ code: "reactjs", unlockedAt: "2026-09-01T00:00:00.000Z", proof: { tasksDone: 10, storyPoints: 30, avgPeerScore: 8 } })]);
    expect(r1.body.data.openOffer).toBeNull();
    await api("get", `/companies/${company.id}/talent/${student.id}`, tokenFor(hr));
    await api("get", `/companies/${company.id}/talent/${student.id}`, tokenFor(hr2));

    const audits = rig.audit.of("talent.profile-view");
    expect(audits).toHaveLength(3);
    expect(audits[0]).toMatchObject({ actorId: hr, targetType: "USER", targetId: student.id, metadata: { companyId: company.id } });
    const views = await prisma.talentProfileView.findMany({ where: { studentId: student.id } });
    expect(views).toHaveLength(1);
    expect(views[0].viewCount).toBe(3);
    expect([...views[0].recruiterIds].sort()).toEqual([hr, hr2].sort());
    expect(views[0].dayKey).toBe("2026-09-15");
    expect(JSON.stringify(r1.body)).not.toMatch(/email|phone/i);

    // Sinh viên xem "doanh nghiệp đã xem hồ sơ" (P1) — theo ngày, không lộ HR
    const seen = await api("get", "/me/profile-views", tokenFor(student.id));
    expect(seen.status).toBe(200);
    expect(seen.body.data).toEqual([expect.objectContaining({ dayKey: "2026-09-15", viewCount: 3, company: expect.objectContaining({ id: company.id }) })]);
    expect(JSON.stringify(seen.body)).not.toContain(hr);
  });

  it("lượt 301 trong ngày → 429 RECR_010; hồ sơ không tồn tại/đã tắt → 404 và KHÔNG ghi nhật ký", async () => {
    const student = await talent({ name: "Ứng viên trần lượt xem" });
    const bucket = Math.floor(Date.now() / 1000 / 86400);
    redisStore.set(`rl:talent-view:${hr}:86400:${bucket}`, 299);
    expect((await api("get", `/companies/${company.id}/talent/${student.id}`, tokenFor(hr))).status).toBe(200); // lượt 300
    const over = await api("get", `/companies/${company.id}/talent/${student.id}`, tokenFor(hr)); // lượt 301
    expect(over.status).toBe(429);
    expect(over.body.error.code).toBe("RECR_010");

    redisStore.clear();
    setRecruiterEnabled(true);
    rig.audit.records.length = 0;
    const ghost = await api("get", `/companies/${company.id}/talent/${newObjectId()}`, tokenFor(hr));
    expect(ghost.status).toBe(404);
    expect(rig.audit.of("talent.profile-view")).toHaveLength(0);
  });

  it("minh chứng: chỉ huy hiệu nằm trong bản chiếu (showSkills bật); người xem truyền cho cổng career là HR", async () => {
    const skillId = "65f0000000000000000000d1";
    const shown = await talent({ name: "Có minh chứng", skills: [{ id: skillId, code: "reactjs" }] });
    const hidden = await talent({ name: "Ẩn kỹ năng", showSkills: false, skills: [{ id: skillId, code: "reactjs" }] });
    const ok = await api("get", `/companies/${company.id}/talent/${shown.id}/skills/${skillId}/proof`, tokenFor(hr));
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ tasksDone: 12, verifiedBy: "SYSTEM" });
    expect(rig.proofs.calls.at(-1)).toEqual({ viewerId: hr, targetId: shown.id, skillId });
    expect((await api("get", `/companies/${company.id}/talent/${hidden.id}/skills/${skillId}/proof`, tokenFor(hr))).status).toBe(404);
    expect((await api("get", `/companies/${company.id}/talent/${shown.id}/skills/${newObjectId()}/proof`, tokenFor(hr))).status).toBe(404);
  });

  it("người ngoài công ty (kể cả admin/manager vận hành) → 404; chưa đăng nhập → 401", async () => {
    const outsider = await seedUser("Người ngoài tìm");
    users.push(outsider);
    expect((await search("", outsider)).status).toBe(404);
    expect((await api("get", `/companies/${company.id}/talent/search`, null)).status).toBe(401);
    expect((await api("get", `/companies/${company.id}/talent/search`, tokenFor(outsider, "admin"))).status).toBe(404);
  });
});
