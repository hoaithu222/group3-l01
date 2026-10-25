import type { MentorApplication, MentorEngagement, MentorPost, Prisma } from "@prisma/client";
import { normalizeSearch } from "../../../../src/core/utils/normalize";
import { newObjectId } from "../../../../src/core/utils/object-id";
import { MENTOR_DISPLAY_TAG } from "../../../../src/modules/mentor/entities/mentor.interface";
import { normalizeSkills } from "../../../../src/modules/mentor/services/mentor-skills";
import { DAY_MS, MIN_MS, prisma, rngFrom } from "../core";
import { postScript, postSystemMessage, type ScopeRef } from "../messages";
import type { ModuleCtx, ModuleSeed } from "../module-ctx";
import type { WorkspaceCtx } from "../workspace";
import type { ChatSpec } from "./mentor.chats";
import { POSTS, type ApplicationSpec, type EndReason, type PostSpec } from "./mentor.content";

/**
 * Seed "Tìm cố vấn" (p6-03 Mentor Connect): bài đăng, đơn ứng tuyển, đợt cố vấn (khách có hạn + quyền kênh + nhóm chat "Cố vấn · …")
 * và thông báo cho `thu`. Ghi ĐÚNG như `MentorPostsService.create` / `MentorApplicationsService.apply|reject|withdraw` /
 * `MentorAcceptService.accept` (+ `WorkspaceMembershipPortImpl.grantGuestInTx`, `ChannelGrantPortService.grantMemberInTx`) /
 * `MentorEffectsService.onAccepted|onEnded` / `MentorEngagementsService.extend|endInternal` / `MentorPostsService.close`.
 * Không outbox/push/socket; không audit log. Idempotent: bài nhận diện theo (nhóm, người đăng, tiêu đề chuẩn hoá), con của bài tạo trong MỘT transaction.
 */
type Role = "OWNER" | "ADMIN";
const isAdmin = (r: string | undefined): r is Role => r === "OWNER" || r === "ADMIN";
const GUEST_BLOCKING = new Set(["ACTIVE", "PENDING", "BANNED"]);
const LEAVE_REASON: Record<EndReason, "LEFT" | "EXPIRED" | "REMOVED"> = { LEFT_BY_MENTOR: "LEFT", EXPIRED: "EXPIRED", ENDED_BY_OWNER: "REMOVED" };
// MENTOR_JOINED/MENTOR_LEFT/MEMBER_REMOVED do job của app đăng; `postSystemMessage` của seed chỉ khai kiểu của nhóm chat thường nên ép kiểu ở đây.
type SystemType = Parameters<typeof postSystemMessage>[1];

interface Stats { posts: number; apps: number; pending: number; accepted: number; engagements: number; ended: number; guests: number; grants: number; chats: number; messages: number; notifs: number; skipped: string[] }

interface EngPlan {
  id: string; mentorId: string; acceptedBy: string; channelIds: string[]; startedAt: Date; endsAt: Date; totalDays: number;
  endedAt: Date | null; endedReason: EndReason | null; endedBy: string | null; endingSoonAt: Date | null; version: number; updatedAt: Date; active: boolean;
}
interface AppPlan { id: string; spec: ApplicationSpec; applicantId: string; createdAt: Date; reviewedAt: Date | null; reviewedBy: string | null; reason: string | null; updatedAt: Date; eng: EngPlan | null }
interface PostPlan { id: string; createdAt: Date; updatedAt: Date; closedAt: Date | null; apps: AppPlan[]; active: number; version: number; status: "OPEN" | "FULFILLED" | "CLOSED" }

