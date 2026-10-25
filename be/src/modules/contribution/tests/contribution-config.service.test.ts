import { createHarness, IDS, seedDone } from "./support/harness";

const weights = (points: number, onTime: number, peer: number) => ({ points, onTime, peer });

describe("ContributionConfigService — PM2-34 (đổi trọng số minh bạch)", () => {
  it("OWNER đổi 50/30/20: ghi Board.contribution, audit trước/sau, tính lại NGAY, phát board:updated, báo cáo hiện thời điểm + người + trọng số cũ", async () => {
    const h = createHarness();
    await seedDone(h, 1, { assignees: [IDS.an], storyPoints: 5 });
    const before = await h.configService.get(h.as(IDS.an), IDS.board);
    expect(before).toMatchObject({ weights: weights(60, 20, 20), version: 0, isDefault: true, changedAt: null, changedBy: null, previousWeights: null });

    h.clock.now = new Date("2026-09-15T03:32:00Z");
    const after = await h.configService.put(h.as(IDS.owner), IDS.board, { weights: weights(50, 30, 20), expectedVersion: 0 });
    expect(after).toMatchObject({ weights: weights(50, 30, 20), version: 1, isDefault: false, changedAt: "2026-09-15T03:32:00.000Z", changedBy: { id: IDS.owner, name: "Minh" }, previousWeights: weights(60, 20, 20) });
    expect(h.directory.written).toEqual([{ boardId: IDS.board, config: { weights: weights(50, 30, 20), onTimeGraceHours: 0, unestimatedPoints: 1 } }]);

    expect(h.audit.records).toHaveLength(1);
    expect(h.audit.records[0]).toMatchObject({
      actorId: IDS.owner,
      action: "board.contribution-config",
      targetType: "Board",
      targetId: IDS.board,
      workspaceId: IDS.ws,
      metadata: { before: { weights: weights(60, 20, 20) }, after: { weights: weights(50, 30, 20) }, version: 1 },
    });
    expect(JSON.stringify(h.audit.records[0].metadata)).not.toMatch(/score|share|tasks/); // KHÔNG có số liệu thành viên

    expect(h.queue.jobs).toEqual([{ boardId: IDS.board, jobId: `contribution.recompute:board:${IDS.board}:c1`, delayMs: 0 }]);
    expect(h.emitter.events).toEqual([{ boardId: IDS.board, version: 3 }]);

    // Báo cáo ngay sau đổi (job chưa chạy): tính tại chỗ theo công thức mới, kèm "đổi lúc … bởi … (trước …)".
    const report = await h.reports.getReport(h.as(IDS.an), IDS.board, "ALL");
    expect(report.formula).toMatchObject({ weights: weights(50, 30, 20), changedAt: "2026-09-15T03:32:00.000Z", changedBy: { name: "Minh" }, previousWeights: weights(60, 20, 20) });
  });

  it("MEMBER thử đổi → 403 (không ghi gì); người ngoài → 404", async () => {
    const h = createHarness();
    await expect(h.configService.put(h.as(IDS.an), IDS.board, { weights: weights(50, 30, 20), expectedVersion: 0 })).rejects.toMatchObject({ statusCode: 403 });
    await expect(h.configService.put(h.as(IDS.outsider), IDS.board, { weights: weights(50, 30, 20), expectedVersion: 0 })).rejects.toMatchObject({ statusCode: 404 });
    expect(h.directory.written).toHaveLength(0);
    expect(h.audit.records).toHaveLength(0);
  });

  it("gửi 50/30/30 (tổng 110) → 400 CONTRIB_002, không ghi gì", async () => {
    const h = createHarness();
    await expect(h.configService.put(h.as(IDS.owner), IDS.board, { weights: weights(50, 30, 30), expectedVersion: 0 })).rejects.toMatchObject({
      errorCode: "CONTRIB_002",
      statusCode: 400,
      details: { total: 110, expected: 100 },
    });
    expect(h.directory.written).toHaveLength(0);
    expect(h.audit.records).toHaveLength(0);
    expect(h.queue.jobs).toHaveLength(0);
  });

  it("expectedVersion lệch → 409 RES_003 kèm currentVersion; hai người đổi cùng lúc chỉ một thắng", async () => {
    const h = createHarness();
    await h.configService.put(h.as(IDS.owner), IDS.board, { weights: weights(50, 30, 20), expectedVersion: 0 });
    await expect(h.configService.put(h.as(IDS.owner), IDS.board, { weights: weights(40, 30, 30), expectedVersion: 0 })).rejects.toMatchObject({
      errorCode: "RES_003",
      statusCode: 409,
      details: { currentVersion: 1 },
    });
    expect(h.directory.written).toHaveLength(1);
    expect(h.audit.records).toHaveLength(1);
  });

  it("trường vắng (grace/điểm chưa gán) giữ giá trị hiện tại; đặt lại thì áp dụng", async () => {
    const h = createHarness();
    await h.configService.put(h.as(IDS.owner), IDS.board, { weights: weights(60, 20, 20), onTimeGraceHours: 12, unestimatedPoints: 2.5, expectedVersion: 0 });
    const kept = await h.configService.put(h.as(IDS.owner), IDS.board, { weights: weights(40, 30, 30), expectedVersion: 1 });
    expect(kept).toMatchObject({ weights: weights(40, 30, 30), onTimeGraceHours: 12, unestimatedPoints: 2.5, previousWeights: weights(60, 20, 20), version: 2 });
  });

  it("MEMBER đọc được công thức (chỉ đọc)", async () => {
    const h = createHarness();
    const dto = await h.configService.get(h.as(IDS.binh), IDS.board);
    expect(dto.definitions.onTime).toContain("Đúng hạn");
    await expect(h.configService.get(h.as(IDS.outsider), IDS.board)).rejects.toMatchObject({ statusCode: 404 });
  });
});
