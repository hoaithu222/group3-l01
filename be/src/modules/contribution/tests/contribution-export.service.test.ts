import { LIMITS } from "../../../core/constants/limits";
import { ContributionExportJobService } from "../services/export/contribution-export-job.service";
import { formatVerifyCode, VERIFY_CODE_RE } from "../services/export/verify-code";
import { createHarness, FakeAssets, FakeNotifier, IDS, seedDone, type Harness } from "./support/harness";
import { extractPdfLines, extractPdfText, pdfPageCount } from "./support/pdf-text";

async function fixture(): Promise<Harness> {
  const h = createHarness(new Date("2026-09-15T03:00:00Z"));
  h.directory.users.set(IDS.an, { id: IDS.an, name: "Nguyễn Văn Ưu", avatarUrl: null, membership: "ACTIVE" });
  h.directory.users.set(IDS.chi, { id: IDS.chi, name: "Đặng Thị Hoài Thu", avatarUrl: null, membership: "ACTIVE" });
  h.directory.workspaces.set(IDS.ws, "Nhóm Đồ án tốt nghiệp");
  const due = "2026-09-10T10:00:00Z";
  await seedDone(h, 1, { assignees: [IDS.an], storyPoints: 5, due, completedAt: "2026-09-10T08:00:00Z" });
  await seedDone(h, 2, { assignees: [IDS.chi], storyPoints: 3, due, completedAt: "2026-09-11T08:00:00Z" });
  await h.facts.insertReviewFact({
    reviewId: "0000000000000000000009a1",
    taskId: "0000000000000000000005a1",
    boardId: IDS.board,
    workspaceId: IDS.ws,
    reviewerId: IDS.owner,
    assigneeIds: [IDS.an],
    status: "APPROVED",
    score10: 9,
    submittedAt: new Date("2026-09-12T05:00:00Z"),
  });
  await h.states.bumpFactsVersion(IDS.board, IDS.ws, await h.config.defaults());
  return h;
}

const req = (h: Harness, period = "ALL", includeHeatmap = true, u = IDS.an) => h.exports.request(h.as(u), IDS.board, { period, includeHeatmap });

describe("ContributionExportService — yêu cầu xuất + dedupe (PM2-36)", () => {
  it("tạo QUEUED (202) kèm hàng outbox contribution.export, mã xác thực 10 ký tự, hạn lưu 30 ngày", async () => {
    const h = await fixture();
    const { status, data } = await req(h);
    expect(status).toBe(202);
    expect(data.status).toBe("QUEUED");
    const rec = await h.exportRepo.findById(data.exportId);
    expect(rec).toMatchObject({ boardId: IDS.board, workspaceId: IDS.ws, requestedBy: IDS.an, periodKey: "ALL", includeHeatmap: true, status: "QUEUED", assetId: null });
    expect(rec?.verifyCode).toMatch(VERIFY_CODE_RE);
    expect(rec?.dataHash).toMatch(/^[0-9a-f]{64}$/);
    expect(rec?.dedupeKey).toBe(`${IDS.board}:ALL:${rec?.dataHash}:1`);
    expect(rec?.expiresAt.toISOString()).toBe(new Date(h.clock.now.getTime() + LIMITS.contribution.exportRetentionDays * 86_400_000).toISOString());
    expect(h.outbox.events).toEqual([{ type: "contribution.export", aggregateType: "ContributionExport", aggregateId: data.exportId, queue: "reports", jobName: "contribution.export", dedupeKey: `contribution.export:export:${data.exportId}`, payload: { exportId: data.exportId } }]);
  });

  it("bấm hai lần khi đang tạo → trả cùng bản, không thêm yêu cầu/job", async () => {
    const h = await fixture();
    const a = await req(h);
    const b = await req(h, "ALL", true, IDS.binh);
    expect(b.data.exportId).toBe(a.data.exportId);
    expect(b.status).toBe(202);
    expect(h.exportRepo.records.size).toBe(1);
    expect(h.outbox.events).toHaveLength(1);
  });

  it("kỳ sai → CONTRIB_003; khách/người ngoài → 404", async () => {
    const h = await fixture();
    await expect(req(h, "M:2026-00")).rejects.toMatchObject({ errorCode: "CONTRIB_003", statusCode: 400 });
    await expect(req(h, "ALL", true, IDS.outsider)).rejects.toMatchObject({ statusCode: 404 });
    expect(h.exportRepo.records.size).toBe(0);
  });

  it("dữ liệu đổi → yêu cầu mới (khoá dedupe khác); có/không heatmap là hai bản khác nhau", async () => {
    const h = await fixture();
    const first = await req(h);
    const noHeat = await req(h, "ALL", false);
    expect(noHeat.data.exportId).not.toBe(first.data.exportId);
    await seedDone(h, 9, { assignees: [IDS.an], storyPoints: 8 });
    await h.states.bumpFactsVersion(IDS.board, IDS.ws, await h.config.defaults());
    const changed = await req(h);
    expect(changed.data.exportId).not.toBe(first.data.exportId);
    expect(h.exportRepo.records.size).toBe(3);
  });
});

