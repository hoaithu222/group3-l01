import type { Prisma } from "@prisma/client";
import { normalizeSearch } from "../../../src/core/utils/normalize";
import { newObjectId } from "../../../src/core/utils/object-id";
import { nanoid } from "../../../src/core/utils/nanoid";
import { extractLinks, normalize as normalizeContent } from "../../../src/modules/messages/services/markdown-lite";
import type { Line, PersonKey, PollSpec } from "../types";
import { Directory, MIN_MS, excerpt, prisma, rngFrom, spreadTimes } from "./core";

export interface ScopeRef {
  type: "CHANNEL" | "CONVERSATION";
  id: string;
  workspaceId: string | null;
}

export interface PostedMessage {
  id: string;
  seq: number;
  by: PersonKey;
  createdAt: Date;
  mentionKeys: PersonKey[];
  /** Văn bản thuần (đã thay `{@khoá}` bằng `@Tên`) — dùng cho thông báo. */
  plain: string;
  /** `true` khi tin vừa được tạo ở lần chạy này (tin đã có từ lần seed trước thì `false`). */
  fresh: boolean;
}

export interface PostOptions {
  dir: Directory;
  scope: ScopeRef;
  /** Khoá ổn định của kịch bản (vd `frontend:html-css`) — ghép vào `clientMessageId` để chạy lại không tạo trùng. */
  baseKey: string;
  lines: readonly Line[];
  from: Date;
  to: Date;
  now: Date;
  /** Ai ghim tin (mặc định: chính tác giả). */
  pinnedBy?: PersonKey;
}

const MENTION_RE = /\{@([a-z0-9_]+)\}/g;

interface Rendered {
  content: string;
  normalizedContent: string;
  plain: string;
  mentions: Array<{ type: "USER"; targetId: string; label: string; roleRef: null }>;
  mentionKeys: PersonKey[];
}

/** `{@khoá}` → marker `@{u:<id>}` đúng định dạng app lưu, kèm mảng `mentions`. */
export function renderText(dir: Directory, text: string): Rendered {
  const keys: PersonKey[] = [];
  const content = normalizeContent(
    text.replace(MENTION_RE, (_m, k: string) => {
      if (!keys.includes(k)) keys.push(k);
      return `@{u:${dir.id(k)}}`;
    })
  );
  const plain = normalizeContent(text.replace(MENTION_RE, (_m, k: string) => `@${dir.name(k)}`));
  return {
    content,
    normalizedContent: normalizeSearch(plain),
    plain,
    mentions: keys.map((k) => ({ type: "USER" as const, targetId: dir.id(k), label: dir.name(k), roleRef: null })),
    mentionKeys: keys,
  };
}

/**
 * Cấp một dải `count` số thứ tự liên tiếp cho luồng `threadKey` bằng MỘT lệnh nguyên tử (cùng cơ chế
 * `MessageRepository.nextSeq`, chỉ tăng `count` một lần). Trả về số đầu tiên của dải.
 */
export async function allocateSeqs(scope: ScopeRef, threadKey: string, count: number): Promise<number> {
  const key = `msg:${scope.type}:${scope.id}:${threadKey}`;
  const result = (await prisma.$runCommandRaw({
    findAndModify: "Counter",
    query: { key },
    update: { $inc: { seq: count }, $setOnInsert: { key } },
    upsert: true,
    new: true,
  })) as unknown as { value: { seq: number } | null };
  if (!result.value) throw new Error(`Không cấp được số thứ tự cho ${key}`);
  return result.value.seq - count + 1;
}

interface Draft {
  index: number;
  id: string;
  by: PersonKey;
  line: Line;
  createdAt: Date;
  seq: number;
  rendered: Rendered;
  replyToId: string | null;
}

/**
 * Đăng một kịch bản hội thoại vào kênh/hội thoại: tin, trả lời, ghim, đã sửa, cảm xúc, khảo sát, luồng (thread).
 * Idempotent theo `dedupeKey` từng dòng — dòng đã có thì bỏ qua (vẫn trả về để các bước sau dùng).
 */
