import { installMocks, redisStore } from "./projects-test-mocks";
import { buildProjectsApp, cleanupGroups, ensureProjectIndexes, makeApi, seedGroup, tokenFor, type Group } from "./projects-test-kit";
import { newObjectId } from "../../../../core/utils/object-id";
import { prisma } from "../../../../infrastructure/database";

const app = buildProjectsApp();
const api = makeApi(app);

/** URL ảnh ký sẵn bản THUMB của đúng asset (`avatarUrlOf`, `shared/media`) — gốc `PUBLIC_API_URL` tuỳ môi trường. */
const signedThumb = (assetId: string): RegExp => new RegExp(`/api/v1/assets/${assetId}/image\\?v=THUMB&e=\\d+&s=[0-9a-f]{64}$`);

type Person = { id: string; name: string; avatarUrl: string | null };
const avatarById = (people: Person[]): Map<string, string | null> => new Map(people.map((p) => [p.id, p.avatarUrl]));

/** `UserSummary.avatarUrl` (`PrismaProjectDirectory`) trên dữ liệu THẬT: người làm, activity, người theo dõi, gợi ý nhắc tên. */
describe("projects — ảnh đại diện người dùng (integration, Mongo memory replset)", () => {
  const groups: Group[] = [];
  let g: Group;
  let boardId: string;
  let avatarC: string;

  beforeAll(() => ensureProjectIndexes());
  beforeEach(async () => {
    installMocks();
    g = await seedGroup({ A: "OWNER", C: "MEMBER", D: "MEMBER" });
    groups.push(g);
    avatarC = newObjectId(); // chỉ C có ảnh; A, D chưa đặt
    await prisma.user.update({ where: { id: g.ids.C }, data: { avatarAssetId: avatarC } });
    boardId = (await api("post", `/workspaces/${g.workspaceId}/boards`, tokenFor(g.ids.A), { name: "Đồ án" })).body.data.id;
  });
  afterEach(async () => {
    const wsIds = groups.map((x) => x.workspaceId);
    await prisma.notificationRecipient.deleteMany({ where: { workspaceId: { in: wsIds } } });
    await prisma.notification.deleteMany({ where: { workspaceId: { in: wsIds } } });
    await cleanupGroups(groups.splice(0));
    redisStore.clear();
  });

  it("assignee có ảnh → avatarUrl chứa /api/v1/assets/<id>/image (thẻ mới, chi tiết, activity, watchers); chưa đặt ảnh → null", async () => {
    const created = await api("post", `/boards/${boardId}/tasks`, tokenFor(g.ids.C), { title: "Viết báo cáo", assigneeIds: [g.ids.C, g.ids.D] });
    expect(created.status).toBe(201);
    const taskId = created.body.data.id as string;
    expect(avatarById(created.body.data.assignees).get(g.ids.C)).toMatch(signedThumb(avatarC));
    expect(avatarById(created.body.data.assignees).get(g.ids.D)).toBeNull();

    const detail = await api("get", `/tasks/${taskId}`, tokenFor(g.ids.D));
    expect(avatarById(detail.body.data.assignees).get(g.ids.C)).toContain(`/api/v1/assets/${avatarC}/image`);
    expect(avatarById(detail.body.data.assignees).get(g.ids.D)).toBeNull();

    const activity = await api("get", `/tasks/${taskId}/activity`, tokenFor(g.ids.D));
    const createdEntry = (activity.body.data as Array<{ type: string; actor: Person }>).find((a) => a.type === "CREATED");
    expect(createdEntry?.actor).toMatchObject({ id: g.ids.C, avatarUrl: expect.stringMatching(signedThumb(avatarC)) });

    const watchers = await api("get", `/tasks/${taskId}/watchers`, tokenFor(g.ids.D));
    const watcherAvatars = avatarById((watchers.body.data.watchers as Array<{ user: Person }>).map((x) => x.user));
    expect(watcherAvatars.get(g.ids.C)).toMatch(signedThumb(avatarC));
    expect(watcherAvatars.get(g.ids.D)).toBeNull();
  });

  it("mentionables: người có ảnh → URL ký sẵn; người chưa đặt ảnh → null; vẫn đúng 3 khoá (không email)", async () => {
    const res = await api("get", `/boards/${boardId}/mentionables`, tokenFor(g.ids.D));
    expect(res.status).toBe(200);
    const avatars = avatarById(res.body.data as Person[]);
    expect(avatars.get(g.ids.C)).toMatch(signedThumb(avatarC));
    expect(avatars.get(g.ids.A)).toBeNull();
    expect(Object.keys(res.body.data[0]).sort()).toEqual(["avatarUrl", "id", "name"]);
  });
});