export const seedMentor: ModuleSeed = async (c) => {
  const st: Stats = { posts: 0, apps: 0, pending: 0, accepted: 0, engagements: 0, ended: 0, guests: 0, grants: 0, chats: 0, messages: 0, notifs: 0, skipped: [] };
  const seeded: Array<{ ws: WorkspaceCtx; postId: string }> = [];
  const userIds = new Set<string>();
  for (const p of POSTS) {
    userIds.add(c.dir.id(p.by));
    for (const a of p.apps) {
      userIds.add(c.dir.id(a.who));
      if (a.engagement) userIds.add(c.dir.id(a.engagement.by));
    }
  }
  // Mốc tạo tài khoản chặn bản ghi quá cũ của từng người mẫu; `thu` là tài khoản thật (có thể đăng ký SAU các nhóm mẫu) nên không áp.
  const joined = new Map((await prisma.user.findMany({ where: { id: { in: [...userIds] } }, select: { id: true, createdAt: true } })).map((u) => [u.id, u.createdAt]));
  joined.delete(c.dir.id("thu"));

  for (const spec of POSTS) {
    const ws = c.workspaces.get(spec.ws);
    if (!ws) continue;
    if (!isAdmin(ws.roles.get(spec.by))) { st.skipped.push(`${spec.key}: ${spec.by} không là OWNER/ADMIN`); continue; }
    const createdBy = c.dir.id(spec.by);
    const normalizedTitle = normalizeSearch(spec.title);
    let post = await prisma.mentorPost.findFirst({ where: { workspaceId: ws.id, createdBy, normalizedTitle } });
    if (!post) {
      const plan = await buildPlan(c, ws, spec, joined, st);
      await prisma.$transaction((tx) => writeGraph(tx, c, ws, spec, plan, createdBy, normalizedTitle, st), { timeout: 120_000, maxWait: 20_000 });
      st.posts += 1;
      post = await prisma.mentorPost.findUniqueOrThrow({ where: { id: plan.id } });
    }
    seeded.push({ ws, postId: post.id });
    await seedChats(c, ws, spec, post, st);
  }
  await seedThuNotifications(c, seeded, st);
  const sk = st.skipped.length > 0 ? ` · BỎ QUA ${st.skipped.length}: ${st.skipped.join("; ")}` : "";
  return `Tìm cố vấn: +${st.posts} bài, +${st.apps} đơn (${st.pending} chờ duyệt, ${st.accepted} chấp nhận), +${st.engagements} đợt cố vấn (${st.ended} đã kết thúc), +${st.guests} khách GUEST/+${st.grants} quyền kênh, +${st.chats} nhóm chat/+${st.messages} tin, +${st.notifs} thông báo cho thu${sk}`;
};

/** Đồng hồ của một bài: `k` co mọi "ngày trước" cho vừa tuổi nhóm; `floors` = mốc sớm nhất của từng người (tài khoản mới tạo / admin mới vào nhóm). */
interface Clock { nowMs: number; k: number; wsFloor: number; floors: Map<string, number>; rng: () => number }

/**
 * Mốc "daysAgo ngày trước" (đã co), không sớm hơn `prev`+5 phút, mốc sớm nhất của `userId` và của nhóm; không muộn quá "bây giờ".
 * Khi bị đẩy lùi hẳn (> nửa ngày) thì cộng thêm 2–26 giờ ngẫu nhiên (tất định) để các bước không dồn vào một phút.
 */
function at(clk: Clock, days: number, prev: Date | null, userId?: string): Date {
  const designed = clk.nowMs - Math.round(days * clk.k * DAY_MS);
  const need = Math.max(clk.wsFloor, prev ? prev.getTime() + 5 * MIN_MS : 0, userId ? (clk.floors.get(userId) ?? 0) : 0);
  const t = designed >= need ? designed : need - designed > DAY_MS / 2 ? need + Math.round((2 + clk.rng() * 24) * 3_600_000) : need;
  return new Date(Math.min(t, clk.nowMs - 2 * MIN_MS));
}

