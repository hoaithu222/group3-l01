/**
 * Tích hợp GitHub HƯ CẤU (module `integrations`) — chỉ phần an toàn: GitHub App không lưu token (`credentials: null`, `webhookSecretHash: null`, không hook ngoài) nên không
 * cần bí mật nào. Ghi `Integration` + nhật ký `WebhookEvent` đã xử lý, mỗi sự kiện kèm tin hệ thống `INTEGRATION` trong kênh "GitHub" (nội dung do CHÍNH mapper của BE dựng từ
 * payload nên "Phát lại" vẫn cho ra tin tương ứng). Bỏ qua: Google Calendar (`UserIntegration`/`CalendarEventLink` cần token), GitLab/Figma (cần secret/token mã hoá).
 * Không outbox, không gọi GitHub. Lưu ý: cron `integrations.health-check` sẽ chuyển kết nối này sang REVOKED nếu 30 ngày không có sự kiện (installation giả không tồn tại).
 */
import { createHash } from "crypto";
import type { Prisma } from "@prisma/client";
import { newObjectId } from "../../../../src/core/utils/object-id";
import { parseSystemPayload } from "../../../../src/modules/messages/dtos/system-payload.schemas";
import { mapGithubEvent } from "../../../../src/modules/integrations/providers/event-mappers/github.mapper";
import { payloadForStorage } from "../../../../src/modules/integrations/providers/payload-redactor";
import { DAY_MS, MIN_MS, prisma } from "../core";
import type { ModuleCtx } from "../module-ctx";
import { ensureAuxChannel, setReadMark } from "./extras-channels";
import { INTEGRATIONS, type GithubEvent, type IntegrationSeed } from "./extras-integrations.content";
import { atIct } from "./ict";

export interface IntegrationTally {
  integrations: number;
  events: number;
  messages: number;
  channels: number;
  skipped: string[];
}

const sha = (text: string, algo: "sha1" | "sha256"): string => createHash(algo).update(text).digest("hex");