export async function postScript(o: PostOptions): Promise<PostedMessage[]> {
  const { dir, scope, lines } = o;
  if (lines.length === 0) return [];
  const clientIds = lines.map((_l, i) => `seed-rich:${o.baseKey}:${i}`);
  const dedupeKeys = lines.map((l, i) => `u:${dir.id(l[0])}:${clientIds[i]}`);

  const existing = await prisma.message.findMany({
    where: { dedupeKey: { in: dedupeKeys } },
    select: { id: true, dedupeKey: true, seq: true, createdAt: true },
  });
  const existingByKey = new Map(existing.map((m) => [m.dedupeKey, m]));

  const missing = lines.map((_l, i) => i).filter((i) => !existingByKey.has(dedupeKeys[i]));
  const rng = rngFrom(`times:${o.baseKey}`);
  const to = o.to.getTime() > o.from.getTime() ? o.to : new Date(o.from.getTime() + (missing.length + 1) * 40_000);
  const times = spreadTimes(missing.length, o.from, to, rng);
  const firstSeq = missing.length > 0 ? await allocateSeqs(scope, "root", missing.length) : 0;

  const idByIndex = new Map<number, string>();
  lines.forEach((_l, i) => idByIndex.set(i, existingByKey.get(dedupeKeys[i])?.id ?? newObjectId()));

  const drafts: Draft[] = missing.map((index, k) => {
    const line = lines[index];
    const replyIdx = line[2]?.reply;
    if (replyIdx !== undefined && !(replyIdx >= 0 && replyIdx < index)) {
      throw new Error(`[${o.baseKey}] dòng ${index}: reply=${replyIdx} không trỏ tới dòng đứng trước`);
    }
    return {
      index,
      id: idByIndex.get(index) as string,
      by: line[0],
      line,
      createdAt: times[k],
      seq: firstSeq + k,
      rendered: renderText(dir, line[1]),
      replyToId: replyIdx !== undefined ? (idByIndex.get(replyIdx) as string) : null,
    };
  });

  const created = new Map<number, Draft>();
  const messageRows: Prisma.MessageCreateManyInput[] = [];
  for (const d of drafts) {
    created.set(d.index, d);
    messageRows.push(buildRow(o, d, lines, clientIds, created));
  }
  for (let i = 0; i < messageRows.length; i += 100) {
    await prisma.message.createMany({ data: messageRows.slice(i, i + 100) });
  }

  await writeReactions(o, drafts);
  await writePolls(o, drafts);
  await writeThreads(o, drafts, clientIds);

  const last = drafts[drafts.length - 1];
  if (last) {
    const data = { lastSeq: last.seq, lastMessageAt: last.createdAt, lastMessageId: last.id };
    if (scope.type === "CHANNEL") await prisma.channel.updateMany({ where: { id: scope.id, lastSeq: { lt: last.seq } }, data });
    else await prisma.conversation.updateMany({ where: { id: scope.id, lastSeq: { lt: last.seq } }, data: { ...data, activityAt: last.createdAt } });
  }

  const draftByIndex = new Map(drafts.map((d) => [d.index, d]));
  return lines.map((l, i): PostedMessage => {
    const d = draftByIndex.get(i);
    const old = existingByKey.get(dedupeKeys[i]);
    const r = d?.rendered ?? renderText(dir, l[1]);
    return {
      id: idByIndex.get(i) as string,
      seq: d?.seq ?? old?.seq ?? 0,
      by: l[0],
      createdAt: d?.createdAt ?? old?.createdAt ?? o.from,
      mentionKeys: r.mentionKeys,
      plain: r.plain,
      fresh: d !== undefined,
    };
  });
}

/** Tin hệ thống (vd "X đã tạo nhóm") — giống `SystemMessageService.post`: không tác giả, `dedupeKey` dạng `s:<khoá>`, idempotent. */
export async function postSystemMessage(
  scope: ScopeRef,
  systemType: "CONVERSATION_CREATED" | "MEMBER_ADDED",
  payload: Record<string, unknown>,
  dedupeKey: string,
  at: Date
): Promise<void> {
  const key = `s:${dedupeKey}`;
  if (await prisma.message.findUnique({ where: { dedupeKey: key }, select: { id: true } })) return;
  const seq = await allocateSeqs(scope, "root", 1);
  await prisma.message.create({
    data: {
      scopeType: scope.type,
      scopeId: scope.id,
      workspaceId: scope.workspaceId,
      threadId: null,
      threadKey: "root",
      seq,
      authorId: null,
      kind: "SYSTEM",
      systemType,
      systemPayload: payload as Prisma.InputJsonValue,
      dedupeKey: key,
      content: null,
      normalizedContent: null,
      deletedAt: null,
      deletedBy: null,
      pinnedAt: null,
      pinnedBy: null,
      editedAt: null,
      createdAt: at,
      updatedAt: at,
    },
  });
}