/** Tính mọi mốc thời gian + số đếm của một bài (chưa ghi DB). Đơn của người đã là thành viên nhóm bị bỏ (ghi vào `st.skipped`). */
async function buildPlan(c: ModuleCtx, ws: WorkspaceCtx, spec: PostSpec, joined: Map<string, Date>, st: Stats): Promise<PostPlan> {
  const nowMs = c.now.getTime();
  const createdBy = c.dir.id(spec.by);
  const people = [createdBy, ...spec.apps.flatMap((a) => [c.dir.id(a.who), ...(a.engagement ? [c.dir.id(a.engagement.by)] : [])])];
  const adminJoin = new Map((await prisma.workspaceMembership.findMany({ where: { workspaceId: ws.id, userId: { in: people }, role: "ADMIN" }, select: { userId: true, joinedAt: true } })).map((m) => [m.userId, m.joinedAt.getTime()]));
  const floors = new Map(people.map((id) => [id, Math.max((joined.get(id)?.getTime() ?? 0) + 3_600_000, (adminJoin.get(id) ?? 0) + 3_600_000)]));
  const wsFloor = ws.createdAt.getTime() + 2 * 3_600_000;
  // Nhóm mới tạo vài ngày (vd nhóm có sẵn của thu): nén dòng thời gian của MỌI bài trong nhóm theo cùng một tỉ lệ (giữ khoảng cách giữa các bài)
  // để không bài nào "cũ hơn" nhóm.
  const oldest = Math.max(...POSTS.filter((p) => p.ws === spec.ws).map((p) => p.ageDays));
  const k = Math.max(0.02, Math.min(1, ((nowMs - wsFloor) / DAY_MS - 0.05) / oldest));
  const clk: Clock = { nowMs, k, wsFloor, floors, rng: rngFrom(`mentor-time:${spec.key}`) };
  const postAt = at(clk, spec.ageDays, null, createdBy);
  const channels = new Map((await prisma.channel.findMany({ where: { workspaceId: ws.id, status: "ACTIVE" }, select: { id: true, normalizedName: true } })).map((ch) => [ch.normalizedName, ch.id]));

  const apps: AppPlan[] = [];
  let last = postAt;
  for (const a of spec.apps) {
    const applicantId = c.dir.id(a.who);
    const m = await prisma.workspaceMembership.findUnique({ where: { workspaceId_userId: { workspaceId: ws.id, userId: applicantId } }, select: { status: true } });
    if (m && GUEST_BLOCKING.has(m.status)) { st.skipped.push(`${spec.key}: ${a.who} đã là thành viên nhóm`); continue; }
    const createdAt = at(clk, a.daysAgo, postAt, applicantId);
    const plan: AppPlan = { id: newObjectId(), spec: a, applicantId, createdAt, reviewedAt: null, reviewedBy: null, reason: null, updatedAt: createdAt, eng: null };
    if (a.status === "ACCEPTED" || a.status === "REJECTED") {
      const reviewerKey = a.engagement?.by ?? a.reviewBy ?? spec.by;
      if (!isAdmin(ws.roles.get(reviewerKey))) { st.skipped.push(`${spec.key}: ${reviewerKey} không là OWNER/ADMIN`); continue; }
      plan.reviewedBy = c.dir.id(reviewerKey);
      plan.reviewedAt = at(clk, a.reviewDaysAgo ?? a.daysAgo - 0.5, createdAt, plan.reviewedBy);
      plan.updatedAt = plan.reviewedAt;
      plan.reason = a.status === "REJECTED" ? (a.reason ?? null) : null;
    } else if (a.status === "WITHDRAWN") {
      plan.updatedAt = at(clk, a.reviewDaysAgo ?? a.daysAgo - 0.5, createdAt);
    }
    if (a.status === "ACCEPTED") plan.eng = planEngagement(clk, ws, a, plan, channels);
    if (a.status === "ACCEPTED" && !plan.eng) continue;
    apps.push(plan);
    last = new Date(Math.max(last.getTime(), plan.updatedAt.getTime(), plan.eng?.updatedAt.getTime() ?? 0));
  }

  const closedAt = spec.closedDaysAgo !== undefined ? at(clk, spec.closedDaysAgo, last) : null;
  for (const a of apps) if (a.spec.status === "EXPIRED") { a.reviewedAt = closedAt ?? last; a.updatedAt = a.reviewedAt; }
  const engs = apps.flatMap((a) => (a.eng ? [a.eng] : []));
  const active = engs.filter((e) => e.active).length;
  const all = [postAt, closedAt, ...apps.map((a) => a.updatedAt), ...engs.map((e) => e.updatedAt)].filter((d): d is Date => d !== null);
  return {
    id: newObjectId(), createdAt: postAt, closedAt, apps, active,
    updatedAt: new Date(Math.max(...all.map((d) => d.getTime()))),
    // claimSlot +1 mỗi đợt, releaseSlot +1 mỗi đợt kết thúc, close +1 — mỗi lần đổi đều tăng `version` (xem repository).
    version: 1 + engs.length + engs.filter((e) => !e.active).length + (closedAt ? 1 : 0),
    status: closedAt ? "CLOSED" : active >= spec.needed ? "FULFILLED" : "OPEN",
  };
}

