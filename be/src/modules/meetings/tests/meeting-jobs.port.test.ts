/**
 * Unit — `QueueMeetingJobs` (adapter BullMQ của cổng `MeetingJobsPort`, be.md §7/§10 "meeting-reminders"): jobId AN TOÀN với BullMQ, độ trễ nhắc
 * tính từ `startAt − mốc`, bỏ mốc đã qua, thêm lần hai không nhân đôi, huỷ đúng job cũ khi dời giờ, lệnh xếp job có thời hạn khi Redis treo.
 * Queue thay bằng bản giả mô phỏng đúng các luật BullMQ liên quan (jobId trùng bị bỏ qua; `:` chỉ hợp lệ khi đúng 3 đoạn) — KHÔNG cần Redis.
 */
interface FakeJob {
  queue: string;
  name: string;
  jobId: string;
  data: unknown;
  opts: { delay?: number; attempts?: number; backoff?: unknown };
}
const mockQueue = new Map<string, FakeJob>();
const mockState = { hangEnqueue: false };

/** Luật BullMQ (5.x): jobId tuỳ biến không phải số nguyên thuần và, nếu có `:`, phải đúng 3 đoạn. */
function assertBullMqSafe(jobId: string): void {
  if (`${parseInt(jobId, 10)}` === jobId) throw new Error(`Custom Id cannot be integers: ${jobId}`);
  if (jobId.includes(":") && jobId.split(":").length !== 3) throw new Error(`Custom Id cannot contain :: ${jobId}`);
}

jest.mock("../../../infrastructure/queue", () => ({
  toSafeJobId: (id: string) => id.replace(/:/g, "_"),
  enqueue: (q: string, name: string, data: unknown, opts: FakeJob["opts"] & { jobId: string }) => {
    if (mockState.hangEnqueue) return new Promise<void>(() => undefined); // Redis treo: không bao giờ trả lời
    assertBullMqSafe(opts.jobId);
    if (!mockQueue.has(opts.jobId)) mockQueue.set(opts.jobId, { queue: q, name, jobId: opts.jobId, data, opts });
    return Promise.resolve();
  },
  scheduleAt: (q: string, name: string, jobId: string, data: unknown, runAt: Date) => {
    assertBullMqSafe(jobId);
    if (!mockQueue.has(jobId)) mockQueue.set(jobId, { queue: q, name, jobId, data, opts: { delay: Math.max(0, runAt.getTime() - Date.now()) } });
    return Promise.resolve();
  },
  cancelJob: (_q: string, jobId: string) => {
    mockQueue.delete(jobId);
    return Promise.resolve();
  },
}));

import { QueueMeetingJobs, reminderJobId } from "../services/meeting-jobs.port";

const MEETING = "665f1f77bcf86cd799439011";
const jobs = (): FakeJob[] => [...mockQueue.values()];
const minutesFromNow = (m: number): Date => new Date(Date.now() + m * 60_000);