/** Mã giao hàng dạng UUID (như `X-GitHub-Delivery`), tất định theo khoá. */
function deliveryId(key: string): string {
  const h = sha(key, "sha1");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** Payload GitHub (đã lọc như `payloadForStorage`) của một sự kiện; `type` là tên sự kiện GitHub. */
function payloadOf(seed: IntegrationSeed, ev: GithubEvent, index: number): { type: string; payload: Record<string, unknown> } {
  const repo = seed.repos[ev.repo];
  const repository = { id: Number(repo.id), name: repo.fullName.split("/")[1], full_name: repo.fullName };
  const sender = { login: ev.who };
  switch (ev.kind) {
    case "push": {
      const commits = ev.commits.map((message, i) => ({ id: sha(`${repo.fullName}:${index}:${i}`, "sha1"), message }));
      return { type: "push", payload: { ref: `refs/heads/${ev.branch}`, created: ev.created === true, deleted: false, forced: false, commits, size: commits.length, repository, sender } };
    }
    case "pr": {
      const pull_request = { number: ev.number, title: ev.title, merged: ev.action === "merged", ...(ev.mergedBy ? { merged_by: { login: ev.mergedBy } } : {}), base: { ref: "main" }, head: { ref: ev.head } };
      return { type: "pull_request", payload: { action: ev.action === "merged" ? "closed" : ev.action, number: ev.number, pull_request, repository, sender } };
    }
    case "issue":
      return { type: "issues", payload: { action: ev.action, issue: { number: ev.number, title: ev.title }, repository, sender } };
    case "release":
      return { type: "release", payload: { action: "published", release: { tag_name: ev.tag, name: ev.name }, repository, sender } };
  }
}

/** Cấp số thứ tự kế tiếp của luồng gốc kênh bằng lệnh nguyên tử (cùng cơ chế `MessageRepository.nextSeq`). */
async function nextSeq(channelId: string): Promise<number> {
  const key = `msg:CHANNEL:${channelId}:root`;
  const result = (await prisma.$runCommandRaw({ findAndModify: "Counter", query: { key }, update: { $inc: { seq: 1 }, $setOnInsert: { key } }, upsert: true, new: true })) as unknown as { value: { seq: number } | null };
  if (!result.value) throw new Error(`Không cấp được số thứ tự cho ${key}`);
  return result.value.seq;
}

/** Tin hệ thống `INTEGRATION` như `SystemMessageService.post` (dedupe `s:int:<webhookEventId>`), nhưng không xếp outbox/realtime. */
async function postIntegrationMessage(channelId: string, workspaceId: string, rowId: string, payload: unknown, at: Date): Promise<{ id: string; seq: number }> {
  const dedupeKey = `s:int:${rowId}`;
  const existing = await prisma.message.findUnique({ where: { dedupeKey }, select: { id: true, seq: true } });
  if (existing) return existing;
  const validated = parseSystemPayload("INTEGRATION", payload) as Prisma.InputJsonValue;
  const seq = await nextSeq(channelId);
  const created = await prisma.message.create({
    data: {
      scopeType: "CHANNEL",
      scopeId: channelId,
      workspaceId,
      threadId: null,
      threadKey: "root",
      seq,
      authorId: null,
      kind: "SYSTEM",
      systemType: "INTEGRATION",
      systemPayload: validated,
      dedupeKey,
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
    select: { id: true },
  });
  await prisma.channel.updateMany({ where: { id: channelId, lastSeq: { lt: seq } }, data: { lastSeq: seq, lastMessageAt: at, lastMessageId: created.id } });
  return { id: created.id, seq };
}

/** Thời điểm từng sự kiện: theo `d`/`h`/`m` của nội dung; nếu kết nối được tạo muộn hơn thì co dải lại trong [start, cap] giữ nguyên tỉ lệ; luôn tăng dần. */
function timesOf(seed: IntegrationSeed, now: Date, start: Date): Date[] {
  const wanted = seed.events.map((e) => atIct(now, -e.d, e.h, e.m).getTime());
  const cap = now.getTime() - 10 * MIN_MS;
  const lo = Math.min(...wanted);
  const hi = Math.max(...wanted);
  const from = Math.max(lo, start.getTime());
  const scaled = wanted.map((t) => (lo >= start.getTime() || hi === lo ? t : from + ((t - lo) * (Math.min(hi, cap) - from)) / (hi - lo)));
  const out = scaled.map((t) => Math.min(t, cap));
  for (let i = 1; i < out.length; i++) out[i] = Math.max(out[i], out[i - 1] + 5 * MIN_MS);
  for (let i = out.length - 2; i >= 0; i--) out[i] = Math.min(out[i], out[i + 1] - 5 * MIN_MS);
  return out.map((t) => new Date(t));
}

export async function runIntegrations(c: ModuleCtx, t: IntegrationTally): Promise<void> {
  const { dir, now } = c;
  for (const seed of INTEGRATIONS) {
    const ws = c.workspaces.get(seed.ws);
    if (!ws) continue;
    const role = ws.roles.get(seed.createdBy);
    if (role !== "OWNER" && role !== "ADMIN") {
      t.skipped.push(`${seed.ws}: "${seed.createdBy}" không phải OWNER/ADMIN`);
      continue;
    }
    const channel = await ensureAuxChannel(dir, ws, now, { name: seed.channel, description: "Thông báo tự động từ GitHub: commit, pull request, issue và bản phát hành", postingPolicy: "MEMBERS", lifeFraction: 0.08 });
    if (channel.isNew) t.channels += 1;

    const createdBy = dir.id(seed.createdBy);
    const connectedAt = new Date(Math.min(Math.max(now.getTime() - seed.connectedDaysAgo * DAY_MS, channel.createdAt.getTime() + 10 * MIN_MS), now.getTime() - 2 * 3_600_000));
    let integration = await prisma.integration.findFirst({ where: { workspaceId: ws.id, provider: "GITHUB", externalAccountId: seed.installation } });
    if (!integration) {
      integration = await prisma.integration.create({
        data: {
          workspaceId: ws.id,
          provider: "GITHUB",
          externalAccountId: seed.installation,
          externalName: seed.account,
          credentials: null,
          tokenExpiresAt: null,
          scopes: [],
          config: { repos: seed.repos.map((r) => ({ id: r.id, fullName: r.fullName })), events: ["push", "pull_request", "issues", "release"] },
          targetScopeType: "CHANNEL",
          targetScopeId: channel.id,
          webhookSecretHash: null,
          externalHookIds: [],
          status: "ACTIVE",
          statusReason: null,
          createdBy,
          lastEventAt: null,
          version: 1,
          createdAt: connectedAt,
          updatedAt: connectedAt,
        },
      });
      t.integrations += 1;
    }

    const times = timesOf(seed, now, new Date(integration.createdAt.getTime() + 30 * MIN_MS));
    let lastProcessed: Date | null = null;
    let freshMessages = 0;
    let lastSeq = 0;
    for (let i = 0; i < seed.events.length; i++) {
      const { ev } = seed.events[i];
      const { type, payload } = payloadOf(seed, ev, i);
      const eventId = deliveryId(`${seed.ws}:${seed.installation}:${i}`);
      const existing = await prisma.webhookEvent.findUnique({ where: { provider_eventId: { provider: "GITHUB", eventId } }, select: { id: true, status: true, receivedAt: true } });
      if (existing) {
        if (existing.status === "PROCESSED") lastProcessed = existing.receivedAt;
        continue;
      }
      const stored = payloadForStorage(payload);
      const message = mapGithubEvent(type, stored);
      const receivedAt = times[i];
      const processedAt = new Date(receivedAt.getTime() + 1800);
      const rowId = newObjectId();
      let messageId: string | null = null;
      if (message) {
        const posted = await postIntegrationMessage(channel.id, ws.id, rowId, { ...message, integrationId: integration.id }, processedAt);
        messageId = posted.id;
        lastSeq = Math.max(lastSeq, posted.seq);
        freshMessages += 1;
      }
      await prisma.webhookEvent.create({
        data: {
          id: rowId,
          provider: "GITHUB",
          eventId,
          type,
          roomName: null,
          payloadHash: sha(JSON.stringify(stored), "sha256"),
          payload: stored as Prisma.InputJsonObject,
          status: message ? "PROCESSED" : "IGNORED",
          error: null,
          attempts: 1,
          receivedAt,
          processedAt,
          integrationId: integration.id,
          summary: message ? message.summary : "Sự kiện hoặc hành động không được hỗ trợ",
          messageId,
          replayOf: null,
        },
      });
      t.events += 1;
      if (message) {
        t.messages += 1;
        lastProcessed = processedAt;
      }
    }
    if (lastProcessed && (!integration.lastEventAt || integration.lastEventAt < lastProcessed)) {
      await prisma.integration.update({ where: { id: integration.id }, data: { lastEventAt: lastProcessed, updatedAt: lastProcessed } });
    }
    if (freshMessages > 0 && lastProcessed) await setReadMark(dir, ws, channel.id, lastSeq, new Date(lastProcessed.getTime() + 2 * MIN_MS));
  }
}
