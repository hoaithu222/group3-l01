import { EMPTY_SNAPSHOT } from "../entities/portfolio.interface";
import { PortfolioSnapshotService, SnapshotUnavailableError } from "../services/portfolio-snapshot.service";
import { buildHarness, seedUser, seedWorkspace, stats, type Harness } from "./support/harness";

/** CR-04 (số liệu đúng), CR-31 (đồng đội theo đồng ý), giới hạn công khai theo quyền riêng tư, cổng lỗi/quá hạn không làm sai số liệu. */
let h: Harness;
let owner: string;
let ws: string;

beforeEach(() => {
  h = buildHarness();
  owner = seedUser(h, "An").id;
  ws = seedWorkspace(h, owner, "Nhóm Alpha", { files: 7 });
  h.contribution.scores.set(`${owner}:${ws}`, { scoreX10: 910, shareX10: 310, boards: 1 });
});

describe("capture — số liệu", () => {
  it("CR-04: 40 task, 62 điểm, đúng hạn 90%, đóng góp (bật showContribution), review TB, 7 tệp", async () => {
    const s = await h.c.snapshots.capture(owner, ws, { showTeammates: false });
    expect(s).toMatchObject({ tasksDone: 40, storyPointsX10: 620, onTimeRatePct: 90, contributionPctX10: 910, contributionShareX10: 310, peerReviewAvgX10: 85, filesUploaded: 7, teammatesCount: 0, namedTeammates: [], skillBadges: [] });
  });

  it("chưa có hạn nộp / chưa có lượt chấm → onTimeRatePct và peerReviewAvgX10 = null (ẩn, không phải 0)", async () => {
    h.source.stats.set(`${owner}:${ws}`, stats({ tasksWithDue: 0, tasksOnTime: 0, reviewCount: 0, peerScoreWeightedSum: 0 }));
    const s = await h.c.snapshots.capture(owner, ws, { showTeammates: false });
    expect(s?.onTimeRatePct).toBeNull();
    expect(s?.peerReviewAvgX10).toBeNull();
  });

  it("chủ hồ sơ TẮT showContribution → không lưu điểm đóng góp và KHÔNG gọi cổng đóng góp", async () => {
    h.career.visibilityOf.set(owner, { showSkills: true, proofTitles: false, showContribution: false, showQuiz: false, appearInOthersPortfolios: false });
    const spy = jest.spyOn(h.contribution, "memberScore");
    const s = await h.c.snapshots.capture(owner, ws, { showTeammates: false });
    expect(s?.contributionPctX10).toBeNull();
    expect(s?.contributionShareX10).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("chưa có thẻ hoàn thành nào được tính → null (không đủ điều kiện)", async () => {
    h.source.stats.delete(`${owner}:${ws}`);
    expect(await h.c.snapshots.capture(owner, ws, { showTeammates: false })).toBeNull();
    expect(await h.c.snapshots.tasksDone(owner, ws)).toBe(0);
  });
});

describe("capture — cổng lỗi hoặc quá hạn", () => {
  const previous = { ...EMPTY_SNAPSHOT, tasksDone: 30, filesUploaded: 5, teammatesCount: 2, contributionPctX10: 800, contributionShareX10: 250 };

  it("cổng số liệu CHÍNH lỗi → ném SnapshotUnavailableError (không ghi đè snapshot cũ bằng 0)", async () => {
    h.source.failing.add("memberStats");
    await expect(h.c.snapshots.capture(owner, ws, { showTeammates: false, previous })).rejects.toBeInstanceOf(SnapshotUnavailableError);
  });

  it("cổng PHỤ lỗi (đóng góp, tệp, đồng đội) → giữ giá trị của snapshot trước, số liệu chính vẫn mới", async () => {
    h.contribution.failing = true;
    h.source.failing.add("filesUploaded");
    h.source.failing.add("coAssignees");
    const s = await h.c.snapshots.capture(owner, ws, { showTeammates: false, previous });
    expect(s).toMatchObject({ tasksDone: 40, filesUploaded: 5, teammatesCount: 2, contributionPctX10: 800, contributionShareX10: 250 });
  });

  it("cổng phụ lỗi và CHƯA có snapshot cũ → null/0, không ném", async () => {
    h.contribution.failing = true;
    h.source.failing.add("filesUploaded");
    const s = await h.c.snapshots.capture(owner, ws, { showTeammates: false });
    expect(s).toMatchObject({ contributionPctX10: null, filesUploaded: 0 });
  });

  it("cổng treo quá hạn → coi như lỗi (timeout ngắn)", async () => {
    jest.spyOn(h.source, "memberStats").mockImplementation(() => new Promise(() => undefined));
    const slow = new PortfolioSnapshotService(h.source, h.contribution, { visibilityOf: async () => (await h.career.career(owner)).visibility }, 40);
    await expect(slow.capture(owner, ws, { showTeammates: false })).rejects.toBeInstanceOf(SnapshotUnavailableError);
  });
});

describe("đồng đội (CR-31)", () => {
  let lan: string;
  let minh: string;
  let khoa: string;

  beforeEach(() => {
    lan = seedUser(h, "Lan Anh").id;
    minh = seedUser(h, "Minh").id;
    khoa = seedUser(h, "Khoa").id;
    h.source.coAssigneesOf.set(`${owner}:${ws}`, [lan, minh, khoa]);
    h.source.consent.add(lan);
  });

  it("showTeammates=false: chỉ ĐẾM, không tên nào", async () => {
    const s = await h.c.snapshots.capture(owner, ws, { showTeammates: false });
    expect(s).toMatchObject({ teammatesCount: 3, namedTeammates: [] });
  });

  it("showTeammates=true: chỉ tên người đã bật appearInOthersPortfolios (1/3), số đếm vẫn là 3", async () => {
    const s = await h.c.snapshots.capture(owner, ws, { showTeammates: true });
    expect(s).toMatchObject({ teammatesCount: 3, namedTeammates: ["Lan Anh"] });
  });

  it("tài khoản đã ẩn danh hoá không được đếm; tài khoản bị khoá đồng ý cũng KHÔNG hiện tên (vẫn được đếm)", async () => {
    h.source.userRefs.set(minh, { id: minh, name: "Tài khoản đã xoá", status: "ANONYMIZED", avatarAssetId: null });
    h.source.userRefs.set(khoa, { id: khoa, name: "Khoa", status: "LOCKED", avatarAssetId: null });
    h.source.consent.add(minh);
    h.source.consent.add(khoa);
    const s = await h.c.snapshots.capture(owner, ws, { showTeammates: true });
    expect(s).toMatchObject({ teammatesCount: 2, namedTeammates: ["Lan Anh"] });
  });

  it("tên hiển thị sắp theo bảng chữ cái và tối đa 10", async () => {
    const many = Array.from({ length: 14 }, (_, i) => seedUser(h, `Bạn ${String(i).padStart(2, "0")}`).id);
    many.forEach((id) => h.source.consent.add(id));
    h.source.coAssigneesOf.set(`${owner}:${ws}`, many);
    const s = await h.c.snapshots.capture(owner, ws, { showTeammates: true });
    expect(s?.teammatesCount).toBe(14);
    expect(s?.namedTeammates).toHaveLength(10);
    expect(s?.namedTeammates[0]).toBe("Bạn 00");
  });

  it("không đọc được đồng ý → KHÔNG hiện tên (an toàn), vẫn đếm", async () => {
    h.source.failing.add("teammateConsent");
    const s = await h.c.snapshots.capture(owner, ws, { showTeammates: true });
    expect(s).toMatchObject({ teammatesCount: 3, namedTeammates: [] });
  });

  it("recaptureTeammates chỉ đổi phần đồng đội, giữ nguyên số liệu khác", async () => {
    const cur = { ...EMPTY_SNAPSHOT, tasksDone: 12, storyPointsX10: 100, filesUploaded: 3 };
    const next = await h.c.snapshots.recaptureTeammates(owner, ws, true, cur);
    expect(next).toMatchObject({ tasksDone: 12, storyPointsX10: 100, filesUploaded: 3, teammatesCount: 3, namedTeammates: ["Lan Anh"] });
    const off = await h.c.snapshots.recaptureTeammates(owner, ws, false, next);
    expect(off).toMatchObject({ teammatesCount: 3, namedTeammates: [] });
  });
});
