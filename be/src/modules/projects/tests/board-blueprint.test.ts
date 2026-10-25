import { LIMITS } from "../../../core/constants/limits";
import { LABEL_COLOR_TOKENS } from "../../../core/constants/project";
import type { AuthUser } from "../../../core/types/express";
import { normalizeSearch } from "../../../core/utils/normalize";
import { createBoardFromTemplateSchema, duplicateBoardSchema } from "../dtos";
import type { Board } from "../entities/board.interface";
import { BoardBlueprintService, copyBoardName } from "../services/board-blueprint.service";
import { assembleColumns } from "../services/board-columns.validator";
import { BOARD_TEMPLATES, findBoardTemplate } from "../services/board-templates";
import { defaultBoardReview, parseBoardReview } from "../services/review/review-config.schema";
import { ServiceHarness } from "./support/service-harness";

describe("BOARD_TEMPLATES — bất biến của mẫu dựng sẵn", () => {
  it.each(BOARD_TEMPLATES.map((t) => [t.code, t] as const))("%s: đúng 1 cột DONE, có cột TODO, trong trần cột/nhãn/độ dài, màu hợp lệ, nhãn không trùng", (_code, t) => {
    expect(() => assembleColumns(t.columns, { columnsMax: LIMITS.board.columnsMax })).not.toThrow();
    expect(t.columns.filter((c) => c.kind === "DONE")).toHaveLength(1);
    expect(t.columns.some((c) => c.kind === "TODO")).toBe(true);
    expect(t.columns.every((c) => c.title.length <= LIMITS.board.columnTitleMax)).toBe(true);
    expect(t.name.length).toBeLessThanOrEqual(LIMITS.board.nameMax);
    expect(t.description.length).toBeLessThanOrEqual(1000);
    expect(t.labels.length).toBeLessThanOrEqual(LIMITS.board.labelsMax);
    expect(t.labels.every((l) => (LABEL_COLOR_TOKENS as readonly string[]).includes(l.color) && l.name.length <= 30)).toBe(true);
    expect(new Set(t.labels.map((l) => normalizeSearch(l.name))).size).toBe(t.labels.length);
  });

  it("có đủ hai mẫu 'Đồ án' và 'Scrum nhẹ'; mã duy nhất; findBoardTemplate", () => {
    expect(BOARD_TEMPLATES.map((t) => [t.code, t.name])).toEqual([["COURSE_PROJECT", "Đồ án"], ["LIGHT_SCRUM", "Scrum nhẹ"]]);
    expect(findBoardTemplate("LIGHT_SCRUM").name).toBe("Scrum nhẹ");
  });
});

describe("DTO", () => {
  it("createBoardFromTemplateSchema: mã lạ → lỗi; name/description tuỳ chọn; duplicateBoardSchema: mặc định giữ nhãn + cấu hình chấm", () => {
    expect(createBoardFromTemplateSchema.safeParse({ template: "KHAC" }).success).toBe(false);
    expect(createBoardFromTemplateSchema.safeParse({}).success).toBe(false);
    expect(createBoardFromTemplateSchema.parse({ template: "LIGHT_SCRUM" })).toEqual({ template: "LIGHT_SCRUM" });
    expect(createBoardFromTemplateSchema.safeParse({ template: "LIGHT_SCRUM", name: "x".repeat(81) }).success).toBe(false);
    expect(duplicateBoardSchema.parse({})).toEqual({ includeLabels: true, includeReviewConfig: true });
    expect(duplicateBoardSchema.safeParse({ name: "   " }).success).toBe(false);
  });
});

