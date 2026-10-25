import { installMocks, redisStore } from "./meetings-test-mocks";
import { buildMeetingsApp, cleanupWorld, ensureMeetingIndexes, idemKey, installHarness, makeApi, meetingBody, seedWorld, slot, type World } from "./meetings-test-kit";
import { resetRuntimeConfig } from "../../../../core/config/runtime-config";
import { prisma } from "../../../../infrastructure/database";

const app = buildMeetingsApp();
const api = makeApi(app);

/** `limits.meeting` do admin chỉnh (SystemConfig) — đọc qua container thật (`runtimeConfig.getEffective`), snapshot đặt vào cache Redis giả. */
const setLimits = (value: Record<string, number>): void => {
  resetRuntimeConfig();
  redisStore.set("cfg:limits.meeting", { value, version: 1 });
};

describe("meetings — giới hạn runtime `limits.meeting` (titleMax, agendaMax, restartWindowMinutes, sàn attendeesMax) (integration)", () => {
  const worlds: World[] = [];
  let w: World;

  beforeAll(async () => {
    await ensureMeetingIndexes();
  });

  beforeEach(async () => {
    installMocks();
    resetRuntimeConfig();
    installHarness(); // container mặc định: `limits` đọc từ runtimeConfig
    w = await seedWorld();
    worlds.push(w);
  });

  afterEach(async () => {
    await cleanupWorld(worlds.splice(0));
    redisStore.clear();
    resetRuntimeConfig();
  });

  const create = (uid: string, over: Record<string, unknown> = {}) => api("post", `/workspaces/${w.workspaceId}/meetings`, uid, meetingBody(over), idemKey());
  const errorText = (res: { body: unknown }): string => JSON.stringify(res.body);

  it("titleMax/agendaMax hạ xuống được áp ở SERVICE (DTO chỉ giữ trần cứng): dài hơn → 400 VAL_001 kèm thông điệp; đếm theo grapheme (emoji ghép = 1)", async () => {
    setLimits({ titleMax: 10, agendaMax: 20 });
    const longTitle = await create(w.u.C!, { title: "x".repeat(11) });
    expect([longTitle.status, longTitle.body.error.code]).toEqual([400, "VAL_001"]);
    expect(errorText(longTitle)).toContain("Tiêu đề tối đa 10 ký tự");
    const longAgenda = await create(w.u.C!, { agenda: "y".repeat(21) });
    expect([longAgenda.status, longAgenda.body.error.code]).toEqual([400, "VAL_001"]);
    expect(errorText(longAgenda)).toContain("Nội dung tối đa 20 ký tự");

    expect((await create(w.u.C!, { title: "x".repeat(10), agenda: "y".repeat(20) })).status).toBe(201); // đúng ngưỡng
    const family = "👨‍👩‍👧‍👦"; // 1 grapheme, 11 code unit
    expect((await create(w.u.C!, { title: family.repeat(10) })).status).toBe(201);
    expect((await create(w.u.C!, { title: family.repeat(11) })).status).toBe(400);
    expect(await prisma.meeting.count({ where: { workspaceId: w.workspaceId } })).toBe(2);
  });

  it("không đặt runtime → giữ trần cứng (title 255, agenda 2000): 256/2001 vẫn bị DTO từ chối, 255/2000 nhận", async () => {
    expect((await create(w.u.C!, { title: "x".repeat(255), agenda: "y".repeat(2000) })).status).toBe(201);
    expect((await create(w.u.C!, { title: "x".repeat(256) })).status).toBe(400);
    expect((await create(w.u.C!, { agenda: "y".repeat(2001) })).status).toBe(400);
  });

  it("sửa: chỉ kiểm trường ĐƯỢC GỬI VÀ ĐỔI — hạ trần không chặn sửa trường khác của cuộc họp cũ đã dài hơn trần mới", async () => {
    const created = await create(w.u.C!, { title: "t".repeat(30), agenda: "ghi chú ngắn" });
    expect(created.status).toBe(201);
    const id = created.body.data.id as string;
    setLimits({ titleMax: 10, agendaMax: 20 });

    expect((await api("patch", `/meetings/${id}`, w.u.C!, { agenda: "sửa nhẹ", expectedVersion: 1 })).status).toBe(200); // tiêu đề cũ 30 > 10 nhưng không đụng tới
    const tooLong = await api("patch", `/meetings/${id}`, w.u.C!, { title: "z".repeat(11), expectedVersion: 2 });
    expect([tooLong.status, tooLong.body.error.code]).toEqual([400, "VAL_001"]);
    const badAgenda = await api("patch", `/meetings/${id}`, w.u.C!, { agenda: "a".repeat(21), expectedVersion: 2 });
    expect(badAgenda.status).toBe(400);
    const ok = await api("patch", `/meetings/${id}`, w.u.C!, { title: "ngắn", expectedVersion: 2 });
    expect([ok.status, ok.body.data.title, ok.body.data.version]).toEqual([200, "ngắn", 3]);
  });

  it("restartWindowMinutes runtime quyết định myActions.canStart của cuộc họp ENDED (chi tiết + lịch nhóm)", async () => {
    const created = await create(w.u.C!, { ...slot(120) });
    const id = created.body.data.id as string;
    const endedAgo = (minutes: number) => prisma.meeting.update({ where: { id }, data: { status: "ENDED", endReason: "HOST_ENDED", startAt: new Date(Date.now() - (minutes + 60) * 60_000), endAt: new Date(Date.now() - minutes * 60_000), endedAt: new Date() } });
    const canStart = async (): Promise<[boolean, boolean]> => {
      const detail = await api("get", `/meetings/${id}`, w.u.C!);
      const from = new Date(Date.now() - 6 * 3600_000).toISOString();
      const to = new Date(Date.now() + 6 * 3600_000).toISOString();
      const listed = await api("get", `/workspaces/${w.workspaceId}/meetings?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, w.u.C!);
      const row = (listed.body.data as Array<{ id: string; myActions: { canStart: boolean } }>).find((m) => m.id === id)!;
      return [detail.body.data.myActions.canStart, row.myActions.canStart];
    };
    await endedAgo(30);

    expect(await canStart()).toEqual([true, true]); // mặc định 60 phút: kết thúc 30 phút trước còn trong hạn
    setLimits({ restartWindowMinutes: 5 });
    expect(await canStart()).toEqual([false, false]);
    setLimits({ restartWindowMinutes: 45 });
    expect(await canStart()).toEqual([true, true]);
    setLimits({ restartWindowMinutes: 0 });
    expect(await canStart()).toEqual([false, false]);
  });

  it("attendeesMax có sàn 2: giá trị đã lưu 1 bị nâng lên 2 → chủ trì mời được đúng 1 người, người thứ hai → 409 MEET_005", async () => {
    setLimits({ attendeesMax: 1 });
    expect((await create(w.u.C!, { attendeeIds: [w.u.D!] })).status).toBe(201);
    const over = await create(w.u.C!, { attendeeIds: [w.u.D!, w.u.E!] });
    expect([over.status, over.body.error.code]).toEqual([409, "MEET_005"]);
  });
});