function planEngagement(clk: Clock, ws: WorkspaceCtx, a: ApplicationSpec, app: AppPlan, channels: Map<string, string>): EngPlan | null {
  const e = a.engagement;
  if (!e || !app.reviewedAt || !app.reviewedBy) return null;
  const startedAt = app.reviewedAt;
  let totalDays = e.days + (e.extend?.addDays ?? 0);
  if (e.endsInDays !== undefined) totalDays = Math.max(7, Math.ceil((clk.nowMs + e.endsInDays * DAY_MS - startedAt.getTime()) / DAY_MS));
  let endsAt = new Date(startedAt.getTime() + totalDays * DAY_MS);
  const extendedAt = e.extend ? at(clk, e.extend.daysAgo, startedAt) : null;
  let endedAt: Date | null = null;
  if (e.end?.reason === "EXPIRED") {
    endsAt = new Date(Math.min(endsAt.getTime(), clk.nowMs - 20 * MIN_MS));
    totalDays = Math.max(1, Math.round((endsAt.getTime() - startedAt.getTime()) / DAY_MS));
    endedAt = new Date(endsAt.getTime() + 7 * MIN_MS); // cron `mentor.expire` chạy mỗi 15 phút
  } else if (e.end) {
    endedAt = at(clk, e.end.daysAgo ?? 1, startedAt);
  }
  const channelIds = [...new Set([...e.channels.map((n) => channels.get(normalizeSearch(n))), ws.defaultChannelId].filter((id): id is string => Boolean(id)))];
  const mentorId = app.applicantId;
  const soon = e.endingSoon && !e.end && endsAt.getTime() - clk.nowMs <= 3 * DAY_MS;
  return {
    id: newObjectId(), mentorId, acceptedBy: app.reviewedBy, channelIds, startedAt, endsAt, totalDays, endedAt,
    endedReason: e.end?.reason ?? null,
    endedBy: e.end?.reason === "LEFT_BY_MENTOR" ? mentorId : e.end?.reason === "ENDED_BY_OWNER" ? app.reviewedBy : null,
    endingSoonAt: soon ? new Date(Math.min(clk.nowMs - 10 * MIN_MS, endsAt.getTime() - 3 * DAY_MS + 3_600_000)) : null,
    version: 1 + (e.extend ? 1 : 0) + (e.end ? 1 : 0),
    updatedAt: endedAt ?? extendedAt ?? startedAt,
    active: !e.end,
  };
}

