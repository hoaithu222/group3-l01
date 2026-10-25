import { installMocks, redisStore, setRecruiterEnabled } from "./recruiter-test-mocks";
import { buildRig, cleanup, ensureRecruiterIndexes, makeApi, seedCompany, seedMember, seedOffer, seedUser, tokenFor, type Api, type Rig } from "./recruiter-test-kit";
import { prisma } from "../../../../infrastructure/database";
import { newObjectId } from "../../../../core/utils/object-id";

/**
 * Doanh nghiệp: đăng ký (RECR_001/004, MST, không MST trùng nhau), OWNER/RECRUITER, sửa hồ sơ (khoá tên/MST/website sau duyệt — RECR_009, CAS expectedVersion), gửi duyệt lại,
 * nhân sự (RECR_011/012, kích hoạt lại hàng cũ), cờ `recruiter.enabled`, quyền vận hành theo VAI HỆ THỐNG (HR không lọt vào /admin — CR-44), duyệt/từ chối/tạm ngưng/khôi phục + audit.
 */
let rig: Rig;
let api: Api;
const users: string[] = [];
const companies: string[] = [];
let admin: string;
let manager: string;
let plain: string;

beforeAll(async () => {
  installMocks();
  await ensureRecruiterIndexes();
  rig = buildRig();
  api = makeApi(rig.app);
  admin = await seedUser("Quản trị", { role: "admin" });
  manager = await seedUser("Điều phối", { role: "manager" });
  plain = await seedUser("Người dùng thường");
  users.push(admin, manager, plain);
});

beforeEach(() => {
  installMocks();
  redisStore.clear();
  setRecruiterEnabled(true);
  rig.config.on = true;
  rig.audit.records.length = 0;
});

afterAll(async () => {
  await cleanup(users, companies);
});

const body = (over: Record<string, unknown> = {}) => ({ name: `Công ty ${newObjectId().slice(-8)}`, website: "https://www.acme.test/about", ...over });

async function register(userId: string, over: Record<string, unknown> = {}) {
  const res = await api("post", "/companies", tokenFor(userId), body(over));
  if (res.status === 201) companies.push(res.body.data.company.id);
  return res;
}

