// Unit-test redis mock mặc định (`setup.ts`) thiếu `incr/expire` mà `permissionService.bumpVersion` (archive) cần.
jest.mock("../../../infrastructure/redis", () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn(), incr: jest.fn(), expire: jest.fn(), ping: jest.fn() },
}));

import { LIMITS } from "../../../core/constants/limits";
import { AppError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import { newObjectId } from "../../../core/utils/object-id";
import type { Board } from "../entities/board.interface";
import type { Task } from "../entities/task.interface";
import type { AttachableAsset } from "../services/task-asset.port";
import { ServiceHarness } from "./support/service-harness";

let h: ServiceHarness;
let owner: AuthUser;
let admin: AuthUser;
let member: AuthUser;
let other: AuthUser;
let guest: AuthUser;
let board: Board;
let task: Task;

beforeEach(async () => {
  h = new ServiceHarness();
  owner = h.addUser("OWNER");
  admin = h.addUser("ADMIN");
  member = h.addUser("MEMBER");
  other = h.addUser("MEMBER");
  guest = h.addUser("GUEST");
  board = await h.createBoard(owner);
  task = await h.addTask(member, board, "Thẻ đính kèm");
});

const catchError = async (p: Promise<unknown>): Promise<AppError> => {
  try {
    await p;
  } catch (err) {
    return err as AppError;
  }
  throw new Error("Đáng lẽ phải ném lỗi");
};
const fresh = async () => (await h.tasks.findById(task.id)) as Task;
let n = 0;
const seed = (owner_: AuthUser, over: Partial<AttachableAsset> = {}) => {
  const id = (++n).toString(16).padStart(24, "0");
  h.assets.seed(id, { ownerId: owner_.id, scope: "TASK", workspaceId: task.workspaceId, ...over });
  return id;
};

describe("task-attachment.service", () => {
  it("gắn asset READY của mình: AssetLink TASK (scope WORKSPACE), attachmentCount +1, version +1, ATTACHMENT_ADDED, task:updated {attachments}", async () => {
    const assetId = seed(member, { originalName: "bao-cao.pdf" });
    const res = await h.attachmentService.attach(member, task.id, { assetId });

    expect(res.attachmentCount).toBe(1);
    expect(res.attachment).toMatchObject({ assetId, originalName: "bao-cao.pdf", attachedBy: member.id, thumbnailUrl: null });
    expect(await fresh()).toMatchObject({ attachmentCount: 1, version: task.version + 1 });
    expect(h.assets.attached).toMatchObject([{ assetId, targetType: "TASK", targetId: task.id }]);
    expect(h.activities.activities.at(-1)).toMatchObject({ type: "ATTACHMENT_ADDED", after: { assetId, name: "bao-cao.pdf" } });
    expect(h.emitter.of("task:updated").at(-1)?.payload).toMatchObject({ changed: ["attachments", "attachmentCount"] });

    const list = await h.attachmentService.list(other, task.id);
    expect(list.map((a) => a.assetId)).toEqual([assetId]);
  });

  it("TASK_004 (400): asset không tồn tại / chưa READY / của người khác / sai scope / sai nhóm / đã gắn nơi khác", async () => {
    const bad = [
      newObjectId(),
      seed(member, { status: "PROCESSING" }),
      seed(other),
      seed(member, { scope: "MESSAGE" }),
      seed(member, { workspaceId: newObjectId() }),
      seed(member, { variant: "THUMB" }),
    ];
    for (const assetId of bad) {
      const err = await catchError(h.attachmentService.attach(member, task.id, { assetId }));
      expect([err.statusCode, err.errorCode]).toEqual([400, "TASK_004"]);
    }
    const used = seed(member);
    await h.attachmentService.attach(member, task.id, { assetId: used });
    const t2 = await h.addTask(member, board, "Thẻ khác");
    expect((await catchError(h.attachmentService.attach(member, t2.id, { assetId: used }))).errorCode).toBe("TASK_004");
    expect(await fresh()).toMatchObject({ attachmentCount: 1 });
  });

  it("TASK_012 (409): thẻ đã đủ 10 tệp", async () => {
    for (let i = 0; i < LIMITS.task.attachmentsMax; i++) await h.attachmentService.attach(member, task.id, { assetId: seed(member) });
    const err = await catchError(h.attachmentService.attach(member, task.id, { assetId: seed(member) }));
    expect([err.statusCode, err.errorCode]).toEqual([409, "TASK_012"]);
    expect(await fresh()).toMatchObject({ attachmentCount: LIMITS.task.attachmentsMax });
  });

  it("gỡ: người gắn hoặc OWNER/ADMIN; MEMBER khác → 403; gỡ giảm đếm, gỡ AssetLink, ATTACHMENT_REMOVED; GUEST/không có link → 404", async () => {
    const mine = seed(member);
    const theirs = seed(other);
    await h.attachmentService.attach(member, task.id, { assetId: mine });
    await h.attachmentService.attach(other, task.id, { assetId: theirs });

    expect((await catchError(h.attachmentService.detach(other, task.id, mine))).statusCode).toBe(403);
    expect((await catchError(h.attachmentService.detach(guest, task.id, mine))).statusCode).toBe(404);
    expect((await catchError(h.attachmentService.detach(member, task.id, newObjectId()))).statusCode).toBe(404);

    await h.attachmentService.detach(member, task.id, mine); // người gắn
    await h.attachmentService.detach(admin, task.id, theirs); // ADMIN gỡ tệp người khác
    expect(await fresh()).toMatchObject({ attachmentCount: 0 });
    expect(h.assets.attached).toHaveLength(0);
    expect(h.activities.activities.filter((a) => a.type === "ATTACHMENT_REMOVED").map((a) => a.before)).toEqual([
      { assetId: mine, name: expect.any(String) }, { assetId: theirs, name: expect.any(String) },
    ]);
  });

  it("GUEST/người ngoài không đọc được danh sách (404); bảng đã lưu trữ → gắn/gỡ bị 403", async () => {
    const assetId = seed(member);
    await h.attachmentService.attach(member, task.id, { assetId });
    expect((await catchError(h.attachmentService.list(guest, task.id))).statusCode).toBe(404);
    await h.boardService.archive(owner, board.id);
    expect((await catchError(h.attachmentService.detach(member, task.id, assetId))).statusCode).toBe(403);
    expect((await catchError(h.attachmentService.attach(member, task.id, { assetId: seed(member) }))).statusCode).toBe(403);
    expect((await h.attachmentService.list(member, task.id)).length).toBe(1); // vẫn xem được
  });
});
