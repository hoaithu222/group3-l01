import { LIMITS } from "../limits";
import {
  LABEL_COLOR_TOKENS,
  DEFAULT_BOARD_COLUMNS,
  BOARD_COLUMN_ID_REGEX,
  TASK_ACTIVITY_TYPES,
  PHASE3_NOTIFICATION_TYPES,
} from "../index";
import { ErrorCode, ErrorMessages } from "../../utils/error.codes";
import { ACTIONS, GUEST_HIDDEN_ACTIONS } from "../../permission/actions";

/**
 * D-28 (foundation Phase 3) — khoá lại hình dạng các hằng số dùng chung của p3-01..p3-04 để ba nhánh BE song
 * song không lệch nhau khi một nhánh sửa mà quên nhánh kia (giống `limits.test.ts` của p0-07).
 */
describe("Phase 3 foundation — LIMITS", () => {
  it("resource: khớp p3-01 README §7", () => {
    const r = LIMITS.resource;
    expect(r).toMatchObject({
      folderDepthMax: 8,
      folderNameMax: 120,
      resourceNameMax: 200,
      descriptionMax: 1000,
      tagsMax: 10,
      trashRetentionDays: 30,
      codePreviewMaxBytes: 512 * 1024,
      listCacheSeconds: 60,
    });
    expect(r.workspaceQuotaBytes).toBe(2 * 1024 * 1024 * 1024);
    // 2 GiB vượt Int32 — chính là lý do `Workspace.storageUsedBytes` là Float chứ không Int (D-28 mục 4).
    expect(r.workspaceQuotaBytes).toBeGreaterThan(2 ** 31 - 1);
    expect(r.codeExtensions).toEqual(expect.arrayContaining(["ts", "py", "sql", "md"]));
    expect(new Set(r.codeExtensions).size).toBe(r.codeExtensions.length);
  });

  it("upload.scopeMime.RESOURCE: có markdown + json; KHÔNG có HTML/SVG/executable", () => {
    const mimes: readonly string[] = LIMITS.upload.scopeMime.RESOURCE;
    expect(mimes).toEqual(expect.arrayContaining(["text/markdown", "application/json", "text/csv"]));
    for (const banned of ["text/html", "image/svg+xml", "application/x-msdownload", "application/javascript"]) {
      expect(mimes).not.toContain(banned);
    }
  });

  it("board + task: khớp p3-02/p3-03 README §7", () => {
    expect(LIMITS.board).toMatchObject({
      columnsMax: 12,
      perWorkspaceMax: 20,
      nameMax: 80,
      labelsMax: 50,
      columnTitleMax: 40,
      positionKeyMaxLength: 50,
    });
    expect(LIMITS.task).toMatchObject({
      titleMax: 200,
      perBoardMax: 5000,
      assigneesMax: 10,
      labelsPerTaskMax: 10,
      descriptionMax: 20000,
      checklistMax: 100,
      checklistItemMax: 200,
      attachmentsMax: 10,
      commentMax: 4000,
      commentAttachmentsMax: 5,
      commentEditWindowSeconds: 900,
      dueReminderHoursBefore: 24,
      trashRetentionDays: 30,
      storyPointsMax: 100,
    });
    // p4-04 dùng — không được mất khi foundation viết lại nhóm `task`.
    expect(LIMITS.task.dependenciesMax).toBe(50);
  });

  it("guest + invitation + mention: khớp p3-04 README §7", () => {
    expect(LIMITS.guest).toEqual({
      defaultDays: 30,
      maxDays: 90,
      maxPerWorkspace: 20,
      designatedChannelsMax: 10,
      expiringNoticeHours: 48,
      enabledByDefault: false,
    });
    expect(LIMITS.invitation).toEqual({ expiresDays: 7, perWorkspacePerDayMax: 50, resendCooldownHours: 12 });
    expect(LIMITS.mention.roleMentionsPerHour).toBe(5);
    // Không đè các khoá Phase 1 của cùng nhóm.
    expect(LIMITS.mention.allPerHour).toBe(5);
  });
});