/** Ghi bài + đơn + đợt cố vấn (+ khách GUEST, grant kênh) trong MỘT transaction — bài đã có thì mọi con đã đủ. */
async function writeGraph(tx: Prisma.TransactionClient, c: ModuleCtx, ws: WorkspaceCtx, spec: PostSpec, p: PostPlan, createdBy: string, normalizedTitle: string, st: Stats): Promise<void> {
  const { skills, labels } = normalizeSkills(spec.skills);
  await tx.mentorPost.create({
    data: {
      id: p.id, workspaceId: ws.id, createdBy, title: spec.title, normalizedTitle, description: spec.description, skills, skillLabels: labels,
      commitmentHoursPerWeek: spec.hours, mentorsNeeded: spec.needed, activeEngagements: p.active, status: p.status, applicantsCount: p.apps.length,
      expiresAt: new Date(p.createdAt.getTime() + spec.expiresInDays * DAY_MS), reportedCount: 0, hiddenAt: null, hiddenBy: null, hiddenReason: null,
      version: p.version, createdAt: p.createdAt, updatedAt: p.updatedAt, closedAt: p.closedAt,
    },
  });
  for (const a of p.apps) {
    await tx.mentorApplication.create({
      data: {
        id: a.id, postId: p.id, workspaceId: ws.id, applicantId: a.applicantId, message: a.spec.message, portfolioUrl: a.spec.portfolio ?? null, status: a.spec.status,
        reviewedBy: a.reviewedBy, reviewedAt: a.reviewedAt, rejectReason: a.reason, createdAt: a.createdAt, updatedAt: a.updatedAt,
      },
    });
    st.apps += 1;
    if (a.spec.status === "PENDING") st.pending += 1;
    if (a.spec.status === "ACCEPTED") st.accepted += 1;
    if (a.eng) await writeEngagement(tx, ws, p, a, a.eng, st);
  }
}

async function writeEngagement(tx: Prisma.TransactionClient, ws: WorkspaceCtx, p: PostPlan, a: AppPlan, e: EngPlan, st: Stats): Promise<void> {
  // Như `grantGuestInTx`: upsert membership GUEST (có hạn, nhãn MENTOR, expiryVersion+1). Đợt đã kết thúc → trạng thái sau `revokeGuestBySystem`.
  const shared = {
    role: "GUEST" as const, joinedAt: e.startedAt, removedBy: null, banReason: null, expiresAt: e.endsAt, invitedBy: e.acceptedBy, invitationId: null,
    requestMessage: null, requestedAt: null, decidedBy: null, decidedAt: null,
    ...(e.active
      ? { status: "ACTIVE" as const, leftAt: null, leftReason: null, displayTag: MENTOR_DISPLAY_TAG }
      : { status: e.endedReason === "LEFT_BY_MENTOR" ? ("LEFT" as const) : ("REMOVED" as const), leftAt: new Date((e.endedAt as Date).getTime() + 30_000), leftReason: LEAVE_REASON[e.endedReason as EndReason], displayTag: null }),
  };
  await tx.workspaceMembership.upsert({
    where: { workspaceId_userId: { workspaceId: ws.id, userId: e.mentorId } },
    create: { workspaceId: ws.id, userId: e.mentorId, expiryVersion: 1, ...shared },
    update: { ...shared, expiryVersion: { increment: 1 } },
  });
  if (e.active) {
    await tx.workspace.update({ where: { id: ws.id }, data: { memberCount: { increment: 1 } } });
    await tx.workspace.updateMany({ where: { id: ws.id, lastActivityAt: { lt: e.startedAt } }, data: { lastActivityAt: e.startedAt } });
    st.guests += 1;
    for (const channelId of e.channelIds) {
      // Như `ChannelGrantPortService.grantMemberInTx`: grant DIRECT MEMBER + ChannelMembership + tính lại `memberCount` kênh.
      if (!(await tx.channelGrant.findFirst({ where: { channelId, userId: e.mentorId, source: "DIRECT" }, select: { id: true } }))) {
        await tx.channelGrant.create({ data: { channelId, workspaceId: ws.id, userId: e.mentorId, subjectKey: e.mentorId, level: "MEMBER", grantedBy: e.acceptedBy, createdAt: e.startedAt } });
        st.grants += 1;
      }
      await tx.channelMembership.upsert({
        where: { channelId_userId: { channelId, userId: e.mentorId } },
        create: { channelId, workspaceId: ws.id, userId: e.mentorId, joinedAt: e.startedAt },
        update: {},
      });
      await tx.channel.update({ where: { id: channelId }, data: { memberCount: await tx.channelMembership.count({ where: { channelId } }) } });
    }
  }
  await tx.mentorEngagement.create({
    data: {
      id: e.id, postId: p.id, applicationId: a.id, workspaceId: ws.id, mentorId: e.mentorId, acceptedBy: e.acceptedBy, channelIds: e.channelIds, conversationId: null,
      startedAt: e.startedAt, endsAt: e.endsAt, totalDays: e.totalDays, status: e.active ? "ACTIVE" : "ENDED", endedAt: e.endedAt, endedReason: e.endedReason,
      endedBy: e.endedBy, endingSoonNotifiedAt: e.endingSoonAt, version: e.version, createdAt: e.startedAt, updatedAt: e.updatedAt,
    },
  });
  st.engagements += 1;
  if (!e.active) st.ended += 1;
}

