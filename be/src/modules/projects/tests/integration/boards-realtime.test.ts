import { installMocks, redisHashStore, redisStore } from "./projects-test-mocks";
import { buildProjectsApp, cleanupGroups, makeApi, mutationId, seedGroup, tokenFor, type Group } from "./projects-test-kit";
import type { Socket as ClientSocket } from "socket.io-client";
import { permissionService, resetPermissionPorts } from "../../../../core/permission";
import { newObjectId } from "../../../../core/utils/object-id";
import { bindPermissionPorts } from "../../../../infrastructure/permission-ports";
import { ROOM } from "../../../../infrastructure/socket";
import {
  connectClient,
  emitWithAck,
  startHarness,
  stopHarness,
  tokenFor as socketTokenFor,
  type Harness,
} from "../../../../infrastructure/socket/tests/integration/test-helpers";

const app = buildProjectsApp();
const api = makeApi(app);

type Board = { id: string; columns: { id: string; kind: string }[] };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const waitFor = <T>(client: ClientSocket, event: string, timeoutMs = 2000): Promise<T> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Không nhận được ${event} trong ${timeoutMs}ms`)), timeoutMs);
    client.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
/** `true` nếu KHÔNG có sự kiện nào tới trong `ms`. */
const stays = (client: ClientSocket, event: string, ms = 300): Promise<boolean> =>
  new Promise((resolve) => {
    let got = false;
    client.once(event, () => {
      got = true;
    });
    setTimeout(() => resolve(!got), ms);
  });

describe("projects — realtime room board:{id} (socket thật)", () => {
  let harness: Harness;
  const groups: Group[] = [];
  const clients: ClientSocket[] = [];
  let g: Group;
  let board: Board;

  beforeAll(async () => {
    harness = await startHarness();
    bindPermissionPorts();
  });
  afterAll(async () => {
    await stopHarness(harness);
    resetPermissionPorts();
  });
  beforeEach(async () => {
    installMocks();
    g = await seedGroup({ A: "OWNER", C: "MEMBER", D: "MEMBER", G: "GUEST" });
    groups.push(g);
    board = (await api("post", `/workspaces/${g.workspaceId}/boards`, tokenFor(g.ids.A), { name: "Đồ án" })).body.data;
  });
  afterEach(async () => {
    for (const c of clients.splice(0)) c.disconnect();
    await cleanupGroups(groups.splice(0));
    redisStore.clear();
    redisHashStore.clear();
  });

  const connect = async (userId: string): Promise<ClientSocket> => {
    const c = await connectClient(harness.port, { token: socketTokenFor(userId, `${userId}@e.com`), deviceId: `dev-${userId.slice(-6)}` });
    clients.push(c);
    return c;
  };
  const join = (c: ClientSocket, id = board.id) => emitWithAck<{ ok: boolean; code?: string }>(c, "room:join", { kind: "board", id });
  const col = (kind: string) => board.columns.find((c) => c.kind === kind)!.id;

  it("PM2-14: thành viên join được; người ngoài, GUEST, id lạ, id sai định dạng bị từ chối", async () => {
    const [member, guest, outsider] = await Promise.all([connect(g.ids.C), connect(g.ids.G), connect(newObjectId())]);

    expect(await join(member)).toEqual({ ok: true });
    expect(await join(guest)).toEqual({ ok: false, code: "PERM_404" });
    expect(await join(outsider)).toEqual({ ok: false, code: "PERM_404" });
    expect(await join(member, newObjectId())).toEqual({ ok: false, code: "PERM_404" });
    expect(await emitWithAck(member, "room:join", { kind: "board", id: "khong-hop-le" })).toMatchObject({ ok: false });

    const inRoom = await harness.io.in(ROOM.board(board.id)).fetchSockets();
    expect(inRoom).toHaveLength(1);
  });

  it("A kéo thẻ → B (đang ở board:{id}) nhận task:moved trong ≤ 1 s; người không ở room không nhận", async () => {
    const [a, b, outsider] = await Promise.all([connect(g.ids.C), connect(g.ids.D), connect(g.ids.A)]);
    await join(a);
    await join(b);
    const task = (await api("post", `/boards/${board.id}/tasks`, tokenFor(g.ids.C), { title: "Thẻ realtime" })).body.data as { id: string };

    const gotB = waitFor<Record<string, unknown>>(b, "task:moved", 1000);
    const noOutsider = stays(outsider, "task:moved");
    const clientMutationId = mutationId();
    const startedAt = Date.now();
    const res = await api("post", `/tasks/${task.id}/move`, tokenFor(g.ids.C), {
      columnId: col("DONE"), afterTaskId: null, beforeTaskId: null, expectedVersion: 1, clientMutationId,
    });
    expect(res.status).toBe(200);

    const payload = await gotB;
    expect(Date.now() - startedAt).toBeLessThan(1000);
    expect(payload).toMatchObject({
      v: 1, id: task.id, boardId: board.id, fromColumnId: col("TODO"), columnId: col("DONE"), columnKind: "DONE",
      version: 2, actorId: g.ids.C, clientMutationId,
    });
    expect(typeof payload.serverNow).toBe("string");
    expect(payload.position).toBe(res.body.data.position);
    expect(payload.completedAt).toBe(res.body.data.completedAt);
    expect(await noOutsider).toBe(true);
  });

  it("task:created và board:updated (đổi cột, nhãn) tới thành viên trong room", async () => {
    const [a, b] = await Promise.all([connect(g.ids.C), connect(g.ids.D)]);
    await join(a);
    await join(b);

    const created = waitFor<{ task: { title: string }; actorId: string }>(b, "task:created", 1000);
    await api("post", `/boards/${board.id}/tasks`, tokenFor(g.ids.C), { title: "Mới tạo", clientMutationId: "mutation-cc00dd11" });
    expect((await created)).toMatchObject({ v: 1, task: { title: "Mới tạo" }, actorId: g.ids.C, clientMutationId: "mutation-cc00dd11" });

    const cols = board.columns.map((c) => ({ id: c.id, title: `${c.kind}!`, kind: c.kind }));
    const updated = waitFor<Record<string, unknown>>(b, "board:updated", 1000);
    expect((await api("put", `/boards/${board.id}/columns`, tokenFor(g.ids.A), { columns: cols, expectedVersion: 1 })).status).toBe(200);
    expect(await updated).toMatchObject({ v: 1, boardId: board.id, version: 2 });

    const labelEvt = waitFor<Record<string, unknown>>(b, "board:updated", 1000);
    await api("post", `/boards/${board.id}/labels`, tokenFor(g.ids.C), { name: "Mới", color: "red" });
    expect(await labelEvt).toMatchObject({ boardId: board.id, labelsChanged: true });
  });

  it("thu hồi quyền ở WORKSPACE (bị xoá khỏi nhóm) → bị đá khỏi board:{id}; sau đó KHÔNG nhận task:moved", async () => {
    const [a, b] = await Promise.all([connect(g.ids.C), connect(g.ids.D)]);
    await join(a);
    await join(b);
    const task = (await api("post", `/boards/${board.id}/tasks`, tokenFor(g.ids.C), { title: "Sau khi bị xoá" })).body.data as { id: string };

    await permissionService.revokeScope({ scope: { type: "WORKSPACE", id: g.workspaceId }, userIds: [g.ids.D], reason: "REMOVED" });
    await sleep(50);
    const inRoom = (await harness.io.in(ROOM.board(board.id)).fetchSockets()).map((s) => (s.data as { user: { id: string } }).user.id);
    expect(inRoom).toEqual([g.ids.C]);

    const noMoreForB = stays(b, "task:moved", 400);
    const gotA = waitFor(a, "task:moved", 1000);
    await api("post", `/tasks/${task.id}/move`, tokenFor(g.ids.C), {
      columnId: col("IN_PROGRESS"), afterTaskId: null, beforeTaskId: null, expectedVersion: 1, clientMutationId: mutationId(),
    });
    await gotA;
    expect(await noMoreForB).toBe(true);
  });
});