describe("BoardBlueprintService — mẫu bảng & sao chép bảng (p3-02 P1)", () => {
  let h: ServiceHarness;
  let svc: BoardBlueprintService;
  let owner: AuthUser;
  let admin: AuthUser;
  let member: AuthUser;
  let guest: AuthUser;
  let outsider: AuthUser;

  beforeEach(() => {
    h = new ServiceHarness();
    svc = new BoardBlueprintService({ boards: h.boards, labels: h.labels, access: h.access, creator: h.boardService, tasks: h.tasks, taskCreator: h.taskService });
    owner = h.addUser("OWNER");
    admin = h.addUser("ADMIN");
    member = h.addUser("MEMBER");
    guest = h.addUser("GUEST");
    outsider = { id: "f".repeat(24), email: "x@e.com", name: "N", role: "user", permissions: [] };
  });

  const labelsOf = async (boardId: string) => (await h.labels.listByBoard(boardId)).map((l) => [l.name, l.color]);

  it("templates(): trả đủ mẫu (cột + nhãn), không lộ tham chiếu nội bộ", () => {
    const list = svc.templates();
    expect(list.map((t) => t.code)).toEqual(["COURSE_PROJECT", "LIGHT_SCRUM"]);
    expect(list[0].columns[0]).toEqual({ title: "Ý tưởng", kind: "TODO", wipLimit: null });
    expect(list[1].labels).toContainEqual({ name: "Lỗi", color: "red" });
    list[0].columns.length = 0; // sửa bản trả về không làm hỏng dữ liệu tĩnh
    expect(svc.templates()[0].columns).toHaveLength(5);
  });

  it.each([["COURSE_PROJECT", "Đồ án"], ["LIGHT_SCRUM", "Scrum nhẹ"]] as const)("createFromTemplate(%s): bảng có cột + nhãn của mẫu, tên/mô tả mặc định, cột TODO đầu là cột mặc định của thẻ mới", async (code, name) => {
    const res = await svc.createFromTemplate(admin, h.workspaceId, { template: code });
    const tpl = findBoardTemplate(code);
    expect(res).toMatchObject({ name, description: tpl.description, workspaceId: h.workspaceId, createdBy: admin.id, version: 1 });
    expect(res.columns.map((c) => [c.title, c.kind, c.order])).toEqual(tpl.columns.map((c, i) => [c.title, c.kind, i]));
    expect(res.columns.every((c) => /^c_[A-Za-z0-9]{8}$/.test(c.id))).toBe(true);
    expect(res.labels.map((l) => [l.name, l.color])).toEqual(tpl.labels.map((l) => [l.name, l.color]));
    expect(await labelsOf(res.id)).toHaveLength(tpl.labels.length);
    expect(res.labels.every((l) => l.boardId === res.id)).toBe(true);

    // Dùng được ngay: tạo thẻ mới rơi vào cột TODO đầu của mẫu.
    const stored = (await h.boards.findById(res.id)) as Board;
    const task = await h.addTask(admin, stored, "Việc đầu tiên");
    expect(task.columnId).toBe(res.columns[0].id);
  });

  it("createFromTemplate: name/description của người dùng thắng mặc định; MEMBER → 403; GUEST/người ngoài → 404; đủ số bảng → TASK_009", async () => {
    const res = await svc.createFromTemplate(owner, h.workspaceId, { template: "LIGHT_SCRUM", name: "Sprint 1", description: "Nhóm A" });
    expect(res).toMatchObject({ name: "Sprint 1", description: "Nhóm A" });
    await expect(svc.createFromTemplate(member, h.workspaceId, { template: "LIGHT_SCRUM" })).rejects.toMatchObject({ statusCode: 403 });
    await expect(svc.createFromTemplate(guest, h.workspaceId, { template: "LIGHT_SCRUM" })).rejects.toMatchObject({ statusCode: 404 });
    await expect(svc.createFromTemplate(outsider, h.workspaceId, { template: "LIGHT_SCRUM" })).rejects.toMatchObject({ statusCode: 404 });
    h.config = { ...h.config, perWorkspaceMax: 1 };
    await expect(svc.createFromTemplate(owner, h.workspaceId, { template: "COURSE_PROJECT" })).rejects.toMatchObject({ statusCode: 409, errorCode: "TASK_009" });
  });

  describe("duplicate", () => {
    async function source(): Promise<Board> {
      const b = await h.createBoard(owner);
      await h.boardService.patch(owner, b.id, { description: "Mô tả gốc", expectedVersion: b.version });
      const cols = ((await h.boards.findById(b.id)) as Board).columns.map((c) => ({ id: c.id, title: c.title, kind: c.kind, wipLimit: c.kind === "IN_PROGRESS" ? 3 : null }));
      await h.boardService.putColumns(owner, b.id, { columns: cols, expectedVersion: ((await h.boards.findById(b.id)) as Board).version });
      await h.labels.create({ boardId: b.id, workspaceId: h.workspaceId, name: "Gấp", normalizedName: "gap", color: "red" });
      await h.labels.create({ boardId: b.id, workspaceId: h.workspaceId, name: "Chậm", normalizedName: "cham", color: "gray" });
      await h.addTask(owner, (await h.boards.findById(b.id)) as Board, "Thẻ của bảng gốc");
      return (await h.boards.findById(b.id)) as Board;
    }

    it("sao chép cấu trúc: cột (id MỚI, cùng tên/loại/thứ tự/WIP), nhãn (id mới), mô tả; tên mặc định '(bản sao)'; KHÔNG sao chép thẻ; bảng gốc không đổi", async () => {
      const src = await source();
      const res = await svc.duplicate(admin, src.id, { includeLabels: true, includeReviewConfig: true });

      expect(res).toMatchObject({ name: `${src.name} (bản sao)`, description: "Mô tả gốc", workspaceId: src.workspaceId, createdBy: admin.id });
      expect(res.id).not.toBe(src.id);
      expect(res.columns.map((c) => [c.title, c.kind, c.order, c.wipLimit])).toEqual(src.columns.map((c) => [c.title, c.kind, c.order, c.kind === "IN_PROGRESS" ? 3 : null]));
      expect(res.columns.some((c) => src.columns.some((s) => s.id === c.id))).toBe(false);
      expect(res.labels.map((l) => [l.name, l.color])).toEqual([["Gấp", "red"], ["Chậm", "gray"]]);
      expect((await h.labels.listByBoard(src.id)).map((l) => l.id).some((id) => res.labels.some((l) => l.id === id))).toBe(false);
      expect([...h.tasks.tasks.values()].filter((t) => t.boardId === res.id)).toHaveLength(0);
      expect([...h.tasks.tasks.values()].filter((t) => t.boardId === src.id)).toHaveLength(1);
      expect(((await h.boards.findById(src.id)) as Board).version).toBe(src.version);
    });

    it("cấu hình chấm chéo: mặc định sao chép nguyên (enabled, rubric, số lượt duyệt, autoComplete); includeReviewConfig=false → bảng mới theo mặc định hệ thống", async () => {
      const src = await source();
      const rubric = [{ id: "r_AbCdEf", label: "Đúng yêu cầu", description: null, maxScore: 10 }];
      h.boards.boards.get(src.id)!.review = { ...defaultBoardReview(3, true), rubric, autoCompleteOnApproval: true };

      const copied = await svc.duplicate(admin, src.id, { includeLabels: false, includeReviewConfig: true });
      const stored = (await h.boards.findById(copied.id)) as Board;
      expect(stored.review).toMatchObject({ enabled: true, requiredReviews: 3, autoCompleteOnApproval: true, rubric });
      expect(copied.labels).toEqual([]); // includeLabels=false
      expect(copied.version).toBe(2); // đã tính lần ghi cấu hình

      const plain = await svc.duplicate(admin, src.id, { includeLabels: true, includeReviewConfig: false });
      expect(parseBoardReview(((await h.boards.findById(plain.id)) as Board).review).enabled).toBe(false);
    });

    it("bảng gốc chưa cấu hình chấm chéo (review null) → bản sao không ép cấu hình; tên tuỳ chọn thắng mặc định", async () => {
      const src = await source();
      const res = await svc.duplicate(owner, src.id, { name: "Bản làm lại", includeLabels: true, includeReviewConfig: true });
      expect(res.name).toBe("Bản làm lại");
      expect(parseBoardReview(((await h.boards.findById(res.id)) as Board).review).enabled).toBe(false);
    });

    it("bảng gốc đã LƯU TRỮ vẫn sao chép được (bản sao là bảng đang hoạt động); tên gốc dài được cắt vừa trần", async () => {
      const src = await source();
      h.boards.boards.get(src.id)!.name = "x".repeat(LIMITS.board.nameMax);
      h.boards.boards.get(src.id)!.archivedAt = new Date();
      const res = await svc.duplicate(admin, src.id, { includeLabels: true, includeReviewConfig: true });
      expect(res.archivedAt).toBeNull();
      expect(res.name.length).toBe(LIMITS.board.nameMax);
      expect(res.name.endsWith(" (bản sao)")).toBe(true);
      expect(copyBoardName("Ngắn")).toBe("Ngắn (bản sao)");
    });

    it("quyền: MEMBER đọc được bảng nhưng không tạo bảng → 403; GUEST/người ngoài → 404; đủ số bảng → TASK_009 (không tạo gì)", async () => {
      const src = await source();
      await expect(svc.duplicate(member, src.id, { includeLabels: true, includeReviewConfig: true })).rejects.toMatchObject({ statusCode: 403 });
      await expect(svc.duplicate(guest, src.id, { includeLabels: true, includeReviewConfig: true })).rejects.toMatchObject({ statusCode: 404 });
      await expect(svc.duplicate(outsider, src.id, { includeLabels: true, includeReviewConfig: true })).rejects.toMatchObject({ statusCode: 404 });
      await expect(svc.duplicate(owner, "0".repeat(24), { includeLabels: true, includeReviewConfig: true })).rejects.toMatchObject({ statusCode: 404 });
      h.config = { ...h.config, perWorkspaceMax: h.boards.boards.size };
      await expect(svc.duplicate(owner, src.id, { includeLabels: true, includeReviewConfig: true })).rejects.toMatchObject({ statusCode: 409, errorCode: "TASK_009" });
      expect(h.boards.boards.size).toBe(1);
    });

    describe("includeTasks — sao chép thẻ chưa hoàn thành (đi đúng đường TaskService.create)", () => {
      const titlesIn = (boardId: string, columnId: string) =>
        [...h.tasks.tasks.values()]
          .filter((t) => t.boardId === boardId && t.columnId === columnId && !t.deletedAt)
          .sort((a, b) => (a.position < b.position ? -1 : 1))
          .map((t) => t.title);

      it("thẻ sang cột tương ứng của bản sao (giữ thứ tự), nhãn theo tên, mô tả/điểm/hạn, checklist bỏ tick, KHÔNG người làm; thẻ ở DONE bị bỏ; bảng gốc không đổi", async () => {
        const src = await source(); // 1 thẻ "Thẻ của bảng gốc" ở cột TODO đầu
        const [todo, doing] = [h.columnId(src, "TODO"), h.columnId(src, "IN_PROGRESS")];
        const gap = (await h.labels.listByBoard(src.id)).find((l) => l.name === "Gấp")!;
        const t2 = await h.addTask(owner, src, "Thẻ 2", { columnId: todo });
        h.setTask(t2.id, {
          labelIds: [gap.id],
          assigneeIds: [member.id],
          description: "Mô tả thẻ 2",
          storyPoints: 3,
          dueDate: new Date("2026-10-01T00:00:00Z"),
          checklist: [{ id: "a".repeat(24), text: "Việc con", done: true, doneBy: member.id, doneAt: new Date(), order: 1 }],
        });
        await h.addTask(owner, src, "Thẻ 3", { columnId: doing });
        await h.addTask(owner, src, "Đã xong", { columnId: h.columnId(src, "DONE") });

        const res = await svc.duplicate(admin, src.id, { includeLabels: true, includeReviewConfig: true, includeTasks: true });
        expect([res.copiedTasks, res.tasksTruncated]).toEqual([3, false]);

        const srcCols = [...src.columns].sort((a, b) => a.order - b.order);
        const dstCols = [...res.columns].sort((a, b) => a.order - b.order);
        const dst = (kind: string) => dstCols[srcCols.findIndex((c) => c.kind === kind)]!.id;
        expect(titlesIn(res.id, dst("TODO"))).toEqual(["Thẻ của bảng gốc", "Thẻ 2"]);
        expect(titlesIn(res.id, dst("IN_PROGRESS"))).toEqual(["Thẻ 3"]);
        expect(titlesIn(res.id, dst("DONE"))).toEqual([]);

        const copy = [...h.tasks.tasks.values()].find((t) => t.boardId === res.id && t.title === "Thẻ 2")!;
        expect(copy.labelIds).toEqual([res.labels.find((l) => l.name === "Gấp")!.id]);
        expect(copy).toMatchObject({ assigneeIds: [], description: "Mô tả thẻ 2", storyPoints: 3, commentCount: 0, attachmentCount: 0, completedAt: null });
        expect(copy.dueDate?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
        expect(copy.checklist).toHaveLength(1);
        expect(copy.checklist[0]).toMatchObject({ text: "Việc con", done: false, doneBy: null, doneAt: null });
        expect(copy.checklist[0]!.id).not.toBe("a".repeat(24));
        expect(copy.checklistTotal).toBe(1);

        // Bảng gốc giữ nguyên 4 thẻ.
        expect([...h.tasks.tasks.values()].filter((t) => t.boardId === src.id)).toHaveLength(4);
      });

      it("includeLabels=false: thẻ sao chép mất nhãn (không có nhãn bản sao để ánh xạ)", async () => {
        const src = await source();
        const gap = (await h.labels.listByBoard(src.id)).find((l) => l.name === "Gấp")!;
        const t = await h.addTask(owner, src, "Có nhãn");
        h.setTask(t.id, { labelIds: [gap.id] });

        const res = await svc.duplicate(admin, src.id, { includeLabels: false, includeReviewConfig: true, includeTasks: true });
        expect(res.copiedTasks).toBe(2);
        const copies = [...h.tasks.tasks.values()].filter((x) => x.boardId === res.id);
        expect(copies.every((x) => x.labelIds.length === 0)).toBe(true);
      });

      it("không bật includeTasks → không có thẻ và không có copiedTasks/tasksTruncated trong kết quả", async () => {
        const src = await source();
        const res = await svc.duplicate(admin, src.id, { includeLabels: true, includeReviewConfig: true });
        expect(res.copiedTasks).toBeUndefined();
        expect(res.tasksTruncated).toBeUndefined();
        expect([...h.tasks.tasks.values()].filter((t) => t.boardId === res.id)).toHaveLength(0);
      });

      it(`chạm trần ${LIMITS.board.duplicateTasksMax} thẻ → copiedTasks = trần, tasksTruncated = true (thẻ còn lại bỏ qua, bảng vẫn hợp lệ)`, async () => {
        const src = await source(); // 1 thẻ sẵn
        for (let i = 0; i < LIMITS.board.duplicateTasksMax + 5; i += 1) await h.addTask(owner, src, `Thẻ ${i}`);
        const res = await svc.duplicate(admin, src.id, { includeLabels: true, includeReviewConfig: true, includeTasks: true });
        expect([res.copiedTasks, res.tasksTruncated]).toEqual([LIMITS.board.duplicateTasksMax, true]);
        expect([...h.tasks.tasks.values()].filter((t) => t.boardId === res.id)).toHaveLength(LIMITS.board.duplicateTasksMax);
      });
    });
  });
});