/** Nhóm chat "Cố vấn · <bài>" cho từng đợt (như job `mentor.accepted-effects`/`ended-effects`): tin hệ thống + vài tin chat + mốc đọc. Idempotent theo `meetingKey`. */
async function seedChats(c: ModuleCtx, ws: WorkspaceCtx, spec: PostSpec, post: MentorPost, st: Stats): Promise<void> {
  const engs = await prisma.mentorEngagement.findMany({ where: { postId: post.id } });
  for (const e of engs) {
    const chat = spec.apps.find((a) => c.dir.id(a.who) === e.mentorId)?.engagement?.chat;
    if (!chat) continue;
    st.chats += await ensureChat(c, ws, post, e, chat, st);
  }
}

async function ensureChat(c: ModuleCtx, ws: WorkspaceCtx, post: MentorPost, e: MentorEngagement, chat: ChatSpec, st: Stats): Promise<number> {
  const meetingKey = `x:mentor:${e.id}`;
  const ended = e.status === "ENDED";
  const ownerId = e.acceptedBy;
  const memberIds = [...new Set([post.createdBy, ...chat.include.filter((k) => ws.roles.has(k)).map((k) => c.dir.id(k))])].filter((id) => id !== ownerId);
  const at0 = new Date(e.startedAt.getTime() + 20_000);
  let conv = await prisma.conversation.findUnique({ where: { meetingKey } });
  let created = 0;
  if (!conv) {
    const id = newObjectId();
    const title = `Cố vấn · ${post.title}`.trim().slice(0, 80);
    const normalizedTitle = normalizeSearch(title);
    const everyone = [ownerId, ...memberIds, e.mentorId];
    conv = await prisma.conversation.create({
      data: {
        id, kind: "GROUP", workspaceId: ws.id, meetingId: null, meetingKey, directKey: `g:${id}`, title, normalizedTitle, avatarAssetId: null, ownerId, createdBy: ownerId, status: "ACTIVE",
        settings: { membersCanAdd: false, memberCanPin: false, mentionAllRole: "ADMIN" }, allowGuests: true, lastSeq: 0, lastMessageAt: null, lastMessageId: null, activityAt: at0,
        memberCount: ended ? everyone.length - 1 : everyone.length, archivedAt: null, dissolvedAt: null, dissolvedBy: null, dissolveReason: null, createdAt: at0,
      },
    });
    await prisma.conversationMember.createMany({
      data: everyone.map((userId) => {
        const gone = ended && userId === e.mentorId;
        return {
          conversationId: id, userId, kind: "GROUP" as const, workspaceId: ws.id, role: userId === ownerId ? ("OWNER" as const) : ("MEMBER" as const),
          status: gone ? ("REMOVED" as const) : ("ACTIVE" as const), peerUserId: null, joinedAt: at0, leftAt: gone ? e.endedAt : null, addedBy: userId === ownerId ? null : ownerId,
          lastReadAt: null, notifyMode: "INHERIT" as const, mutedUntil: null, pinnedAt: null, archivedAt: null, hiddenBeforeSeq: 0, activityAt: at0, searchText: normalizedTitle,
        };
      }),
    });
    created = 1;
  }

  const scope: ScopeRef = { type: "CONVERSATION", id: conv.id, workspaceId: ws.id };
  const sys = (type: string, payload: Record<string, unknown>, key: string, at: Date) => postSystemMessage(scope, type as SystemType, payload, key, at);
  const before = await tailOf(conv.id);
  await sys("CONVERSATION_CREATED", { actorId: ownerId }, `conv-created:${conv.id}`, at0);
  if (memberIds.length > 0) await sys("MEMBER_ADDED", { actorId: ownerId, userIds: memberIds }, `conv-member-added:${conv.id}:create`, new Date(at0.getTime() + 1000));
  await sys("MENTOR_JOINED", { mentorId: e.mentorId, endsAt: e.endsAt.toISOString() }, `mentor-joined:${e.id}`, new Date(at0.getTime() + 2000));

  const rng = rngFrom(`mentor-chat:${e.id}`);
  const until = e.endedAt ? e.endedAt.getTime() - 40 * MIN_MS : c.now.getTime() - (0.2 + rng() * 1.2) * DAY_MS;
  await postScript({ dir: c.dir, scope, baseKey: `mentor:${e.id}`, lines: chat.lines, from: new Date(at0.getTime() + 3 * 3_600_000), to: new Date(until), now: c.now });
  if (ended && e.endedAt && e.endedReason) {
    const left = e.endedAt.getTime() + 30_000;
    await sys("MEMBER_REMOVED", { actorId: e.mentorId, userIds: [e.mentorId] }, `conv-member-removed:${conv.id}:${e.mentorId}:system`, new Date(left));
    await sys("MENTOR_LEFT", { mentorId: e.mentorId, reason: LEAVE_REASON[e.endedReason as EndReason] }, `mentor-left:${e.id}`, new Date(left + 1000));
  }

  const after = await tailOf(conv.id);
  if (after && after.seq > (before?.seq ?? 0)) {
    st.messages += after.seq - (before?.seq ?? 0);
    await finishChat(c, conv.id, after, ended ? 0 : (chat.unreadForThu ?? 0), e.mentorId, ended);
  }
  await prisma.mentorEngagement.updateMany({ where: { id: e.id, conversationId: null }, data: { conversationId: conv.id } });
  return created;
}

