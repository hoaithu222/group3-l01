import { clearTaskEventSinks, dispatchTaskEvent, registerTaskEventSink } from "../events/task-event-sinks";
import { assignedEvent, completedEvent, createdEvent, dueChangedEvent, reopenedEvent } from "../events/task-event.factory";
import { TASK_EVENTS, toOutboxEvent, type TaskEventPayload } from "../events/project-events";
import type { Task } from "../entities/task.interface";

const task = (over: Partial<Task> = {}): Task => ({
  id: "t".repeat(24), boardId: "b".repeat(24), workspaceId: "w".repeat(24), columnId: "c_aaaaaaaa", columnKind: "TODO",
  position: "a0", title: "TIÊU ĐỀ RIÊNG TƯ", normalizedTitle: "tieu de", description: "MÔ TẢ RIÊNG TƯ", assigneeIds: ["u1", "u2"], labelIds: [],
  startDate: null, dueDate: null, storyPoints: 3, checklist: [], checklistDone: 0, checklistTotal: 0, attachmentCount: 0, commentCount: 0,
  reviewState: "NONE", completedAt: null, completionCount: 0, createdBy: "u1", clientTaskId: null, dueVersion: 0,
  deletedFromColumnId: null, deletedAt: null, deletedBy: null, version: 1,
  createdAt: new Date("2026-09-01T00:00:00Z"), updatedAt: new Date("2026-09-01T00:00:00Z"), ...over,
});

describe("sự kiện Task (payload, dedupeKey)", () => {
  it("task.completed: đủ trường cho p4-03/p4-06/p6-06 (taskCreatedAt, labelNames, review), onTime đúng ranh giới hạn chót", () => {
    const due = new Date("2026-09-10T12:00:00Z");
    const done = (completedAt: Date) => completedEvent(task({ completedAt, completionCount: 3, dueDate: due }), "u1", ["ReactJS"]).payload;

    expect(done(new Date("2026-09-10T12:00:00Z"))).toMatchObject({
      event: "task.completed", completionCount: 3, onTime: true, storyPoints: 3, labelNames: ["ReactJS"],
      taskCreatedAt: "2026-09-01T00:00:00.000Z", assigneeIds: ["u1", "u2"], review: { enabled: false, approved: false },
    });
    expect(done(new Date("2026-09-10T12:00:00.001Z")).onTime).toBe(false);
    expect(completedEvent(task({ completedAt: due, completionCount: 1 }), "u1", []).payload.onTime).toBe(false); // không có hạn
    expect(completedEvent(task({ completedAt: due, completionCount: 1 }), "u1", []).dedupeKey).toBe(`task.completed:task:${"t".repeat(24)}:c1`);
  });

  it("metadata review do policy cấp thay mặc định", () => {
    const evt = completedEvent(task({ completedAt: new Date(), completionCount: 1 }), "u1", [], { enabled: true, approved: true, roundId: "r9" });
    expect(evt.payload.review).toEqual({ enabled: true, approved: true, roundId: "r9" });
  });

  it("KHÔNG sự kiện nào chứa tiêu đề/mô tả thẻ", () => {
    const t = task({ dueDate: new Date(), completedAt: new Date(), completionCount: 1 });
    const all = [createdEvent(t, "u1"), assignedEvent(t, "u1", "create"), dueChangedEvent({ ...t, dueVersion: 2 }, "u1", null), completedEvent(t, "u1", []), reopenedEvent(t, "u1", new Date())];
    for (const e of all) expect(JSON.stringify(e)).not.toMatch(/RIÊNG TƯ/);
  });

  it("assigned loại người thực hiện; dueChanged/reopened đúng dedupeKey; toOutboxEvent định tuyến notifications/task.events", () => {
    expect(assignedEvent(task({ assigneeIds: ["u1"] }), "u1", "create")).toBeNull();
    expect(assignedEvent(task(), "u1", "create")?.payload.assigneeIds).toEqual(["u2"]);
    expect(dueChangedEvent(task({ dueVersion: 4, dueDate: new Date() }), "u1", null).dedupeKey).toBe(`task.due-changed:task:${"t".repeat(24)}:d4`);
    const reopened = reopenedEvent(task({ completionCount: 2 }), "u1", new Date());
    expect(reopened.dedupeKey).toBe(`task.reopened:task:${"t".repeat(24)}:c2`);

    const row = toOutboxEvent(reopened.payload, reopened.dedupeKey);
    expect(row).toMatchObject({ type: TASK_EVENTS.REOPENED, aggregateType: "Task", queue: "notifications", jobName: "task.events" });
  });
});

describe("task.events — sink (điểm cắm cho p3-03/p4)", () => {
  const payload = { event: TASK_EVENTS.COMPLETED, taskId: "t1" } as unknown as TaskEventPayload;
  afterEach(() => clearTaskEventSinks());

  it("chưa có sink → không lỗi; có sink → mọi sink đều được gọi với payload + jobId", async () => {
    await expect(dispatchTaskEvent(payload, "job-1")).resolves.toBeUndefined();
    const calls: string[] = [];
    registerTaskEventSink("xp", async (p, jobId) => void calls.push(`xp:${p.taskId}:${jobId}`));
    registerTaskEventSink("contribution", async () => void calls.push("contribution"));
    await dispatchTaskEvent(payload, "job-2");
    expect(calls).toEqual(["xp:t1:job-2", "contribution"]);
  });

  it("một sink lỗi vẫn chạy hết sink còn lại rồi ném lỗi gộp để BullMQ retry", async () => {
    const ran: string[] = [];
    registerTaskEventSink("boom", async () => {
      throw new Error("x");
    });
    registerTaskEventSink("ok", async () => void ran.push("ok"));
    await expect(dispatchTaskEvent(payload, "job-3")).rejects.toThrow(/sink lỗi: boom/);
    expect(ran).toEqual(["ok"]);
  });
});