describe("ContributionExportJobService — dựng PDF, asset, thông báo", () => {
  it("READY: PDF đúng dấu tiếng Việt + chân trang mã xác thực/sha256, asset REPORT được gắn, thông báo chỉ có id", async () => {
    const h = await fixture();
    const { data } = await req(h);
    expect(await h.exportJobs.run(data.exportId)).toBe("READY");

    const rec = await h.exportRepo.findById(data.exportId);
    expect(rec).toMatchObject({ status: "READY", assetId: expect.any(String) as string });
    expect(h.assets.created).toHaveLength(1);
    expect(h.assets.created[0]).toMatchObject({ ownerId: IDS.an, workspaceId: IDS.ws, fileName: "dong-gop-sprint-1-all.pdf" });
    expect(h.assets.links).toEqual([{ assetId: rec?.assetId, exportId: data.exportId }]);

    const pdf = h.assets.created[0].buffer;
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    const text = extractPdfText(pdf);
    for (const expected of ["Báo cáo đóng góp", "Nhóm Đồ án tốt nghiệp", "Sprint 1", "Nguyễn Văn Ưu", "Đặng Thị Hoài Thu", "Kỳ báo cáo: Toàn bộ thời gian", "Công thức tính điểm", "Trọng số: điểm thẻ 60 · đúng hạn 20 · điểm chấm chéo 20"]) {
      expect(text).toContain(expected);
    }
    // Chân MỖI trang: mã xác thực + sha256 rút gọn + số trang.
    const lines = extractPdfLines(pdf);
    const footerLines = lines.filter((l) => l.includes("SHA-256") && l.includes("Trang"));
    expect(footerLines).toHaveLength(pdfPageCount(pdf));
    const short = `${rec?.dataHash.slice(0, 4)}…${rec?.dataHash.slice(-2)}`;
    for (const [i, line] of footerLines.entries()) expect(line).toContain(`Mã xác thực ${formatVerifyCode(rec?.verifyCode ?? "")} · SHA-256 ${short} Trang ${i + 1}/${footerLines.length}`);
    // Mã băm ĐẦY ĐỦ in ở khối xác thực (hai nửa 32 ký tự).
    expect(text).toContain(rec?.dataHash.slice(0, 32));
    expect(text).toContain(rec?.dataHash.slice(32));

    expect(h.notifier.sent).toEqual([
      { type: "contribution.export-ready", dedupeKey: `contribution.export-ready:export:${data.exportId}`, recipients: [IDS.an], refs: { exportId: data.exportId, boardId: IDS.board, workspaceId: IDS.ws } },
    ]);
    expect(JSON.stringify(h.notifier.sent)).not.toMatch(/Nguyễn|score|share/); // không số liệu/tên trong thông báo
  });

  it("job chạy lại (retry) sau khi xong → bỏ qua, không tạo asset/thông báo thứ hai", async () => {
    const h = await fixture();
    const { data } = await req(h);
    await h.exportJobs.run(data.exportId);
    expect(await h.exportJobs.run(data.exportId)).toBe("SKIPPED");
    expect(h.assets.created).toHaveLength(1);
    expect(h.notifier.sent).toHaveLength(1);
  });

  it("cùng kỳ + cùng dữ liệu đã có bản READY → yêu cầu tiếp theo trả bản cũ (200), không tạo bản mới", async () => {
    const h = await fixture();
    const first = await req(h);
    await h.exportJobs.run(first.data.exportId);
    const again = await req(h, "ALL", true, IDS.binh);
    expect(again.status).toBe(200);
    expect(again.data).toEqual({ exportId: first.data.exportId, status: "READY" });
    expect(h.exportRepo.records.size).toBe(1);
  });

  it("dữ liệu đổi giữa lúc xếp hàng và lúc chạy → in mã băm MỚI (và cập nhật bản ghi)", async () => {
    const h = await fixture();
    const { data } = await req(h);
    const queued = await h.exportRepo.findById(data.exportId);
    await seedDone(h, 9, { assignees: [IDS.chi], storyPoints: 13 });
    await h.states.bumpFactsVersion(IDS.board, IDS.ws, await h.config.defaults());
    await h.exportJobs.run(data.exportId);
    const done = await h.exportRepo.findById(data.exportId);
    expect(done?.dataHash).not.toBe(queued?.dataHash);
    expect(done?.dedupeKey).toBe(`${IDS.board}:ALL:${done?.dataHash}:1`);
    expect(extractPdfText(h.assets.created[0].buffer)).toContain(done?.dataHash.slice(0, 32));
  });

  it("lỗi cuối cùng → FAILED (không lộ dữ liệu), thông báo FAILED, nhả khoá dedupe để xuất lại được", async () => {
    const h = await fixture();
    const { data } = await req(h);
    const failing = new ContributionExportJobService({
      exports: h.exportRepo,
      directory: h.directory,
      context: h.context,
      builder: h.builder,
      pdf: { render: () => Promise.reject(new Error("Nguyễn Văn Ưu điểm 91")) as never },
      assets: new FakeAssets(),
      notifier: h.notifier,
      tx: { run: (fn) => fn({} as never) },
      now: () => h.clock.now,
    });
    await failing.fail(data.exportId, new Error("Nguyễn Văn Ưu điểm 91"));
    const rec = await h.exportRepo.findById(data.exportId);
    expect(rec).toMatchObject({ status: "FAILED", error: "Không tạo được báo cáo", dedupeKey: `failed:${data.exportId}` });
    expect(h.notifier.sent.map((s) => s.type)).toEqual(["contribution.export-failed"]);
    const retry = await req(h);
    expect(retry.data.exportId).not.toBe(data.exportId);
    expect(retry.status).toBe(202);
  });

  it("bảng bị xoá trước khi chạy → ném lỗi (BullMQ retry) rồi FAILED ở lượt cuối", async () => {
    const h = await fixture();
    const { data } = await req(h);
    h.directory.boards.delete(IDS.board);
    await expect(h.exportJobs.run(data.exportId)).rejects.toThrow("Bảng không còn tồn tại");
    await h.exportJobs.fail(data.exportId, new Error("x"));
    expect((await h.exportRepo.findById(data.exportId))?.status).toBe("FAILED");
  });
});

