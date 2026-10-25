import { installMocks, redisStore } from "./admin-media-test-mocks";
import { buildApp, cleanup, makeCall, newIds, seedCall, seedMeeting, seedParticipant, seedRecording, seedWorkspace, SECRET_AGENDA, SECRET_PLACE, SECRET_URL, type Ids } from "./admin-media-test-kit";
import { runtimeConfig } from "../../../../core/config/runtime-config";
import { InMemoryMediaServer, setMediaServerForTests } from "../../../../infrastructure/media";
import { prisma } from "../../../../infrastructure/database";
import { createAdminMediaOpsContainer, setAdminMediaOpsContainerForTests } from "../../admin-media-ops.container";
import { PrismaMediaOpsStatsReader } from "../../repositories/media-ops-stats.reader.prisma";
import { MemoryCache } from "../../services/admin-media-cache";

/**
 * p2-07 — đọc: `/admin/meetings`, `/admin/calls`, `/admin/calls/stats`, `/admin/media/health`, `/admin/workspaces/:id/media-stats`, KPI overview (Mongo memory replset thật).
 * OPC-01/02 (quyền), OPC-05 (không lộ nội dung), OPC-06 (thống kê qua aggregation Mongo thật), OPC-07 (health không vỡ khi LiveKit lỗi), OPC-12 (số lượng theo workspace).
 */
const app = buildApp();
const call = makeCall(app);
const ids: Ids = newIds();
const iso = (d: Date) => encodeURIComponent(d.toISOString());