function buildRow(
  o: PostOptions,
  d: Draft,
  lines: readonly Line[],
  clientIds: string[],
  created: Map<number, Draft>
): Prisma.MessageCreateManyInput {
  const { dir, scope } = o;
  const opts = d.line[2];
  const authorId = dir.id(d.by);
  const reactions = summarizeReactions(opts?.react);
  let replyPreview: Prisma.MessageCreateManyInput["replyPreview"];
  if (d.replyToId && opts?.reply !== undefined) {
    const target = created.get(opts.reply);
    const targetLine = lines[opts.reply];
    const plain = target?.rendered.plain ?? renderText(dir, targetLine[1]).plain;
    replyPreview = { authorId: dir.id(targetLine[0]), excerpt: excerpt(plain, 120), kind: "TEXT", deleted: false };
  }
  const pinnedAt = opts?.pin ? new Date(d.createdAt.getTime() + 6 * MIN_MS) : null;
  const editedAt = opts?.edited ? new Date(d.createdAt.getTime() + 4 * MIN_MS) : null;
  return {
    id: d.id,
    scopeType: scope.type,
    scopeId: scope.id,
    workspaceId: scope.workspaceId,
    threadId: null,
    threadKey: "root",
    seq: d.seq,
    authorId,
    kind: opts?.poll ? "POLL" : "USER",
    clientMessageId: clientIds[d.index],
    dedupeKey: `u:${authorId}:${clientIds[d.index]}`,
    content: d.rendered.content,
    normalizedContent: d.rendered.normalizedContent,
    mentions: d.rendered.mentions,
    attachments: [],
    links: extractLinks(d.rendered.content),
    replyToId: d.replyToId,
    ...(replyPreview ? { replyPreview } : {}),
    reactionsSummary: reactions,
    pinnedAt,
    pinnedBy: pinnedAt ? dir.id(o.pinnedBy ?? d.by) : null,
    editedAt,
    version: editedAt ? 2 : 1,
    deletedAt: null,
    deletedBy: null,
    createdAt: d.createdAt,
    updatedAt: editedAt ?? d.createdAt,
  };
}