describe("QueueMeetingJobs — nhắc họp (delayed job)", () => {
  const port = new QueueMeetingJobs();
  beforeEach(() => mockQueue.clear());

  it("jobId nhắc = (cuộc họp, mốc phút, giây bắt đầu), không còn dấu ':' và hợp lệ với BullMQ", () => {
    const id = reminderJobId(MEETING, 15, new Date("2026-10-01T02:00:00Z"));
    expect(id).toBe(`meeting.reminder_meeting_${MEETING}_15_s${Date.parse("2026-10-01T02:00:00Z") / 1000}`);
    expect(() => assertBullMqSafe(id)).not.toThrow();
    expect(reminderJobId(MEETING, 15, new Date("2026-10-01T02:00:00Z"))).toBe(id); // tất định
    expect(reminderJobId(MEETING, 30, new Date("2026-10-01T02:00:00Z"))).not.toBe(id);
    expect(reminderJobId(MEETING, 15, new Date("2026-10-01T02:30:00Z"))).not.toBe(id);
  });

  it("đặt nhắc: queue notifications, delay = startAt − mốc − now, payload đủ để processor kiểm lại; mốc đã qua bị bỏ", async () => {
    const startAt = minutesFromNow(120);
    await port.scheduleReminder({ meetingId: MEETING, minutes: 15, startAt });
    await port.scheduleReminder({ meetingId: MEETING, minutes: 60, startAt });
    await port.scheduleReminder({ meetingId: MEETING, minutes: 180, startAt }); // đã qua (họp sau 120 phút, nhắc trước 180)
    expect(jobs()).toHaveLength(2);
    const fifteen = jobs().find((j) => j.jobId === reminderJobId(MEETING, 15, startAt))!;
    expect(fifteen).toMatchObject({ queue: "notifications", name: "meeting.reminder", data: { meetingId: MEETING, minutes: 15, startAtMs: startAt.getTime() } });
    expect(Math.abs(fifteen.opts.delay! - 105 * 60_000)).toBeLessThan(2000);
    const sixty = jobs().find((j) => j.jobId === reminderJobId(MEETING, 60, startAt))!;
    expect(Math.abs(sixty.opts.delay! - 60 * 60_000)).toBeLessThan(2000);
  });

  it("đặt lại cùng (mốc, giờ) không nhân đôi job (BullMQ bỏ qua jobId trùng)", async () => {
    const startAt = minutesFromNow(90);
    for (let i = 0; i < 3; i += 1) await port.scheduleReminder({ meetingId: MEETING, minutes: 15, startAt });
    expect(jobs()).toHaveLength(1);
  });

  it("dời giờ: huỷ đúng job của giờ CŨ rồi đặt job của giờ MỚI — id khác nhau nên job cũ nếu còn chạy vẫn nhận ra lệch startAt", async () => {
    const oldStart = minutesFromNow(90);
    const newStart = new Date(oldStart.getTime() + 30 * 60_000);
    await port.scheduleReminder({ meetingId: MEETING, minutes: 15, startAt: oldStart });
    await port.cancelReminder({ meetingId: MEETING, minutes: 15, startAt: oldStart });
    await port.scheduleReminder({ meetingId: MEETING, minutes: 15, startAt: newStart });
    expect(jobs().map((j) => j.jobId)).toEqual([reminderJobId(MEETING, 15, newStart)]);
    expect((jobs()[0]!.data as { startAtMs: number }).startAtMs).toBe(newStart.getTime());
  });

  it("huỷ job không tồn tại là vô hại", async () => {
    await expect(port.cancelReminder({ meetingId: MEETING, minutes: 15, startAt: minutesFromNow(60) })).resolves.toBeUndefined();
  });
});

describe("QueueMeetingJobs — email .ics và đồng bộ nhóm chat", () => {
  const port = new QueueMeetingJobs();
  beforeEach(() => mockQueue.clear());

  it("ics-send: jobId theo (cuộc họp, sequence, người, loại) hợp lệ với BullMQ; retry 5 lần backoff mũ; gửi lại cùng bộ không nhân đôi", async () => {
    const job = { meetingId: MEETING, userId: "665f1f77bcf86cd799439022", kind: "REQUEST" as const, sequence: 2, updated: true };
    await port.enqueueIcsSend(job);
    await port.enqueueIcsSend(job);
    await port.enqueueIcsSend({ ...job, kind: "CANCEL" });
    await port.enqueueIcsSend({ ...job, sequence: 3 });
    expect(jobs()).toHaveLength(3);
    const first = jobs()[0]!;
    expect(first).toMatchObject({ queue: "notifications", name: "meeting.ics-send", data: job, opts: { attempts: 5, backoff: { type: "exponential", delay: 10_000 } } });
    expect(first.jobId).toBe(`meeting.ics-send_meeting_${MEETING}_v2_${job.userId}_REQUEST`);
    for (const j of jobs()) expect(() => assertBullMqSafe(j.jobId)).not.toThrow();
  });

  it("conversation-sync: bản archive có jobId khác bản thường (huỷ họp không bị nuốt bởi job đồng bộ cùng version)", async () => {
    await port.enqueueConversationSync({ meetingId: MEETING, version: 4 });
    await port.enqueueConversationSync({ meetingId: MEETING, version: 4, archive: true });
    await port.enqueueConversationSync({ meetingId: MEETING, version: 4, archive: true });
    expect(jobs().map((j) => j.jobId).sort()).toEqual([`meeting.conversation-sync_meeting_${MEETING}_v4`, `meeting.conversation-sync_meeting_${MEETING}_v4_archive`].sort());
    expect(jobs().find((j) => j.jobId.endsWith("_archive"))!.data).toEqual({ meetingId: MEETING, version: 4, archive: true });
  });
});

describe("QueueMeetingJobs — Redis treo", () => {
  afterEach(() => {
    jest.useRealTimers();
    mockState.hangEnqueue = false;
  });

  it("lệnh xếp job có thời hạn 2 s: queue không trả lời → reject 'quá hạn' thay vì treo request", async () => {
    jest.useFakeTimers();
    mockState.hangEnqueue = true;
    const pending = new QueueMeetingJobs().enqueueConversationSync({ meetingId: MEETING, version: 1 });
    const assertion = expect(pending).rejects.toThrow("quá hạn");
    await jest.advanceTimersByTimeAsync(2001);
    await assertion;
  });
});