const tailOf = (conversationId: string) =>
  prisma.message.findFirst({ where: { scopeType: "CONVERSATION", scopeId: conversationId, threadKey: "root" }, orderBy: { seq: "desc" }, select: { id: true, seq: true, createdAt: true } });

/** Mốc đọc của từng thành viên + `lastSeq/lastMessageAt` của hội thoại (các tin hệ thống đăng thẳng nên không tự cập nhật). */
async function finishChat(c: ModuleCtx, conversationId: string, last: { id: string; seq: number; createdAt: Date }, thuUnread: number, mentorId: string, ended: boolean): Promise<void> {
  await prisma.conversation.updateMany({ where: { id: conversationId, lastSeq: { lt: last.seq } }, data: { lastSeq: last.seq, lastMessageAt: last.createdAt, lastMessageId: last.id, activityAt: last.createdAt } });
  await prisma.conversationMember.updateMany({ where: { conversationId, status: "ACTIVE" }, data: { lastReadSeq: last.seq, lastReadAt: last.createdAt, unreadCount: 0, mentionsSinceRead: 0, activityAt: last.createdAt } });
  if (ended) await prisma.conversationMember.updateMany({ where: { conversationId, userId: mentorId }, data: { lastReadSeq: Math.max(0, last.seq - 2), unreadCount: 0 } });
  if (thuUnread > 0) {
    await prisma.conversationMember.updateMany({
      where: { conversationId, userId: c.dir.id("thu"), status: "ACTIVE" },
      data: { lastReadSeq: last.seq - thuUnread, lastReadAt: new Date(last.createdAt.getTime() - 3_600_000), unreadCount: thuUnread },
    });
  }
}