describe("đăng ký doanh nghiệp", () => {
  it("tạo công ty PENDING + người đăng ký là OWNER, ghi audit và outbox; /me/company trả role + quyền", async () => {
    const owner = await seedUser("Chủ A");
    users.push(owner);
    const res = await register(owner, { taxCode: "0123456789", description: "Mô tả", industry: "Phần mềm", sizeRange: "S11_50" });
    expect(res.status).toBe(201);
    expect(res.body.data.company).toMatchObject({ status: "PENDING", tier: "FREE", taxCode: "0123456789", version: 1 });
    expect(res.body.data.membership).toMatchObject({ role: "OWNER", status: "ACTIVE" });
    expect(res.body.data.permissions).toEqual(["company.view", "company.manage"]);
    expect(rig.audit.of("company.register")).toHaveLength(1);
    const row = await prisma.company.findUniqueOrThrow({ where: { id: res.body.data.company.id } });
    expect(row.emailDomain).toBe("acme.test");
    expect(row.taxCodeKey).toBe("0123456789");
    const events = await prisma.outboxEvent.findMany({ where: { aggregateId: row.id, jobName: "company.status-notify" } });
    expect(events).toHaveLength(1);
    expect(events[0].payload).toMatchObject({ status: "PENDING", notifyOps: true, notifyOwner: false });

    const mine = await api("get", "/me/company", tokenFor(owner));
    expect(mine.status).toBe(200);
    expect(mine.body.data.company.id).toBe(row.id);
  });

  it("RECR_001: đã thuộc một doanh nghiệp (đăng ký lần hai, kể cả song song chỉ một thắng)", async () => {
    const owner = await seedUser("Chủ B");
    users.push(owner);
    expect((await register(owner)).status).toBe(201);
    const again = await register(owner);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("RECR_001");

    const racer = await seedUser("Đua đăng ký");
    users.push(racer);
    const results = await Promise.all([register(racer), register(racer), register(racer)]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status !== 201).every((r) => r.body.error.code === "RECR_001")).toBe(true);
  });

  it("RECR_004: trùng tên (không phân biệt dấu/hoa thường/dấu câu) hoặc trùng MST; hai công ty KHÔNG MST cùng tồn tại được", async () => {
    const a = await seedUser("Chủ C");
    const b = await seedUser("Chủ D");
    const c = await seedUser("Chủ E");
    const d = await seedUser("Chủ F");
    users.push(a, b, c, d);
    expect((await register(a, { name: "Công ty Trách Nhiệm ABC", taxCode: "0987654321" })).status).toBe(201);
    const sameName = await register(b, { name: "CONG TY trach nhiem A.B.C" });
    expect(sameName.status).toBe(409);
    expect(sameName.body.error.code).toBe("RECR_004");
    const sameTax = await register(b, { name: "Tên khác hẳn", taxCode: "0987654321" });
    expect(sameTax.status).toBe(409);
    expect(sameTax.body.error.code).toBe("RECR_004");
    expect((await register(b, { name: "Không MST một" })).status).toBe(201);
    expect((await register(c, { name: "Không MST hai" })).status).toBe(201);
    expect((await register(d, { name: "Không MST ba" })).status).toBe(201);
  });

  it("validate: MST sai dạng, website không phải http(s), trường lạ (tier/status) → 400 VAL_001; chưa đăng nhập → 401", async () => {
    const u = await seedUser("Chủ G");
    users.push(u);
    for (const bad of [{ taxCode: "123" }, { website: "javascript:alert(1)" }, { tier: "ENTERPRISE" }, { status: "APPROVED" }]) {
      const res = await api("post", "/companies", tokenFor(u), body(bad));
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VAL_001");
    }
    expect((await api("post", "/companies", null, body())).status).toBe(401);
  });

  it("logo phải là asset của chính người đăng ký, READY, ảnh scope COMPANY (ngược lại 400)", async () => {
    const u = await seedUser("Chủ H");
    users.push(u);
    rig.assets.put({ id: "65f0000000000000000000a1", ownerId: u });
    rig.assets.put({ id: "65f0000000000000000000a2", ownerId: newObjectId() });
    rig.assets.put({ id: "65f0000000000000000000a3", ownerId: u, scope: "AVATAR" });
    expect((await register(u, { logoAssetId: "65f0000000000000000000a2" })).status).toBe(400);
    expect((await register(u, { logoAssetId: "65f0000000000000000000a3" })).status).toBe(400);
    const ok = await register(u, { logoAssetId: "65f0000000000000000000a1" });
    expect(ok.status).toBe(201);
    expect(ok.body.data.company.logoUrl).toBe("https://files.test/65f0000000000000000000a1");
    expect(rig.assets.logos).toContainEqual({ companyId: ok.body.data.company.id, assetId: "65f0000000000000000000a1" });
  });

  it("công tắc recruiter.enabled (mặc định TẮT): tắt → 404 CFG_005 cho route người dùng/HR, /admin vẫn dùng được; bật lại → chạy", async () => {
    const u = await seedUser("Chủ cờ");
    users.push(u);
    setRecruiterEnabled(false);
    const off = await api("get", "/me/company", tokenFor(u));
    expect(off.status).toBe(404);
    expect(off.body.error.code).toBe("CFG_005");
    expect((await api("post", "/companies", tokenFor(u), body())).status).toBe(404);
    expect((await api("get", "/admin/companies", tokenFor(admin, "admin"))).status).toBe(200);
    setRecruiterEnabled(true);
    expect((await api("get", "/me/company", tokenFor(u))).status).toBe(404); // bật lại: route chạy, người dùng chưa có công ty
    const { SYSTEM_CONFIG_REGISTRY } = await import("../../../../core/config/system-config.registry");
    expect(SYSTEM_CONFIG_REGISTRY["recruiter"].fields.find((f) => f.path === "enabled")?.default).toBe(false);
  });
});