describe("admin-media-ops — đọc (integration, Mongo memory replset)", () => {
  let media: InMemoryMediaServer;
  let statsReads: number;

  beforeEach(() => {
    installMocks();
    media = new InMemoryMediaServer();
    setMediaServerForTests(media);
    statsReads = 0;
    freshContainer();
  });

  class CountingStats extends PrismaMediaOpsStatsReader {
    override callsByDay(...a: Parameters<PrismaMediaOpsStatsReader["callsByDay"]>) {
      statsReads += 1;
      return super.callsByDay(...a);
    }
  }
  /** Container mới (cache/probe phòng LiveKit trong bộ nhớ trống) — probe phòng cache 15 s nên test đổi trạng thái LiveKit phải dựng lại. */
  const freshContainer = () =>
    setAdminMediaOpsContainerForTests(
      createAdminMediaOpsContainer({ media: () => media, cache: new MemoryCache(), stats: new CountingStats(), queueCounts: () => Promise.resolve({ waiting: 2, delayed: 1, failed: 0 }), turnProbe: () => Promise.resolve(null) })
    );

  afterEach(async () => {
    setAdminMediaOpsContainerForTests(null);
    setMediaServerForTests(null);
    await cleanup(ids);
    Object.assign(ids, newIds());
    redisStore.clear();
  });

  describe("phân quyền (OPC-01/02)", () => {
    const PATHS: Array<[string, string]> = [
      ["get", "/admin/meetings"],
      ["get", "/admin/meetings/66f000000000000000000001"],
      ["get", "/admin/calls"],
      ["get", "/admin/calls/stats?from=2026-09-01&to=2026-09-08"],
      ["get", "/admin/calls/66f000000000000000000001"],
      ["get", "/admin/media/health"],
      ["get", "/admin/workspaces/66f000000000000000000001/media-stats"],
      ["get", "/admin/recordings"],
    ];

    it("chưa đăng nhập → 401; user thường → 403 ở MỌI endpoint", async () => {
      for (const [method, path] of PATHS) {
        expect([path, (await call(method as "get", path, null)).status]).toEqual([path, 401]);
        expect([path, (await call(method as "get", path, "user")).status]).toEqual([path, 403]);
      }
      expect((await call("post", "/admin/meetings/66f000000000000000000001/force-end", "user", { reason: "Phòng treo sau sự cố" })).status).toBe(403);
      expect((await call("post", "/admin/calls/66f000000000000000000001/force-end", "user", { reason: "Phòng treo sau sự cố" })).status).toBe(403);
    });

    it("manager xem được cả 4 nhóm endpoint và force-end được (qua kiểm quyền, dừng ở 404/400 nghiệp vụ); KHÔNG xoá được bản ghi hình → 403", async () => {
      const ws = await seedWorkspace(ids);
      for (const path of ["/admin/meetings", "/admin/calls", "/admin/media/health", "/admin/recordings", `/admin/workspaces/${ws.workspaceId}/media-stats`]) {
        expect([path, (await call("get", path, "manager")).status]).toEqual([path, 200]);
      }
      expect((await call("get", "/admin/calls/stats?from=2026-09-01&to=2026-09-08", "manager")).status).toBe(200);
      expect((await call("post", "/admin/meetings/66f000000000000000000001/force-end", "manager", { reason: "Phòng treo sau sự cố" })).status).toBe(404); // qua quyền meeting:update
      expect((await call("post", "/admin/calls/66f000000000000000000001/force-end", "manager", { reason: "Phòng treo sau sự cố" })).status).toBe(404);
      const del = await call("delete", "/admin/recordings/66f000000000000000000001?reason=Xoa%20theo%20yeu%20cau%20phap%20ly", "manager");
      expect([del.status, del.body.error.code]).toEqual([403, "AUTH_005"]);
      expect((await call("delete", "/admin/recordings/66f000000000000000000001?reason=Xoa%20theo%20yeu%20cau%20phap%20ly", "admin")).status).toBe(404); // admin qua quyền meeting:delete → REC_005
    });

    it("cờ voice tắt → /admin/calls* 404 CFG_005 nhưng /admin/meetings vẫn hoạt động; cờ meeting tắt → mọi endpoint 404", async () => {
      const spy = jest.spyOn(runtimeConfig, "isFeatureEnabled").mockImplementation((m) => Promise.resolve(m !== "voice"));
      expect((await call("get", "/admin/meetings")).status).toBe(200);
      const calls = await call("get", "/admin/calls");
      expect([calls.status, calls.body.error.code]).toEqual([404, "CFG_005"]);
      expect((await call("get", "/admin/calls/stats?from=2026-09-01&to=2026-09-08")).status).toBe(404);
      spy.mockImplementation((m) => Promise.resolve(m !== "meeting"));
      for (const path of ["/admin/meetings", "/admin/calls", "/admin/media/health"]) expect([path, (await call("get", path)).status]).toEqual([path, 404]);
    });
  });

  describe("GET /admin/meetings (+ /:id) — chỉ metadata (OPC-05)", () => {
    it("toàn nền tảng: mọi workspace, chưa xoá, kèm tên workspace/chủ trì, số phiên, tổng thời lượng, số bản ghi READY; KHÔNG lộ agenda/địa điểm/link/người tham dự", async () => {
      const a = await seedWorkspace(ids, "Nhóm Alpha");
      const b = await seedWorkspace(ids, "Nhóm Beta");
      const m1 = await seedMeeting(ids, a, { title: "Họp ngân sách", status: "ENDED", endReason: "HOST_ENDED", attendeeCount: 9 });
      const m2 = await seedMeeting(ids, b, { title: "Họp khác", platform: "ZOOM", startAt: new Date(Date.now() + 7_200_000) });
      await seedMeeting(ids, a, { title: "Họp đã xoá", deleted: true });
      const s1 = await seedCall(ids, { scopeType: "MEETING", scopeId: m1.id, mode: "ROOM", workspaceId: a.workspaceId, durationSec: 1800 });
      const s2 = await seedCall(ids, { scopeType: "MEETING", scopeId: m1.id, mode: "ROOM", workspaceId: a.workspaceId, durationSec: 600 });
      await seedRecording(ids, m1, a, s1.id, { status: "READY" });
      await seedRecording(ids, m1, a, s2.id, { status: "FAILED" });
      await seedRecording(ids, m1, a, s2.id, { status: "READY", deleted: true });

      const res = await call("get", `/admin/meetings?limit=50`);
      expect(res.status).toBe(200);
      const rows = res.body.data as Array<Record<string, unknown>>;
      const mine = rows.filter((r) => [m1.id, m2.id].includes(r.id as string));
      expect(mine.map((r) => r.title).sort()).toEqual(["Họp khác", "Họp ngân sách"]);
      expect(rows.some((r) => r.title === "Họp đã xoá")).toBe(false);
      const row1 = mine.find((r) => r.id === m1.id)!;
      expect(row1).toMatchObject({ code: m1.code, workspace: { id: a.workspaceId, name: "Nhóm Alpha" }, host: { id: a.ownerId, name: a.ownerName }, status: "ENDED", endReason: "HOST_ENDED", attendeeCount: 9, sessionCount: 2, totalDurationSec: 2400, recordingCount: 1 });
      expect(Object.keys(row1).sort()).toEqual(
        ["attendeeCount", "code", "endAt", "endReason", "host", "id", "platform", "recordingCount", "sessionCount", "startAt", "status", "timezone", "title", "totalDurationSec", "workspace"].sort()
      );
      const raw = JSON.stringify(res.body);
      for (const secret of [SECRET_AGENDA, SECRET_PLACE, SECRET_URL, "MAT-KHAU-BI-MAT", "currentCallId", "conversationId"]) expect(raw).not.toContain(secret);
    });

    it("lọc + tìm + sắp xếp + phân trang: q theo tiêu đề không dấu hoặc mã họp, workspaceId, status CSV, platform, from/to, sort; trường lạ (userId) → 400", async () => {
      const a = await seedWorkspace(ids);
      const b = await seedWorkspace(ids);
      const base = Date.now() + 86_400_000;
      const x = await seedMeeting(ids, a, { title: "Họp kế hoạch quý", startAt: new Date(base), attendeeCount: 5 });
      await seedMeeting(ids, a, { title: "Retro sprint", status: "LIVE", platform: "TEAMS", startAt: new Date(base + 3_600_000), attendeeCount: 30 });
      const z = await seedMeeting(ids, b, { title: "Kế hoạch marketing", status: "CANCELLED", startAt: new Date(base + 7_200_000), attendeeCount: 2 });
      const titles = (r: { body: { data: Array<{ title: string }> } }) => r.body.data.map((d) => d.title);
      const q = (s: string) => call("get", `/admin/meetings?${s}`);

      expect(titles(await q("q=ke%20hoach&sort=startAt&workspaceId=" + a.workspaceId))).toEqual(["Họp kế hoạch quý"]);
      expect(titles(await q(`q=${x.code}`))).toEqual(["Họp kế hoạch quý"]);
      expect(titles(await q(`workspaceId=${a.workspaceId}&sort=-attendeeCount`))).toEqual(["Retro sprint", "Họp kế hoạch quý"]);
      expect(titles(await q(`workspaceId=${a.workspaceId}&status=LIVE`))).toEqual(["Retro sprint"]);
      expect(titles(await q(`status=LIVE,CANCELLED&sort=startAt&from=${iso(new Date(base - 1000))}`))).toEqual(["Retro sprint", "Kế hoạch marketing"]);
      expect(titles(await q(`platform=TEAMS&workspaceId=${a.workspaceId}`))).toEqual(["Retro sprint"]);
      expect(titles(await q(`from=${iso(new Date(base + 1000))}&to=${iso(new Date(base + 4_000_000))}`))).toEqual(["Retro sprint"]);
      const page = await q(`workspaceId=${a.workspaceId}&limit=1&page=2&sort=startAt`);
      expect([titles(page), page.body.meta]).toEqual([["Retro sprint"], { page: 2, limit: 1, total: 2, totalPages: 2, hasNext: false, hasPrev: true }]);
      // Ký tự đặc biệt của regex được escape: ".*" không khớp mọi thứ.
      expect((await q("q=.*")).body.data).toEqual([]);
      for (const bad of ["userId=" + a.ownerId, "hostId=" + a.ownerId, "limit=51", "status=KHONG-CO", "q=a", "sort=hostId"]) expect([bad, (await q(bad)).status]).toEqual([bad, 400]);
      expect(z.id).toBeTruthy();
    });

    it("chi tiết: phiên hiện tại (LIVE) với số người đang kết nối + phiên gần nhất + tổng bản ghi; 404 MEET_001 với cuộc họp không có/đã xoá; id sai → 400", async () => {
      const w = await seedWorkspace(ids);
      const m = await seedMeeting(ids, w, { title: "Họp trực tiếp", status: "LIVE" });
      const oldSession = await seedCall(ids, { scopeType: "MEETING", scopeId: m.id, mode: "ROOM", workspaceId: w.workspaceId, durationSec: 900, peakParticipants: 4, startedAt: new Date(Date.now() - 7_200_000) });
      const cur = await seedCall(ids, { scopeType: "MEETING", scopeId: m.id, mode: "ROOM", workspaceId: w.workspaceId, status: "ACTIVE", peakParticipants: 5, startedAt: new Date(Date.now() - 600_000) });
      await prisma.meeting.update({ where: { id: m.id }, data: { currentCallId: cur.id, lockedAt: new Date() } });
      const info = { scopeType: "MEETING" as const, scopeId: m.id, startedAt: new Date(), mode: "ROOM" as const };
      await seedParticipant(cur, info, { state: "CONNECTED" });
      await seedParticipant(cur, info, { state: "RECONNECTING" });
      await seedParticipant(cur, info, { state: "LEFT" });
      await seedRecording(ids, m, w, cur.id, { status: "READY", fileSizeBytes: 5000 });
      await seedRecording(ids, m, w, cur.id, { status: "FAILED" });
      const gone = await seedMeeting(ids, w, { deleted: true });

      const res = await call("get", `/admin/meetings/${m.id}`);
      expect(res.status).toBe(200);
      const d = res.body.data;
      expect(d).toMatchObject({ id: m.id, status: "LIVE", sessionCount: 2, recordingCount: 1, recordings: { ready: 1, failed: 1, totalBytes: 5000 } });
      expect(d.currentSession).toMatchObject({ callId: cur.id, connectedCount: 2, lockedAt: expect.any(String) });
      expect(d.sessions.map((s: { callId: string }) => s.callId)).toEqual([cur.id, oldSession.id]); // mới → cũ
      const raw = JSON.stringify(res.body);
      for (const secret of [SECRET_AGENDA, SECRET_PLACE, SECRET_URL, "attendees", "recap", "agenda"]) expect(raw).not.toContain(secret);
      expect(Object.keys(d).sort()).toEqual(
        ["attendeeCount", "code", "currentSession", "endAt", "host", "id", "platform", "recordingCount", "recordings", "sessionCount", "sessions", "startAt", "status", "timezone", "title", "totalDurationSec", "workspace"].sort()
      );
      for (const id of ["66f000000000000000000abc", gone.id]) {
        const miss = await call("get", `/admin/meetings/${id}`);
        expect([miss.status, miss.body.error.code]).toEqual([404, "MEET_001"]);
      }
      expect((await call("get", "/admin/meetings/khong-phai-id")).status).toBe(400);
    });
  });

  describe("GET /admin/calls (+ /:id) — cuộc gọi riêng tư được che (OPC-05)", () => {
    async function seedMix() {
      const w = await seedWorkspace(ids, "Nhóm Gamma");
      const conv = { direct: await seedCall(ids, { scopeType: "CONVERSATION", mode: "RING", peakParticipants: 2 }), group: await seedCall(ids, { scopeType: "CONVERSATION", mode: "RING", workspaceId: w.workspaceId, invitedCount: 4 }) };
      await prisma.conversation.createMany({
        data: [
          { id: conv.direct.scopeId, kind: "DIRECT", directKey: `d:${conv.direct.scopeId}`, meetingKey: `none:${conv.direct.scopeId}`, createdBy: conv.direct.initiatorId, settings: {}, title: "TIÊU-ĐỀ-RIÊNG-TƯ" },
          { id: conv.group.scopeId, kind: "GROUP", workspaceId: w.workspaceId, directKey: `g:${conv.group.scopeId}`, meetingKey: `none:${conv.group.scopeId}`, createdBy: conv.group.initiatorId, settings: {}, title: "NHÓM-CHAT-BÍ-MẬT" },
        ],
      });
      ids.conversations.push(conv.direct.scopeId, conv.group.scopeId);
      const chPub = await seedCall(ids, { scopeType: "CHANNEL", mode: "ROOM", workspaceId: w.workspaceId });
      const chPriv = await seedCall(ids, { scopeType: "CHANNEL", mode: "ROOM", workspaceId: w.workspaceId, endReason: "FORCE_ENDED" });
      const mk = (id: string, name: string, visibility: "PUBLIC" | "PRIVATE") => ({ id, workspaceId: w.workspaceId, name, normalizedName: name.toLowerCase(), createdBy: w.ownerId, visibility });
      await prisma.channel.createMany({ data: [mk(chPub.scopeId, "phòng-chung", "PUBLIC"), mk(chPriv.scopeId, "kênh-lãnh-đạo-bí-mật", "PRIVATE")] });
      ids.channels.push(chPub.scopeId, chPriv.scopeId);
      const m = await seedMeeting(ids, w, { title: "Họp có tiêu đề" });
      const meet = await seedCall(ids, { scopeType: "MEETING", scopeId: m.id, mode: "ROOM", workspaceId: w.workspaceId, mediaKind: "VIDEO" });
      return { w, conv, chPub, chPriv, m, meet };
    }
    afterEach(async () => {
      await prisma.conversation.deleteMany({ where: { id: { in: ids.conversations } } });
      await prisma.channel.deleteMany({ where: { id: { in: ids.channels } } });
    });

    it("nhãn theo loại phạm vi; KHÔNG lộ scopeId/conversationId/initiatorId/tiêu đề nhóm chat/tên kênh riêng tư", async () => {
      const { w, conv, chPub, chPriv, meet } = await seedMix();
      const res = await call("get", `/admin/calls?limit=50&workspaceId=${w.workspaceId}`);
      expect(res.status).toBe(200);
      const label = (id: string) => (res.body.data as Array<{ id: string; label: string }>).find((r) => r.id === id)?.label;
      expect(label(chPub.id)).toBe("#phòng-chung");
      expect(label(chPriv.id)).toBe("Kênh riêng tư");
      expect(label(conv.group.id)).toBe("Nhóm chat");
      expect(label(meet.id)).toBe("Họp có tiêu đề");
      const direct = await call("get", `/admin/calls?limit=50&scopeType=CONVERSATION`);
      expect((direct.body.data as Array<{ id: string; label: string }>).find((r) => r.id === conv.direct.id)?.label).toBe("Cuộc gọi 1-1");
      const raw = JSON.stringify([res.body, direct.body]);
      for (const secret of [conv.direct.scopeId, conv.direct.initiatorId, conv.group.scopeId, chPriv.scopeId, "TIÊU-ĐỀ-RIÊNG-TƯ", "NHÓM-CHAT-BÍ-MẬT", "kênh-lãnh-đạo-bí-mật", `call_${conv.direct.id}`, "initiatorId", "hostId", "livekitRoom"]) {
        expect([secret, raw.includes(secret)]).toEqual([secret, false]);
      }
      const row = (res.body.data as Array<Record<string, unknown>>).find((r) => r.id === chPub.id)!;
      expect(row).toMatchObject({ scopeType: "CHANNEL", mode: "ROOM", channel: { id: chPub.scopeId, name: "phòng-chung" }, workspace: { id: w.workspaceId, name: "Nhóm Gamma" } });
    });

    it("bộ lọc: scopeType, mode, mediaKind, status CSV, endReason CSV, meetingId, workspaceId, khoảng thời gian, sort; lọc theo NGƯỜI/hội thoại → 400", async () => {
      const { w, chPub, chPriv, m, meet, conv } = await seedMix();
      const q = (s: string) => call("get", `/admin/calls?workspaceId=${w.workspaceId}&limit=50&${s}`);
      const idsOf = (r: { body: { data: Array<{ id: string }> } }) => r.body.data.map((d) => d.id).sort();
      expect(idsOf(await q("scopeType=CHANNEL"))).toEqual([chPriv.id, chPub.id].sort());
      expect(idsOf(await q("mode=RING"))).toEqual([conv.group.id]);
      expect(idsOf(await q("mediaKind=VIDEO"))).toEqual([meet.id]);
      expect(idsOf(await q("endReason=FORCE_ENDED,EMPTY"))).toEqual([chPriv.id]);
      expect(idsOf(await q(`meetingId=${m.id}`))).toEqual([meet.id]);
      expect(idsOf(await q("status=ACTIVE"))).toEqual([]);
      expect(idsOf(await q(`from=${iso(new Date(Date.now() + 3_600_000))}`))).toEqual([]);
      const byPeak = await q("sort=-peakParticipants");
      expect(byPeak.status).toBe(200);
      for (const bad of [`userId=${conv.direct.initiatorId}`, `conversationId=${conv.direct.scopeId}`, `scopeId=${conv.direct.scopeId}`, `initiatorId=${conv.direct.initiatorId}`, `meetingId=${m.id}&scopeType=CHANNEL`]) {
        expect([bad, (await q(bad)).status]).toEqual([bad, 400]);
      }
    });

    it("chi tiết: chỉ SỐ ĐẾM theo trạng thái + thiết lập kết nối ≤ 20 s; roomActive theo LiveKit; 404 CALL_005; không userId", async () => {
      const { conv } = await seedMix();
      const active = await seedCall(ids, { scopeType: "CONVERSATION", mode: "RING", status: "ACTIVE", invitedCount: 5, peakParticipants: 3 });
      const info = { scopeType: "CONVERSATION" as const, scopeId: active.scopeId, startedAt: new Date() };
      const t0 = new Date();
      const joined = (ms: number) => ({ joiningAt: t0, firstJoinedAt: new Date(t0.getTime() + ms) });
      const users = [
        await seedParticipant(active, info, { role: "INITIATOR", state: "CONNECTED", ...joined(2000) }),
        await seedParticipant(active, info, { state: "CONNECTED", ...joined(30_000) }), // quá 20 s
        await seedParticipant(active, info, { state: "JOINING", joiningAt: t0 }), // chưa vào
        await seedParticipant(active, info, { state: "DECLINED" }),
        await seedParticipant(active, info, { state: "MISSED" }),
        await seedParticipant(active, info, { state: "BUSY" }),
        await seedParticipant(active, info, { state: "REMOVED" }),
      ];
      media.join(`call_${active.id}`, { identity: users[0]! });

      const res = await call("get", `/admin/calls/${active.id}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        id: active.id, label: "Cuộc gọi 1-1", status: "ACTIVE", invitedCount: 5, peakParticipants: 3,
        participantStats: { invited: 7, answered: 3, connected: 2, missed: 1, declined: 1, busy: 1, removed: 1 },
        setup: { attempts: 3, successWithin20s: 1 },
        roomActive: true,
      });
      const raw = JSON.stringify(res.body);
      for (const uid of [...users, active.initiatorId, active.scopeId]) expect(raw).not.toContain(uid);

      media.reset(); // LiveKit không còn phòng
      freshContainer();
      expect((await call("get", `/admin/calls/${active.id}`)).body.data.roomActive).toBe(false);
      const ended = await call("get", `/admin/calls/${conv.group.id}`);
      expect("roomActive" in ended.body.data).toBe(false); // đã kết thúc: không hỏi LiveKit
      const miss = await call("get", "/admin/calls/66f000000000000000000abc");
      expect([miss.status, miss.body.error.code]).toEqual([404, "CALL_005"]);
    });
  });

  describe("GET /admin/calls/stats (OPC-06, aggregation Mongo thật)", () => {
    it("đúng số cuộc/phút/answerRate/setupSuccessRate/thời lượng TB, gom theo NGÀY của múi giờ, lấp ngày trống; lọc workspace; cache", async () => {
      const w = await seedWorkspace(ids);
      const day10 = new Date("2026-05-10T03:00:00Z"); // 10:00 ICT ngày 10/5
      const late = new Date("2026-05-10T18:00:00Z"); // 01:00 ICT ngày 11/5 (vẫn ngày 10/5 UTC)
      const mkRing = (startedAt: Date, answered: boolean, ws: string | null) => seedCall(ids, { scopeType: "CONVERSATION", mode: "RING", workspaceId: ws, startedAt, answeredAt: answered ? new Date(startedAt.getTime() + 4000) : null, durationSec: answered ? 120 : null, endReason: answered ? "COMPLETED" : "NO_ANSWER" });
      const r1 = await mkRing(day10, true, w.workspaceId);
      await mkRing(day10, true, null);
      await mkRing(late, true, w.workspaceId);
      await mkRing(day10, false, null);
      const room = await seedCall(ids, { scopeType: "CHANNEL", mode: "ROOM", workspaceId: w.workspaceId, startedAt: late, durationSec: 600, endReason: "FORCE_ENDED" });
      const info = (c: { scopeId: string }, at: Date, mode: "RING" | "ROOM") => ({ scopeType: (mode === "RING" ? "CONVERSATION" : "CHANNEL") as "CONVERSATION" | "CHANNEL", scopeId: c.scopeId, startedAt: at, mode });
      const t = (ms: number) => ({ joiningAt: day10, firstJoinedAt: new Date(day10.getTime() + ms) });
      await seedParticipant(r1, info(r1, day10, "RING"), { state: "LEFT", ...t(3000) });
      await seedParticipant(r1, info(r1, day10, "RING"), { state: "LEFT", ...t(25_000) });
      await seedParticipant(r1, info(r1, day10, "RING"), { state: "MISSED", joiningAt: day10 });
      const r2 = await seedCall(ids, { scopeType: "CONVERSATION", mode: "RING", workspaceId: null, startedAt: day10, answeredAt: day10, durationSec: 120 });
      await seedParticipant(r2, info(r2, day10, "RING"), { state: "LEFT", ...t(2000) }); // cuộc gọi KHÔNG thuộc workspace: chỉ vào tổng toàn nền tảng
      await seedParticipant(room, info(room, late, "ROOM"), { state: "LEFT", joiningAt: late, firstJoinedAt: new Date(late.getTime() + 1000) });

      const from = "2026-05-09T17:00:00Z"; // 00:00 ICT ngày 10/5
      const to = "2026-05-12T17:00:00Z"; // → 3 ngày ICT: 10, 11, 12
      const q = `/admin/calls/stats?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&tz=Asia/Ho_Chi_Minh`;
      const res = await call("get", q);
      expect(res.status).toBe(200);
      const s = res.body.data;
      expect(s.totals).toEqual({ calls: 6, ringCalls: 5, roomCalls: 1, minutes: 18, answerRate: 0.8, setupSuccessRate: 0.6, avgDurationSec: 216 });
      expect(s.byDay.map((d: { date: string }) => d.date)).toEqual(["2026-05-10", "2026-05-11", "2026-05-12"]);
      expect(s.byDay[0]).toMatchObject({ calls: 4, minutes: 6, answerRate: 0.75 });
      expect(s.byDay[1]).toMatchObject({ calls: 2, minutes: 12 });
      expect(s.byDay[2]).toEqual({ date: "2026-05-12", calls: 0, minutes: 0, answerRate: null, setupSuccessRate: null, avgDurationSec: null });
      expect(s.byEndReason).toEqual([{ reason: "COMPLETED", count: 4 }, { reason: "FORCE_ENDED", count: 1 }, { reason: "NO_ANSWER", count: 1 }]);

      const utc = await call("get", `/admin/calls/stats?from=2026-05-10T00:00:00Z&to=2026-05-13T00:00:00Z&tz=UTC`);
      expect(utc.body.data.byDay[0].calls).toBe(6); // cùng dữ liệu, ngày UTC khác ⇒ gom khác
      const scoped = await call("get", `${q}&workspaceId=${w.workspaceId}`);
      expect(scoped.body.data.totals).toMatchObject({ calls: 3, ringCalls: 2, roomCalls: 1, setupSuccessRate: 0.5 }); // participant lọc qua $lookup sang Call (bỏ participant của cuộc gọi không thuộc nhóm)

      const before = statsReads;
      const again = await call("get", q);
      expect(again.body.data.totals).toEqual(s.totals);
      expect(statsReads).toBe(before); // cache trúng — không chạm Mongo
    });

    it("khoảng > 92 ngày / to ≤ from / múi giờ lạ → 400 ADMIN_MEDIA_001; thiếu from → 400 VAL_001; trường lạ → 400", async () => {
      for (const qs of ["from=2026-01-01&to=2026-06-01", "from=2026-05-02&to=2026-05-01", "from=2026-05-01&to=2026-05-02&tz=Mars/Olympus"]) {
        const res = await call("get", `/admin/calls/stats?${qs}`);
        expect([qs, res.status, res.body.error.code]).toEqual([qs, 400, "ADMIN_MEDIA_001"]);
      }
      const missing = await call("get", "/admin/calls/stats?to=2026-05-02");
      expect([missing.status, missing.body.error.code]).toEqual([400, "VAL_001"]);
      expect((await call("get", "/admin/calls/stats?from=2026-05-01&to=2026-05-02&userId=66f000000000000000000001")).status).toBe(400);
    });
  });

  describe("GET /admin/media/health (OPC-07)", () => {
    const noWebhooks = { lastLiveKitWebhookAt: () => Promise.resolve(null), liveKitWebhookCountsSince: () => Promise.resolve({ received: 0, failed: 0 }), failedRecordingsSince: () => Promise.resolve(0) };
    const useContainer = (over: Parameters<typeof createAdminMediaOpsContainer>[0] = {}) =>
      setAdminMediaOpsContainerForTests(
        createAdminMediaOpsContainer({ media: () => media, cache: new MemoryCache(), queueCounts: () => Promise.resolve({ waiting: 2, delayed: 1, failed: 0 }), turnProbe: () => Promise.resolve(null), healthReader: noWebhooks, ...over })
      );

    it("khoẻ → 200 với rooms/participants/egress/webhook/hàng đợi; TURN thiếu khoá → UNKNOWN; có phòng mà chưa nhận webhook → DEGRADED", async () => {
      media.join("call_x", { identity: "u1" });
      media.join("call_x", { identity: "u2" });
      useContainer();
      const res = await call("get", "/admin/media/health");
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        status: "DEGRADED",
        livekit: { status: "OK", rooms: 1, participants: 2 },
        egress: { status: "OK", active: 0, failed24h: 0 },
        webhook: { status: "DEGRADED", received1h: 0, failed1h: 0 },
        turn: { status: "UNKNOWN" },
        queues: { calls: { waiting: 2, delayed: 1, failed: 0 }, media: { waiting: 2, delayed: 1, failed: 0 } },
      });
      expect(typeof res.body.data.checkedAt).toBe("string");
    });

    it("đọc WebhookEvent THẬT: webhook gần nhất + số nhận trong 1 giờ", async () => {
      const eventId = `evt-admin-media-${Date.now()}`;
      await prisma.webhookEvent.create({ data: { provider: "LIVEKIT", eventId, type: "participant_joined", payloadHash: "h", status: "PROCESSED" } });
      try {
        setAdminMediaOpsContainerForTests(createAdminMediaOpsContainer({ media: () => media, cache: new MemoryCache(), queueCounts: () => Promise.resolve({ waiting: 0, delayed: 0, failed: 0 }), turnProbe: () => Promise.resolve(null) }));
        const res = await call("get", "/admin/media/health");
        expect(res.status).toBe(200);
        expect(res.body.data.webhook.received1h).toBeGreaterThanOrEqual(1);
        expect(new Date(res.body.data.webhook.lastReceivedAt).getTime()).toBeGreaterThan(Date.now() - 60_000);
      } finally {
        await prisma.webhookEvent.deleteMany({ where: { eventId } });
      }
    });

    it("LiveKit lỗi → VẪN 200: livekit DOWN + error đã làm sạch, tổng DEGRADED (không 500, không vỡ trang)", async () => {
      media.failNext("listRooms", new Error("connect ECONNREFUSED https://lk.internal:7880 apiKey=SECRET"));
      useContainer();
      const res = await call("get", "/admin/media/health");
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe("DEGRADED");
      expect(res.body.data.livekit.status).toBe("DOWN");
      expect(typeof res.body.data.livekit.error).toBe("string");
      expect(JSON.stringify(res.body)).not.toMatch(/ECONNREFUSED|lk.internal|SECRET/);
    });
  });

  describe("GET /admin/workspaces/:workspaceId/media-stats (OPC-12) + KPI dashboard (OPC-11)", () => {
    it("chỉ số lượng/thời lượng của workspace trong ?days= — không danh sách người/cuộc; workspace lạ → 404; days > 92 → 400", async () => {
      const w = await seedWorkspace(ids);
      const other = await seedWorkspace(ids);
      const now = Date.now();
      const past = (days: number) => new Date(now - days * 86_400_000);
      const m1 = await seedMeeting(ids, w, { status: "ENDED", startAt: past(2) });
      await seedMeeting(ids, w, { status: "SCHEDULED", startAt: past(1) });
      await seedMeeting(ids, w, { status: "CANCELLED", startAt: past(3) });
      await seedMeeting(ids, w, { status: "ENDED", startAt: past(60) }); // ngoài cửa sổ
      await seedMeeting(ids, other, { status: "ENDED", startAt: past(2) });
      const meet = await seedCall(ids, { scopeType: "MEETING", scopeId: m1.id, mode: "ROOM", workspaceId: w.workspaceId, startedAt: past(2), durationSec: 1800 });
      await seedCall(ids, { scopeType: "CONVERSATION", mode: "RING", workspaceId: w.workspaceId, startedAt: past(1), durationSec: 120 });
      await seedCall(ids, { scopeType: "CHANNEL", mode: "ROOM", workspaceId: w.workspaceId, startedAt: past(1), durationSec: 300 });
      await seedRecording(ids, m1, w, meet.id, { status: "READY", fileSizeBytes: 4096, startedAt: past(2) });
      await seedRecording(ids, m1, w, meet.id, { status: "READY", fileSizeBytes: 100, startedAt: past(2), deleted: true });

      const res = await call("get", `/admin/workspaces/${w.workspaceId}/media-stats?days=30`);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({
        days: 30,
        meetings: { scheduled: 1, held: 1, cancelled: 1, totalMinutes: 30 },
        calls: { total: 2, ring: 1, room: 1, minutes: 7 },
        recordings: { ready: 1, storageBytes: 4096 },
      });
      const raw = JSON.stringify(res.body);
      expect(raw).not.toMatch(/userId|hostId|title|code|initiator/);
      expect((await call("get", `/admin/workspaces/${w.workspaceId}/media-stats`)).body.data.days).toBe(30); // mặc định
      expect((await call("get", `/admin/workspaces/66f000000000000000000abc/media-stats`)).status).toBe(404);
      expect((await call("get", `/admin/workspaces/${w.workspaceId}/media-stats?days=93`)).status).toBe(400);
    });

    it("KPI overview: cuộc họp LIVE, cuộc gọi hôm nay, phút 7 ngày, dung lượng ghi hình, ghi hình lỗi 24 giờ (provider dùng repository thật)", async () => {
      const w = await seedWorkspace(ids);
      const before = await createAdminMediaOpsContainer({ cache: new MemoryCache() }).overview.get();
      const live = await seedMeeting(ids, w, { status: "LIVE" });
      const c = await seedCall(ids, { scopeType: "MEETING", scopeId: live.id, mode: "ROOM", workspaceId: w.workspaceId, durationSec: 3600 });
      await seedRecording(ids, live, w, c.id, { status: "READY", fileSizeBytes: 2048 });
      await seedRecording(ids, live, w, c.id, { status: "FAILED" });
      const after = await createAdminMediaOpsContainer({ cache: new MemoryCache() }).overview.get();
      expect(after.liveMeetings - before.liveMeetings).toBe(1);
      expect(after.callsToday - before.callsToday).toBe(1);
      expect(after.callMinutes7d - before.callMinutes7d).toBe(60);
      expect(after.recordingStorageBytes - before.recordingStorageBytes).toBe(2048);
      expect(after.egressFailed24h - before.egressFailed24h).toBe(1);
    });
  });
});
