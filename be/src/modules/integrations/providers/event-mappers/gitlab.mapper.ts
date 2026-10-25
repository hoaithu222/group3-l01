import { LIMITS } from "../../../../core/constants/limits";
import type { IntegrationMessagePayload } from "../../entities/integration.interface";
import { actorOf, asArray, asRecord, branchOf, cleanText, firstLine, positiveInt, safeHttpsUrl, shortSha } from "./mapper-utils";

const { titleMax, commitMessageMax, commitsInMessageMax } = LIMITS.integration;

interface Ctx {
  repo: string;
  actor?: { login: string; avatarUrl?: string };
  hosts: readonly string[];
}

function finish(event: string, action: string | undefined, title: string, ctx: Ctx, extra: Partial<IntegrationMessagePayload> = {}): IntegrationMessagePayload {
  return {
    source: "gitlab",
    provider: "GITLAB",
    event,
    ...(action ? { action } : {}),
    title,
    summary: cleanText(ctx.repo ? `${title} (${ctx.repo})` : title, 300),
    ...(ctx.actor ? { actor: ctx.actor } : {}),
    ...(ctx.repo ? { repo: ctx.repo } : {}),
    ...extra,
  };
}

function mapPush(p: Record<string, unknown>, ctx: Ctx): IntegrationMessagePayload | null {
  const branch = branchOf(p.ref);
  if (!branch) return null; // tag push ("tag_push") không đưa vào kênh
  const after = typeof p.after === "string" ? p.after : "";
  if (/^0+$/.test(after)) return null; // xoá nhánh
  const commits = asArray(p.commits).map(asRecord).filter((c): c is Record<string, unknown> => c !== null);
  const count = Math.max(commits.length, positiveInt(p.total_commits_count) ?? 0);
  const created = typeof p.before === "string" && /^0+$/.test(p.before);
  const who = ctx.actor?.login ?? "Ai đó";
  const name = cleanText(branch, 100);
  const shown = commits.map((c) => ({ sha7: shortSha(c.id), message: firstLine(c.title ?? c.message, commitMessageMax) })).filter((c) => c.sha7 !== "").slice(0, commitsInMessageMax);
  const title = count === 0 ? `${who} đã ${created ? "tạo" : "cập nhật"} nhánh ${name}` : `${who} đã push ${count} commit lên ${name}`;
  const project = asRecord(p.project);
  const url = safeHttpsUrl(commits[commits.length - 1]?.url, ctx.hosts) ?? (project ? safeHttpsUrl(`${String(project.web_url)}/-/tree/${encodeURIComponent(branch)}`, ctx.hosts) : undefined);
  return finish("push", undefined, title, ctx, { ref: name, ...(url ? { url } : {}), ...(shown.length ? { commits: shown } : {}), ...(count > 0 ? { commitCount: count } : {}) });
}

function mapMergeRequest(p: Record<string, unknown>, ctx: Ctx): IntegrationMessagePayload | null {
  const a = asRecord(p.object_attributes);
  if (!a) return null;
  const number = positiveInt(a.iid);
  const name = cleanText(a.title, titleMax);
  const action = typeof a.action === "string" ? a.action : "";
  const state = typeof a.state === "string" ? a.state : "";
  let verb: string | null = null;
  let normalized = action;
  if (action === "open") verb = "đã mở";
  else if (action === "reopen") verb = "đã mở lại";
  else if (action === "merge" || state === "merged") {
    verb = "đã merge";
    normalized = "merged";
  } else if (action === "close") verb = "đã đóng";
  if (!number || !name || !verb) return null;
  const url = safeHttpsUrl(a.url, ctx.hosts);
  return finish("merge_request", normalized, `${ctx.actor?.login ?? "Ai đó"} ${verb} MR !${number}: ${name}`, ctx, { number, ...(url ? { url } : {}), ...(typeof a.target_branch === "string" ? { ref: cleanText(a.target_branch, 100) } : {}) });
}

function mapIssue(p: Record<string, unknown>, ctx: Ctx): IntegrationMessagePayload | null {
  const a = asRecord(p.object_attributes);
  if (!a) return null;
  const number = positiveInt(a.iid);
  const name = cleanText(a.title, titleMax);
  const action = typeof a.action === "string" ? a.action : "";
  const verb = action === "open" ? "đã mở" : action === "close" ? "đã đóng" : action === "reopen" ? "đã mở lại" : null;
  if (!number || !name || !verb) return null;
  const url = safeHttpsUrl(a.url, ctx.hosts);
  return finish("issues", action, `${ctx.actor?.login ?? "Ai đó"} ${verb} issue #${number}: ${name}`, ctx, { number, ...(url ? { url } : {}) });
}

function mapNote(p: Record<string, unknown>, ctx: Ctx): IntegrationMessagePayload | null {
  const a = asRecord(p.object_attributes);
  const text = cleanText(a?.note, commitMessageMax);
  if (!a || !text) return null;
  const kind = typeof a.noteable_type === "string" ? a.noteable_type : "";
  const target = kind === "MergeRequest" ? "MR" : kind === "Issue" ? "issue" : kind === "Commit" ? "commit" : "nội dung";
  const url = safeHttpsUrl(a.url, ctx.hosts);
  return finish("note", "created", `${ctx.actor?.login ?? "Ai đó"} đã bình luận vào ${target}: ${text}`, ctx, url ? { url } : {});
}

function mapRelease(p: Record<string, unknown>, ctx: Ctx): IntegrationMessagePayload | null {
  if (p.action !== "create") return null;
  const tag = cleanText(p.tag, 100);
  if (!tag) return null;
  const label = cleanText(p.name, titleMax);
  const url = safeHttpsUrl(p.url, ctx.hosts);
  return finish("release", "published", `${ctx.actor?.login ?? "Ai đó"} đã phát hành ${tag}${label && label !== tag ? ` (${label})` : ""}`, ctx, { ref: tag, ...(url ? { url } : {}) });
}

/** Payload webhook GitLab (đã lọc) → nội dung tin. `hosts` = host GitLab của vận hành (gitlab.com hoặc bản tự host) — link/ảnh ngoài danh sách bị bỏ. */
export function mapGitlabEvent(type: string, payload: Record<string, unknown>, hosts: readonly string[] = ["gitlab.com"]): IntegrationMessagePayload | null {
  const project = asRecord(payload.project);
  const user = asRecord(payload.user);
  const login = payload.user_username ?? user?.username ?? payload.user_name ?? user?.name;
  const ctx: Ctx = {
    repo: cleanText(project?.path_with_namespace, 100),
    actor: actorOf(login, payload.user_avatar ?? user?.avatar_url, [...hosts, "gravatar.com", "secure.gravatar.com"]),
    hosts,
  };
  switch (type) {
    case "push":
      return mapPush(payload, ctx);
    case "merge_request":
      return mapMergeRequest(payload, ctx);
    case "issues":
      return mapIssue(payload, ctx);
    case "note":
      return mapNote(payload, ctx);
    case "release":
      return mapRelease(payload, ctx);
    default:
      return null;
  }
}