/** Hộp thư của `thu` (chủ/quản trị nhóm): `mentor.application` mỗi đơn mới; `mentor.accepted` (nhóm) khi người khác duyệt đơn vào bài của thu. Theo `notify()`: recipient.dedupeKey = id nguồn. */
async function seedThuNotifications(c: ModuleCtx, seeded: ReadonlyArray<{ ws: WorkspaceCtx; postId: string }>, st: Stats): Promise<void> {
  const thuId = c.dir.id("thu");
  const nowMs = c.now.getTime();
  const put = async (d: { type: string; ws: WorkspaceCtx; actorId: string; sourceType: string; sourceId: string; refs: Prisma.InputJsonObject; dedupeKey: string; at: Date; unread: boolean }) => {
    if (await prisma.notification.findUnique({ where: { dedupeKey: d.dedupeKey }, select: { id: true } })) return;
    await prisma.notification.create({
      data: {
        type: d.type, scopeType: "WORKSPACE", scopeId: d.ws.id, workspaceId: d.ws.id, actorId: d.actorId, sourceType: d.sourceType, sourceId: d.sourceId, refs: d.refs, dedupeKey: d.dedupeKey, createdAt: d.at,
        recipients: {
          create: {
            recipientId: thuId, kind: "DEFAULT", inInbox: true, dedupeKey: d.sourceId, scopeType: "WORKSPACE", scopeId: d.ws.id, workspaceId: d.ws.id,
            readAt: d.unread ? null : new Date(Math.min(d.at.getTime() + 3 * 3_600_000, nowMs - MIN_MS)), seenAt: null,
            // SKIPPED/NO_DEVICE: dữ liệu mẫu không phát push thật.
            pushStatus: "SKIPPED", skipReason: "NO_DEVICE", deliveredPushAt: null, createdAt: new Date(d.at.getTime() + 500),
            kindRank: 0, streamKey: null, streamSeq: null, filterBucket: "all", cancelledAt: null,
          },
        },
      },
    });
    st.notifs += 1;
  };

  for (const { ws, postId } of seeded) {
    const role = ws.roles.get("thu");
    if (!isAdmin(role)) continue;
    // Chủ nhóm có mặt từ lúc tạo nhóm; quản trị viên thì từ lúc vào nhóm — không có thông báo cũ hơn thế.
    const since = role === "OWNER" ? ws.createdAt : ((await prisma.workspaceMembership.findUnique({ where: { workspaceId_userId: { workspaceId: ws.id, userId: thuId } }, select: { joinedAt: true } }))?.joinedAt ?? ws.createdAt);
    const post = await prisma.mentorPost.findUniqueOrThrow({ where: { id: postId } });
    const apps: MentorApplication[] = await prisma.mentorApplication.findMany({ where: { postId }, orderBy: { createdAt: "asc" } });
    for (const a of apps) {
      if (a.applicantId === thuId || a.createdAt < since) continue;
      await put({
        type: "mentor.application", ws, actorId: a.applicantId, sourceType: "MentorApplication", sourceId: a.id, refs: { workspaceId: ws.id, postId, applicationId: a.id },
        dedupeKey: `mentor.application:${a.id}`, at: a.createdAt, unread: a.status === "PENDING" && nowMs - a.createdAt.getTime() < 6 * DAY_MS,
      });
    }
    if (post.createdBy !== thuId) continue;
    for (const e of await prisma.mentorEngagement.findMany({ where: { postId }, orderBy: { startedAt: "asc" } })) {
      if (e.acceptedBy === thuId || e.startedAt < since) continue;
      await put({
        type: "mentor.accepted", ws, actorId: e.mentorId, sourceType: "MentorEngagement", sourceId: e.id,
        refs: { workspaceId: ws.id, postId, engagementId: e.id, ...(e.conversationId && { conversationId: e.conversationId }) },
        dedupeKey: `mentor.accepted:${e.id}:team`, at: new Date(e.startedAt.getTime() + 90_000), unread: false,
      });
    }
  }
}
