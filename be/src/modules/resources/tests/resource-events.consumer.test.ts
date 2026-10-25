/**
 * Consumer `resource.events` (outbox → socket `resource:changed`, p3-01 be.md §6): kiểm handler đăng ký ĐÚNG cặp
 * queue/jobName, payload không có tên tệp, mục phát sinh từ xoá/khôi phục cả thư mục không phát riêng, lỗi emit không
 * làm job thất bại (emit lặp/mất vô hại — client vẫn refetch khi focus).
 */
const mockHandlers = new Map<string, (job: { data: unknown }) => Promise<unknown>>();
jest.mock("../../../infrastructure/queue", () => ({
  registerJob: (queue: string, name: string, fn: (job: { data: unknown }) => Promise<unknown>) => mockHandlers.set(`${queue}/${name}`, fn),
}));
const mockEmitToRoom = jest.fn();
jest.mock("../../../infrastructure/socket/socket.emit", () => ({ emitToRoom: (...args: unknown[]) => mockEmitToRoom(...args) }));
jest.mock("../../../infrastructure/socket", () => ({ ROOM: { workspace: (id: string) => `ws:${id}` } }));

import "../jobs/resource-events.consumer";
import { bulkResourceEvent, folderEvent, resourceEvent } from "../events/resource.events";

const WS = "aaaaaaaaaaaaaaaaaaaaaaaa";
const run = (data: unknown) => (mockHandlers.get("notifications/resource.events") as (job: { data: unknown }) => Promise<unknown>)({ data });

describe("resource.events consumer", () => {
  beforeEach(() => mockEmitToRoom.mockReset());

  it("đăng ký đúng queue notifications / job resource.events", () => {
    expect(mockHandlers.has("notifications/resource.events")).toBe(true);
  });

  it("tệp: phát resource:changed tới ws:{id} với folderId chứa tệp, KHÔNG có tên tệp", async () => {
    const event = resourceEvent("CREATED", { id: "r1", workspaceId: WS, folderId: "f1", version: 1, type: "PDF", size: 10 });
    await run(event.payload);
    expect(mockEmitToRoom).toHaveBeenCalledWith(`ws:${WS}`, "resource:changed", {
      workspaceId: WS,
      folderId: "f1",
      kind: "RESOURCE",
      action: "CREATED",
      subjectId: "r1",
    });
  });

  it("thư mục: folderId = thư mục CHA (danh sách cần làm mới), subjectId = thư mục bị đổi", async () => {
    await run(folderEvent("UPDATED", { id: "f2", workspaceId: WS, parentId: "f1", version: 3 }, { change: "MOVED" }).payload);
    expect(mockEmitToRoom).toHaveBeenCalledWith(`ws:${WS}`, "resource:changed", expect.objectContaining({ kind: "FOLDER", folderId: "f1", subjectId: "f2", action: "UPDATED" }));
    await run(folderEvent("CREATED", { id: "f3", workspaceId: WS, parentId: null, version: 1 }).payload);
    expect(mockEmitToRoom).toHaveBeenLastCalledWith(`ws:${WS}`, "resource:changed", expect.objectContaining({ folderId: null }));
  });

  it("PURGED báo như DELETED; sự kiện via=FOLDER (xoá cả thư mục) không phát riêng", async () => {
    await run(resourceEvent("PURGED", { id: "r1", workspaceId: WS, folderId: null, version: 4, type: "PDF", size: 1 }).payload);
    expect(mockEmitToRoom).toHaveBeenCalledWith(`ws:${WS}`, "resource:changed", expect.objectContaining({ action: "DELETED" }));
    mockEmitToRoom.mockReset();
    await run(bulkResourceEvent("DELETED", WS, { id: "r2", folderId: "f1", version: 2 }).payload);
    expect(mockEmitToRoom).not.toHaveBeenCalled();
  });

  it("emit lỗi (socket chưa khởi tạo) → job vẫn thành công", async () => {
    mockEmitToRoom.mockImplementation(() => {
      throw new Error("Socket.IO chưa khởi tạo");
    });
    await expect(run(resourceEvent("DELETED", { id: "r1", workspaceId: WS, folderId: null, version: 2, type: "PDF", size: 1 }).payload)).resolves.toBeUndefined();
  });

  it("dedupeKey duy nhất theo (loại, id, version); tên sự kiện đúng plan", () => {
    const a = resourceEvent("DELETED", { id: "r1", workspaceId: WS, folderId: null, version: 2, type: "PDF", size: 1 });
    const b = resourceEvent("DELETED", { id: "r1", workspaceId: WS, folderId: null, version: 4, type: "PDF", size: 1 });
    expect(a.dedupeKey).toBe("resource.deleted:resource:r1:v2");
    expect(a.dedupeKey).not.toBe(b.dedupeKey);
    expect([a.type, a.queue, a.jobName]).toEqual(["resource.deleted", "notifications", "resource.events"]);
    expect(folderEvent("DELETED", { id: "f1", workspaceId: WS, parentId: null, version: 2 }).type).toBe("folder.deleted");
  });
});
