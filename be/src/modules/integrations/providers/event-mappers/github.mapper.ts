import { LIMITS } from "../../../../core/constants/limits";
import type { IntegrationMessagePayload } from "../../entities/integration.interface";
import { actorOf, asArray, asRecord, branchOf, cleanText, firstLine, positiveInt, safeHttpsUrl, shortSha } from "./mapper-utils";

/** Host được phép ở link/ảnh đại diện trong tin (GitHub.com + CDN ảnh). */
export const GITHUB_LINK_HOSTS = ["github.com"] as const;
const AVATAR_HOSTS = ["githubusercontent.com", "github.com"] as const;

const { titleMax, commitMessageMax, commitsInMessageMax } = LIMITS.integration;

function finish(
  event: string,
  action: string | undefined,
  title: string,
  ctx: { repo: string; actor?: { login: string; avatarUrl?: string } },
  extra: Partial<IntegrationMessagePayload> = {}
): IntegrationMessagePayload {
  return {
    source: "github",
    provider: "GITHUB",
    event,
    ...(action ? { action } : {}),
    title,
    summary: cleanText(ctx.repo ? `${title} (${ctx.repo})` : title, 300),
    ...(ctx.actor ? { actor: ctx.actor } : {}),
    ...(ctx.repo ? { repo: ctx.repo } : {}),
    ...extra,
  };
}

function mapPush(p: Record<string, unknown>, ctx: { repo: string; actor?: { login: string; avatarUrl?: string } }, repoUrl?: string): IntegrationMessagePayload | null {
  const branch = branchOf(p.ref);
  if (!branch || p.deleted === true) return null; // tag push / xoá nhánh: không đưa vào kênh (giảm nhiễu)
  const who = ctx.actor?.login ?? "Ai đó";
  const commits = asArray(p.commits).map(asRecord).filter((c): c is Record<string, unknown> => c !== null);
  const count = Math.max(commits.length, positiveInt(p.size) ?? 0);
  const shown = commits
    .map((c) => ({ sha7: shortSha(c.id), message: firstLine(c.message, commitMessageMax) }))
    .filter((c) => c.sha7 !== "")
    .slice(0, commitsInMessageMax);
  const branchName = cleanText(branch, 100);
  const title =
    count === 0
      ? p.created === true
        ? `${who} đã tạo nhánh ${branchName}`
        : `${who} đã cập nhật nhánh ${branchName}`
      : `${who} đã ${p.forced === true ? "force-push" : "push"} ${count} commit lên ${branchName}`;
  const url =
    safeHttpsUrl(p.compare, GITHUB_LINK_HOSTS) ??
    safeHttpsUrl(asRecord(p.head_commit)?.url, GITHUB_LINK_HOSTS) ??
    (repoUrl ? safeHttpsUrl(`${repoUrl}/tree/${encodeURIComponent(branch)}`, GITHUB_LINK_HOSTS) : undefined);
  return finish("push", p.created === true && count === 0 ? "created" : undefined, title, ctx, {
    ref: branchName,
    ...(url ? { url } : {}),
    ...(shown.length > 0 ? { commits: shown } : {}),
    ...(count > 0 ? { commitCount: count } : {}),
  });
}

function mapPullRequest(p: Record<string, unknown>, ctx: { repo: string; actor?: { login: string; avatarUrl?: string } }): IntegrationMessagePayload | null {
  const pr = asRecord(p.pull_request);
  const action = typeof p.action === "string" ? p.action : "";
  if (!pr) return null;
  const number = positiveInt(pr.number) ?? positiveInt(p.number);
  const name = cleanText(pr.title, titleMax);
  if (!number || !name) return null;
  let who = ctx.actor?.login ?? "Ai đó";
  let verb: string;
  let normalized = action;
  if (action === "closed" && pr.merged === true) {
    const by = asRecord(pr.merged_by);
    if (by) who = cleanText(by.login, 60) || who;
    verb = "đã merge";
    normalized = "merged";
  } else if (action === "closed") verb = "đã đóng";
  else if (action === "opened") verb = "đã mở";
  else if (action === "reopened") verb = "đã mở lại";
  else if (action === "ready_for_review") verb = "đã sẵn sàng review";
  else return null;
  const base = asRecord(pr.base);
  const url = safeHttpsUrl(pr.html_url, GITHUB_LINK_HOSTS);
  return finish("pull_request", normalized, `${who} ${verb} PR #${number}: ${name}`, ctx, {
    number,
    ...(url ? { url } : {}),
    ...(typeof base?.ref === "string" ? { ref: cleanText(base.ref, 100) } : {}),
  });
}

function mapIssue(p: Record<string, unknown>, ctx: { repo: string; actor?: { login: string; avatarUrl?: string } }): IntegrationMessagePayload | null {
  const issue = asRecord(p.issue);
  const action = typeof p.action === "string" ? p.action : "";
  if (!issue) return null;
  const number = positiveInt(issue.number);
  const name = cleanText(issue.title, titleMax);
  const verb = action === "opened" ? "đã mở" : action === "closed" ? "đã đóng" : action === "reopened" ? "đã mở lại" : null;
  if (!number || !name || !verb) return null;
  const url = safeHttpsUrl(issue.html_url, GITHUB_LINK_HOSTS);
  return finish("issues", action, `${ctx.actor?.login ?? "Ai đó"} ${verb} issue #${number}: ${name}`, ctx, { number, ...(url ? { url } : {}) });
}

function mapRelease(p: Record<string, unknown>, ctx: { repo: string; actor?: { login: string; avatarUrl?: string } }): IntegrationMessagePayload | null {
  const release = asRecord(p.release);
  const action = typeof p.action === "string" ? p.action : "";
  if (!release || (action !== "published" && action !== "released")) return null;
  const tag = cleanText(release.tag_name, 100);
  if (!tag) return null;
  const label = cleanText(release.name, titleMax);
  const url = safeHttpsUrl(release.html_url, GITHUB_LINK_HOSTS);
  const title = `${ctx.actor?.login ?? "Ai đó"} đã phát hành ${tag}${label && label !== tag ? ` (${label})` : ""}`;
  return finish("release", "published", title, ctx, { ref: tag, ...(url ? { url } : {}) });
}

/** Payload webhook GitHub (đã lọc) → nội dung tin hệ thống; `null` = loại/hành động không hỗ trợ (→ `IGNORED`). */
export function mapGithubEvent(type: string, payload: Record<string, unknown>): IntegrationMessagePayload | null {
  const repository = asRecord(payload.repository);
  const sender = asRecord(payload.sender);
  const ctx = {
    repo: cleanText(repository?.full_name, 100),
    actor: actorOf(sender?.login, sender?.avatar_url, AVATAR_HOSTS),
  };
  switch (type) {
    case "push":
      return mapPush(payload, ctx, typeof repository?.html_url === "string" ? repository.html_url : undefined);
    case "pull_request":
      return mapPullRequest(payload, ctx);
    case "issues":
      return mapIssue(payload, ctx);
    case "release":
      return mapRelease(payload, ctx);
    default:
      return null;
  }
}