describe("Phase 3 foundation — hằng số dự án", () => {
  it("DEFAULT_BOARD_COLUMNS: 4 cột, đúng 1 DONE, trong trần LIMITS.board.columnsMax", () => {
    expect(DEFAULT_BOARD_COLUMNS).toHaveLength(4);
    expect(DEFAULT_BOARD_COLUMNS.filter((c) => c.kind === "DONE")).toHaveLength(1);
    expect(DEFAULT_BOARD_COLUMNS.length).toBeLessThanOrEqual(LIMITS.board.columnsMax);
    for (const c of DEFAULT_BOARD_COLUMNS) expect(c.title.length).toBeLessThanOrEqual(LIMITS.board.columnTitleMax);
  });

  it("BOARD_COLUMN_ID_REGEX: c_ + 8 ký tự; LABEL_COLOR_TOKENS/TASK_ACTIVITY_TYPES không trùng", () => {
    expect(BOARD_COLUMN_ID_REGEX.test("c_Ab3dE9xZ")).toBe(true);
    expect(BOARD_COLUMN_ID_REGEX.test("c_short")).toBe(false);
    expect(BOARD_COLUMN_ID_REGEX.test("x_Ab3dE9xZ")).toBe(false);
    expect(new Set(LABEL_COLOR_TOKENS).size).toBe(LABEL_COLOR_TOKENS.length);
    expect(new Set(TASK_ACTIVITY_TYPES).size).toBe(TASK_ACTIVITY_TYPES.length);
    // p3-02 tự ghi 4 loại này; p3-03 ghi phần còn lại.
    expect(TASK_ACTIVITY_TYPES).toEqual(expect.arrayContaining(["CREATED", "MOVED", "DELETED", "RESTORED"]));
    // p4-04 thêm phụ thuộc + dời lịch.
    expect(TASK_ACTIVITY_TYPES).toEqual(expect.arrayContaining(["DEPENDENCY_ADDED", "DEPENDENCY_REMOVED", "RESCHEDULED"]));
  });

  it("khoá loại thông báo: duy nhất, dạng chữ thường có dấu chấm, `channel.private-added` giữ khoá p1-03", () => {
    const values = Object.values(PHASE3_NOTIFICATION_TYPES);
    expect(new Set(values).size).toBe(values.length);
    for (const v of values) expect(v).toMatch(/^[a-z]+(\.[a-z-]+)+$/);
    expect(PHASE3_NOTIFICATION_TYPES.PRIVATE_ADDED).toBe("channel.private-added");
  });
});

describe("Phase 3 foundation — mã lỗi (D-28)", () => {
  const P3_CODES = [
    "RSC_001", "RSC_002", "RSC_003", "RSC_004", "RSC_005", "RSC_006", "RSC_007", "RSC_008",
    "TASK_001", "TASK_002", "TASK_003", "TASK_004", "TASK_007", "TASK_008", "TASK_009", "TASK_010",
    "TASK_011", "TASK_012", "TASK_013", "TASK_014", "TASK_015", "TASK_016",
    "INV_008", "INV_009", "INV_010", "INV_011", "WS_017", "WS_018", "WS_019", "CH_013", "CONV_014", "CONV_015",
  ] as const;

  it("mọi mã Phase 3 có trong ErrorCode và có thông điệp tiếng Việt", () => {
    for (const code of P3_CODES) {
      expect(ErrorCode[code]).toBe(code);
      expect(ErrorMessages[code].length).toBeGreaterThan(5);
    }
  });

  it("TASK_005/006/017..021 dành cho p4-04 — nay do p4-04 khai (phụ thuộc/dời lịch), có thông điệp tiếng Việt", () => {
    const codes = ErrorCode as Record<string, string>;
    const messages = ErrorMessages as Record<string, string>;
    for (const reserved of ["TASK_005", "TASK_006", "TASK_017", "TASK_018", "TASK_019", "TASK_020", "TASK_021"]) {
      expect(codes[reserved]).toBe(reserved);
      expect(messages[reserved].length).toBeGreaterThan(5);
    }
  });

  it("mã Phase 1 bị p3-04 trùng số vẫn GIỮ nghĩa cũ (p1-02, p1-03)", () => {
    expect(ErrorMessages.INV_006).toBe("Nhóm đã có quá nhiều lời mời đang hoạt động");
    expect(ErrorMessages.INV_007).toBe("Lời mời không hợp lệ");
    expect(ErrorMessages.WS_010).toBe("Không thể thay đổi vai trò chủ nhóm");
    expect(ErrorMessages.WS_011).toBe("Bạn không đủ quyền thực hiện với thành viên này");
    expect(ErrorMessages.WS_012).toBe("Không thể tự loại hoặc chặn chính mình");
    expect(ErrorMessages.CH_009).toBe("Không thể rời kênh mặc định");
  });
});

describe("Phase 3 foundation — action", () => {
  it("GUEST_HIDDEN_ACTIONS chỉ chứa action có thật trong ACTIONS.WORKSPACE", () => {
    const workspaceActions = new Set<string>(ACTIONS.WORKSPACE);
    for (const a of GUEST_HIDDEN_ACTIONS) expect(workspaceActions.has(a)).toBe(true);
    // Kho tài liệu + board + thẻ: 12 action bị ẩn với khách (foundation) + 5 action p3-04b (danh bạ, mời, tạo kênh/nhóm chat/họp).
    expect(GUEST_HIDDEN_ACTIONS.size).toBe(17);
    for (const a of ["workspace.member.list", "workspace.member.invite", "workspace.channel.create", "workspace.conversation.create", "workspace.meeting.create"] as const) {
      expect(GUEST_HIDDEN_ACTIONS.has(a)).toBe(true);
    }
  });
});