describe("sửa hồ sơ + gửi duyệt lại", () => {
  it("PATCH: OWNER sửa mô tả/logo; RECRUITER bị RECR_003; người ngoài 404; lệch expectedVersion → 409 RES_003", async () => {
    const co = await seedCompany({ status: "PENDING" });
    const hr = await seedUser("HR");
    const outsider = await seedUser("Người ngoài");
    users.push(co.ownerId, hr, outsider);
    companies.push(co.id);
    await seedMember(co.id, hr);

    const ok = await api("patch", `/companies/${co.id}`, tokenFor(co.ownerId), { description: "Mô tả mới", expectedVersion: 1 });
    expect(ok.status).toBe(200);
    expect(ok.body.data.description).toBe("Mô tả mới");
    expect(ok.body.data.version).toBe(2);

    const stale = await api("patch", `/companies/${co.id}`, tokenFor(co.ownerId), { description: "Cũ", expectedVersion: 1 });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("RES_003");
    expect(stale.body.error.details.currentVersion).toBe(2);

    const notOwner = await api("patch", `/companies/${co.id}`, tokenFor(hr), { description: "x", expectedVersion: 2 });
    expect(notOwner.status).toBe(403);
    expect(notOwner.body.error.code).toBe("RECR_003");
    expect((await api("patch", `/companies/${co.id}`, tokenFor(outsider), { description: "x", expectedVersion: 2 })).status).toBe(404);
  });

  it("tên/MST/website khoá khi đã duyệt (RECR_009) nhưng gửi lại đúng giá trị hiện tại thì không sao; PENDING đổi được tên", async () => {
    const approved = await seedCompany({ status: "APPROVED", name: "Công ty Đã Duyệt Khoá" });
    const pending = await seedCompany({ status: "PENDING", name: "Công ty Đang Chờ" });
    users.push(approved.ownerId, pending.ownerId);
    companies.push(approved.id, pending.id);

    const locked = await api("patch", `/companies/${approved.id}`, tokenFor(approved.ownerId), { name: "Tên Mới Hoàn Toàn", expectedVersion: 1 });
    expect(locked.status).toBe(409);
    expect(locked.body.error.code).toBe("RECR_009");
    expect(locked.body.error.details.locked).toContain("name");
    const same = await api("patch", `/companies/${approved.id}`, tokenFor(approved.ownerId), { name: "Công ty Đã Duyệt Khoá", description: "ok", expectedVersion: 1 });
    expect(same.status).toBe(200);

    const renamed = await api("patch", `/companies/${pending.id}`, tokenFor(pending.ownerId), { name: "Công ty Đổi Tên Được", taxCode: "1112223334", expectedVersion: 1 });
    expect(renamed.status).toBe(200);
    const row = await prisma.company.findUniqueOrThrow({ where: { id: pending.id } });
    expect(row.nameKey).toBe("congtydoitenduoc");
    expect(row.taxCodeKey).toBe("1112223334");
  });

  it("REJECTED nhả khoá; resubmit chỉ từ REJECTED (RECR_009 nếu không) và tranh lại khoá (trùng → RECR_004)", async () => {
    const a = await seedUser("Chủ bị từ chối");
    users.push(a);
    const created = await register(a, { name: "Công ty Bị Từ Chối", taxCode: "5556667778" });
    const id = created.body.data.company.id as string;
    // chưa REJECTED → resubmit bị RECR_009
    const early = await api("post", `/companies/${id}/resubmit`, tokenFor(a));
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe("RECR_009");

    const rejected = await api("post", `/admin/companies/${id}/reject`, tokenFor(admin, "admin"), { reason: "Website không xác minh được" });
    expect(rejected.status).toBe(200);
    expect(rejected.body.data).toMatchObject({ status: "REJECTED", statusReason: "Website không xác minh được" });
    const row = await prisma.company.findUniqueOrThrow({ where: { id } });
    expect(row.nameKey).toBe(`rejected:${id}`);
    expect(row.taxCodeKey).toBe(`none:${id}`);

    // Người khác đăng ký được đúng tên + MST vừa nhả khoá
    const b = await seedUser("Người đăng ký sau");
    users.push(b);
    const taken = await register(b, { name: "Công ty Bị Từ Chối", taxCode: "5556667778" });
    expect(taken.status).toBe(201);

    // Chủ cũ resubmit → khoá đã bị chiếm → RECR_004
    const conflict = await api("post", `/companies/${id}/resubmit`, tokenFor(a));
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe("RECR_004");

    // Sau khi công ty kia bị từ chối (nhả khoá), resubmit thành công → PENDING, statusReason xoá
    await api("post", `/admin/companies/${taken.body.data.company.id}/reject`, tokenFor(admin, "admin"), { reason: "Trùng công ty đã có" });
    const ok = await api("post", `/companies/${id}/resubmit`, tokenFor(a));
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ status: "PENDING", statusReason: null });
    expect(rig.audit.of("company.resubmit")).toHaveLength(1);
  });
});