/** `reactionsSummary` — theo số người giảm dần, hoà thì giữ thứ tự khai báo. */
function summarizeReactions(react: Record<string, PersonKey[]> | undefined): Array<{ emoji: string; count: number }> {
  return Object.entries(react ?? {})
    .map(([emoji, people]) => ({ emoji, count: new Set(people).size }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);
}

async function writeReactions(o: PostOptions, drafts: Draft[]): Promise<void> {
  const rows: Prisma.MessageReactionCreateManyInput[] = [];
  const rng = rngFrom(`react:${o.baseKey}`);
  for (const d of drafts) {
    for (const [emoji, people] of Object.entries(d.line[2]?.react ?? {})) {
      for (const key of new Set(people)) {
        const at = Math.min(d.createdAt.getTime() + (1 + rng() * 40) * MIN_MS, o.now.getTime());
        rows.push({ messageId: d.id, scopeType: o.scope.type, scopeId: o.scope.id, userId: o.dir.id(key), emoji, createdAt: new Date(at) });
      }
    }
  }
  for (let i = 0; i < rows.length; i += 200) await prisma.messageReaction.createMany({ data: rows.slice(i, i + 200) });
}

async function writePolls(o: PostOptions, drafts: Draft[]): Promise<void> {
  const rng = rngFrom(`poll:${o.baseKey}`);
  for (const d of drafts) {
    const spec: PollSpec | undefined = d.line[2]?.poll;
    if (!spec) continue;
    if (spec.votes.length !== spec.options.length) throw new Error(`[${o.baseKey}] poll "${d.line[1]}": số mảng votes ≠ số options`);
    const options = spec.options.map((text, i) => ({ id: nanoid(8), text, voteCount: new Set(spec.votes[i]).size, addedBy: null }));
    const voters = new Map<PersonKey, string[]>();
    spec.votes.forEach((people, i) => people.forEach((p) => voters.set(p, [...(voters.get(p) ?? []), options[i].id])));
    const closesAt = spec.closesInDays ? new Date(d.createdAt.getTime() + spec.closesInDays * 86_400_000) : null;
    const closed = closesAt !== null && closesAt.getTime() <= o.now.getTime();
    const poll = await prisma.poll.create({
      data: {
        messageId: d.id,
        scopeType: o.scope.type,
        scopeId: o.scope.id,
        threadId: null,
        workspaceId: o.scope.workspaceId,
        createdBy: o.dir.id(d.by),
        question: d.rendered.plain,
        normalizedQuestion: d.rendered.normalizedContent,
        options,
        multi: Boolean(spec.multi),
        anonymous: false,
        allowAddOptions: false,
        closesAt,
        status: closed ? "CLOSED" : "OPEN",
        closedAt: closed ? closesAt : null,
        closedBy: null,
        closeReason: closed ? "EXPIRED" : null,
        voterCount: voters.size,
        createdAt: d.createdAt,
      },
    });
    const votes = [...voters].map(([key, optionIds]) => {
      const at = new Date(Math.min(d.createdAt.getTime() + (2 + rng() * 120) * MIN_MS, o.now.getTime()));
      return { pollId: poll.id, userId: o.dir.id(key), optionIds, createdAt: at, updatedAt: at };
    });
    if (votes.length > 0) await prisma.pollVote.createMany({ data: votes });
  }
}

async function writeThreads(o: PostOptions, drafts: Draft[], clientIds: string[]): Promise<void> {
  const { dir, scope } = o;
  for (const d of drafts) {
    const replies = d.line[2]?.thread;
    if (!replies || replies.length === 0) continue;
    if (scope.type !== "CHANNEL") throw new Error(`[${o.baseKey}] thread chỉ dùng được trong kênh`);
    if (await prisma.thread.findUnique({ where: { parentMessageId: d.id } })) continue;

    const rng = rngFrom(`thread:${o.baseKey}:${d.index}`);
    let t = d.createdAt.getTime();
    const times = replies.map(() => {
      t += (2 + rng() * 25) * MIN_MS;
      return new Date(Math.min(t, o.now.getTime() - 60_000));
    });
    const first = await allocateSeqs(scope, d.id, replies.length);
    const rows: Prisma.MessageCreateManyInput[] = replies.map(([by, text], i) => {
      const r = renderText(dir, text);
      const authorId = dir.id(by);
      const clientMessageId = `${clientIds[d.index]}:t${i}`;
      return {
        scopeType: scope.type,
        scopeId: scope.id,
        workspaceId: scope.workspaceId,
        threadId: d.id,
        threadKey: d.id,
        seq: first + i,
        authorId,
        kind: "USER",
        clientMessageId,
        dedupeKey: `u:${authorId}:${clientMessageId}`,
        content: r.content,
        normalizedContent: r.normalizedContent,
        mentions: r.mentions,
        attachments: [],
        links: extractLinks(r.content),
        replyToId: null,
        reactionsSummary: [],
        pinnedAt: null,
        pinnedBy: null,
        editedAt: null,
        deletedAt: null,
        deletedBy: null,
        createdAt: times[i],
        updatedAt: times[i],
      };
    });
    await prisma.message.createMany({ data: rows });

    const repliers = [...new Set(replies.map(([by]) => by))];
    const newestFirst = [...replies].reverse().map(([by]) => dir.id(by));
    const lastReplierIds = [...new Set(newestFirst)].slice(0, 3);
    const thread = await prisma.thread.create({
      data: {
        workspaceId: scope.workspaceId as string,
        channelId: scope.id,
        parentMessageId: d.id,
        parentAuthorId: dir.id(d.by),
        replyCount: replies.length,
        lastReplySeq: first + replies.length - 1,
        lastReplyAt: times[times.length - 1],
        lastReplierIds,
        subscriberCount: repliers.length,
        createdAt: times[0],
      },
    });
    await prisma.threadSubscription.createMany({
      data: repliers.map((by) => ({ threadId: thread.id, channelId: scope.id, userId: dir.id(by), state: "AUTO_ON" as const, createdAt: times[0] })),
    });
  }
}