describe("ContributionExportService.get — quyền, hết hạn, tải", () => {
  it("chưa READY + ?download → 409 CONTRIB_006; READY + download → URL ký; không download → không có url", async () => {
    const h = await fixture();
    const { data } = await req(h);
    const queued = await h.exports.get(h.as(IDS.an), data.exportId, { download: false });
    expect(queued).toMatchObject({ status: "QUEUED", periodKey: "ALL" });
    expect(queued.url).toBeUndefined();
    await expect(h.exports.get(h.as(IDS.an), data.exportId, { download: true })).rejects.toMatchObject({ errorCode: "CONTRIB_006", statusCode: 409 });
    await h.exportJobs.run(data.exportId);
    const ready = await h.exports.get(h.as(IDS.binh), data.exportId, { download: true });
    expect(ready.status).toBe("READY");
    expect(ready.url).toMatch(/^https:\/\/files\.test\//);
    expect((await h.exports.get(h.as(IDS.binh), data.exportId, { download: false })).url).toBeUndefined();
  });

  it("người ngoài bảng (kể cả biết exportId) → 404", async () => {
    const h = await fixture();
    const { data } = await req(h);
    await h.exportJobs.run(data.exportId);
    await expect(h.exports.get(h.as(IDS.outsider), data.exportId, { download: true })).rejects.toMatchObject({ statusCode: 404, errorCode: "PERM_404" });
    await expect(h.exports.get(h.as(IDS.an), "0000000000000000000000ff", { download: false })).rejects.toMatchObject({ statusCode: 404 });
  });

  it("sau 30 ngày → 410 CONTRIB_005 (kể cả khi cron chưa kịp đánh dấu EXPIRED); cron dọn: EXPIRED + gỡ link + nhả khoá", async () => {
    const h = await fixture();
    const first = await req(h);
    await h.exportJobs.run(first.data.exportId);
    h.clock.now = new Date(h.clock.now.getTime() + 31 * 86_400_000);
    await expect(h.exports.get(h.as(IDS.an), first.data.exportId, { download: true })).rejects.toMatchObject({ errorCode: "CONTRIB_005", statusCode: 410 });

    expect(await h.exportJobs.expireDue()).toBe(1);
    expect(h.assets.detached).toEqual([first.data.exportId]);
    expect(await h.exportRepo.findById(first.data.exportId)).toMatchObject({ status: "EXPIRED", dedupeKey: `expired:${first.data.exportId}` });
    await expect(h.exports.get(h.as(IDS.an), first.data.exportId, { download: false })).rejects.toMatchObject({ errorCode: "CONTRIB_005" });
    expect(await h.exportJobs.expireDue()).toBe(0); // idempotent

    const renewed = await req(h);
    expect(renewed.status).toBe(202);
    expect(renewed.data.exportId).not.toBe(first.data.exportId);
  });
});

describe("PDF nhiều trang", () => {
  it("nhiều thành viên → sang trang mới, mọi trang đều có chân trang Trang i/n", async () => {
    const h = await fixture();
    const many = Array.from({ length: 40 }, (_, i) => `0000000000000000000d${String(i).padStart(4, "0")}`);
    h.directory.members.set(IDS.ws, [IDS.owner, IDS.an, IDS.binh, IDS.chi, ...many]);
    many.forEach((id, i) => h.directory.users.set(id, { id, name: `Thành viên số ${i + 1}`, avatarUrl: null, membership: "ACTIVE" }));
    const { data } = await req(h);
    await h.exportJobs.run(data.exportId);
    const pdf = h.assets.created[0].buffer;
    const pages = pdfPageCount(pdf);
    expect(pages).toBeGreaterThan(1);
    const footers = extractPdfLines(pdf).filter((l) => l.includes("SHA-256") && l.includes("Trang"));
    expect(footers).toHaveLength(pages);
    expect(footers[pages - 1]).toContain(`Trang ${pages}/${pages}`);
    expect(extractPdfText(pdf)).toContain("Thành viên số 40");
  });

  it("FakeNotifier/FakeAssets được dùng đúng kiểu (kiểm tra harness)", () => {
    expect(new FakeNotifier().sent).toEqual([]);
  });
});