describe("nhân sự", () => {
  it("thêm theo email (công ty APPROVED, OWNER): RECR_011 người đã thuộc doanh nghiệp khác; 404 email lạ; RECR_012 gỡ OWNER cuối; kích hoạt lại hàng cũ", async () => {
    const co = await seedCompany({ status: "APPROVED" });
    const other = await seedCompany({ status: "APPROVED" });
    const hr = await seedUser("HR mới", { email: "hr.moi@acme.test" });
    users.push(co.ownerId, other.ownerId, hr);
    companies.push(co.id, other.id);
    const owner = tokenFor(co.ownerId);

    const added = await api("post", `/companies/${co.id}/members`, owner, { email: "  HR.Moi@ACME.test ", role: "RECRUITER" });
    expect(added.status).toBe(201);
    expect(added.body.data).toMatchObject({ userId: hr, role: "RECRUITER", email: "hr.moi@acme.test" });
    expect(rig.audit.of("company.member-add")).toHaveLength(1);

    const list = await api("get", `/companies/${co.id}/members`, tokenFor(hr));
    expect(list.body.data.map((m: { userId: string }) => m.userId).sort()).toEqual([co.ownerId, hr].sort());

    // đã thuộc công ty này → 409 RECR_011 (alreadyMember); thuộc công ty khác → 409 RECR_011
    const dup = await api("post", `/companies/${co.id}/members`, owner, { email: "hr.moi@acme.test", role: "RECRUITER" });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("RECR_011");
    const ownerOfOther = await prisma.user.findUniqueOrThrow({ where: { id: other.ownerId } });
    const elsewhere = await api("post", `/companies/${co.id}/members`, owner, { email: ownerOfOther.email, role: "RECRUITER" });
    expect(elsewhere.status).toBe(409);
    expect(elsewhere.body.error.code).toBe("RECR_011");
    expect((await api("post", `/companies/${co.id}/members`, owner, { email: "khong.ton.tai@acme.test", role: "RECRUITER" })).status).toBe(404);

    // RECRUITER không thêm/gỡ được (RECR_003)
    const byHr = await api("post", `/companies/${co.id}/members`, tokenFor(hr), { email: ownerOfOther.email, role: "RECRUITER" });
    expect(byHr.status).toBe(403);
    expect(byHr.body.error.code).toBe("RECR_003");

    // gỡ HR → REMOVED (mất quyền ngay: 404 vì không còn là nhân sự); thêm lại → kích hoạt lại CÙNG hàng
    const before = await prisma.companyMember.findFirstOrThrow({ where: { companyId: co.id, userId: hr } });
    expect((await api("delete", `/companies/${co.id}/members/${hr}`, owner)).status).toBe(200);
    expect((await api("get", `/companies/${co.id}/members`, tokenFor(hr))).status).toBe(404);
    const back = await api("post", `/companies/${co.id}/members`, owner, { email: "hr.moi@acme.test", role: "OWNER" });
    expect(back.status).toBe(201);
    const after = await prisma.companyMember.findMany({ where: { companyId: co.id, userId: hr } });
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe(before.id);
    expect(after[0]).toMatchObject({ status: "ACTIVE", role: "OWNER", activeKey: hr });

    // hai OWNER → gỡ được một; OWNER cuối cùng → RECR_012
    expect((await api("delete", `/companies/${co.id}/members/${hr}`, owner)).status).toBe(200);
    const last = await api("delete", `/companies/${co.id}/members/${co.ownerId}`, owner);
    expect(last.status).toBe(400);
    expect(last.body.error.code).toBe("RECR_012");
  });

  it("hai OWNER gỡ nhau cùng lúc → luôn còn ≥ 1 OWNER", async () => {
    const co = await seedCompany({ status: "APPROVED" });
    const second = await seedUser("OWNER hai");
    users.push(co.ownerId, second);
    companies.push(co.id);
    await seedMember(co.id, second, "OWNER");
    const results = await Promise.all([
      api("delete", `/companies/${co.id}/members/${second}`, tokenFor(co.ownerId)),
      api("delete", `/companies/${co.id}/members/${co.ownerId}`, tokenFor(second)),
    ]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(await prisma.companyMember.count({ where: { companyId: co.id, role: "OWNER", status: "ACTIVE" } })).toBe(1);
  });

  it("công ty PENDING: chưa thêm được nhân sự (RECR_002); tối đa membersMax", async () => {
    const pending = await seedCompany({ status: "PENDING" });
    users.push(pending.ownerId);
    companies.push(pending.id);
    const res = await api("post", `/companies/${pending.id}/members`, tokenFor(pending.ownerId), { email: "a@b.co", role: "RECRUITER" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("RECR_002");
  });
});

describe("quyền vận hành theo VAI HỆ THỐNG (CR-44)", () => {
  it("manager (không là nhân sự) gọi API ứng viên → 404 trung tính; HR (có recruiter:view theo DỮ LIỆU) KHÔNG vào được /admin/companies", async () => {
    const co = await seedCompany({ status: "APPROVED" });
    users.push(co.ownerId);
    companies.push(co.id);
    const asManager = await api("get", `/companies/${co.id}/talent/search`, tokenFor(manager, "manager"));
    expect(asManager.status).toBe(404);
    expect((await api("get", `/companies/${co.id}`, tokenFor(admin, "admin"))).status).toBe(404);

    const hr = tokenFor(co.ownerId);
    for (const [method, path] of [["get", "/admin/companies"], ["get", `/admin/companies/${co.id}`], ["get", "/admin/recruiter/stats?from=2026-01-01&to=2026-09-30"]] as const) {
      const res = await api(method, path, hr);
      expect(res.status).toBe(403);
    }
    const patch = await api("patch", `/admin/companies/${co.id}`, hr, { tier: "ENTERPRISE", reason: "HR tự nâng gói cho mình", expectedVersion: 1 });
    expect(patch.status).toBe(403);
    expect((await prisma.company.findUniqueOrThrow({ where: { id: co.id } })).tier).toBe("FREE");

    expect((await api("get", "/admin/companies", tokenFor(plain))).status).toBe(403);
    expect((await api("get", "/admin/companies", null)).status).toBe(401);
  });

  it("manager có recruiter:view|approve nhưng KHÔNG recruiter:update (đổi gói chỉ admin)", async () => {
    const co = await seedCompany({ status: "PENDING" });
    users.push(co.ownerId);
    companies.push(co.id);
    const list = await api("get", "/admin/companies?limit=100", tokenFor(manager, "manager"));
    expect(list.status).toBe(200);
    const approve = await api("post", `/admin/companies/${co.id}/approve`, tokenFor(manager, "manager"), { reason: "Đã xác minh website và MST" });
    expect(approve.status).toBe(200);
    const patch = await api("patch", `/admin/companies/${co.id}`, tokenFor(manager, "manager"), { tier: "PRO", reason: "Nâng gói theo hợp đồng", expectedVersion: 2 });
    expect(patch.status).toBe(403);
    const asAdmin = await api("patch", `/admin/companies/${co.id}`, tokenFor(admin, "admin"), { tier: "PRO", offerQuotaOverride: 100, reason: "Nâng gói theo hợp đồng", expectedVersion: 2 });
    expect(asAdmin.status).toBe(200);
    expect(asAdmin.body.data).toMatchObject({ tier: "PRO", version: 3 });
    expect(rig.audit.of("company.admin-update")).toHaveLength(1);
    expect(rig.audit.of("company.admin-update")[0].reason).toBe("Nâng gói theo hợp đồng");
  });
});

describe("duyệt / từ chối / tạm ngưng / khôi phục", () => {
  it("chuyển trạng thái hợp lệ cần lý do ≥ 10 ký tự, ghi audit + outbox; chuyển sai → 409 RECR_009", async () => {
    const co = await seedCompany({ status: "PENDING" });
    users.push(co.ownerId);
    companies.push(co.id);
    const t = tokenFor(admin, "admin");
    const noReason = await api("post", `/admin/companies/${co.id}/approve`, t, { reason: "ngắn" });
    expect(noReason.status).toBe(400);

    expect((await api("post", `/admin/companies/${co.id}/suspend`, t, { reason: "Chưa duyệt sao tạm ngưng" })).body.error.code).toBe("RECR_009");
    expect((await api("post", `/admin/companies/${co.id}/reinstate`, t, { reason: "Chưa duyệt sao khôi phục" })).body.error.code).toBe("RECR_009");

    const approved = await api("post", `/admin/companies/${co.id}/approve`, t, { reason: "Đã xác minh website và MST" });
    expect(approved.status).toBe(200);
    expect(approved.body.data.status).toBe("APPROVED");
    expect((await api("post", `/admin/companies/${co.id}/approve`, t, { reason: "Duyệt lần hai vô nghĩa" })).body.error.code).toBe("RECR_009");

    const suspended = await api("post", `/admin/companies/${co.id}/suspend`, t, { reason: "Có báo cáo lạm dụng dữ liệu ứng viên" });
    expect(suspended.body.data).toMatchObject({ status: "SUSPENDED", statusReason: "Có báo cáo lạm dụng dữ liệu ứng viên" });
    expect(rig.reports.closed).toContainEqual(expect.objectContaining({ targetType: "COMPANY", targetId: co.id }));
    const reinstated = await api("post", `/admin/companies/${co.id}/reinstate`, t, { reason: "Đã xử lý xong khiếu nại" });
    expect(reinstated.body.data).toMatchObject({ status: "APPROVED", statusReason: null });

    for (const a of ["approve", "suspend", "reinstate"]) expect(rig.audit.of(`company.${a}`).length).toBeGreaterThanOrEqual(1);
    const events = await prisma.outboxEvent.findMany({ where: { aggregateId: co.id, jobName: "company.status-notify" }, orderBy: { createdAt: "asc" } });
    expect(events.length).toBe(3);
    expect(events.map((e) => (e.payload as { status: string }).status)).toEqual(["APPROVED", "SUSPENDED", "APPROVED"]);
  });

  it("danh sách + chi tiết vận hành: membersCount, offersThisMonth, không nội dung/tên người nhận lời mời", async () => {
    const co = await seedCompany({ status: "APPROVED", name: "Công ty Danh Sách Ops" });
    users.push(co.ownerId);
    companies.push(co.id);
    const student = await seedUser("Sinh viên bí mật");
    users.push(student);
    await seedOffer({ companyId: co.id, recruiterId: co.ownerId, studentId: student });
    const t = tokenFor(admin, "admin");
    const list = await api("get", "/admin/companies?q=danh%20sach%20ops&status=APPROVED", t);
    expect(list.status).toBe(200);
    const item = list.body.data.find((c: { id: string }) => c.id === co.id);
    expect(item).toMatchObject({ membersCount: 1, offersThisMonth: 0, quota: 5, status: "APPROVED" });
    expect(list.body.meta).toMatchObject({ page: 1, total: 1 });

    const detail = await api("get", `/admin/companies/${co.id}`, t);
    expect(detail.status).toBe(200);
    expect(detail.body.data.offersByStatus.SENT).toBe(1);
    expect(detail.body.data.usage).toHaveLength(6);
    expect(detail.body.data.members[0]).toMatchObject({ role: "OWNER" });
    const text = JSON.stringify(detail.body);
    expect(text).not.toContain("Sinh viên bí mật");
    expect(text).not.toContain("Chúng tôi muốn mời bạn");
  });
});
