/**
 * Seed phân hệ `portfolio` (p6-07): hồ sơ công khai một chạm của thu + 5 người, kèm dự án lấy từ các nhóm họ tham gia.
 *
 * Trạng thái: tất cả `DRAFT` trừ một hồ sơ `UNPUBLISHED`. KHÔNG có hồ sơ `PUBLISHED`: công khai cần job `portfolio.build` ghi HTML/ảnh vào kho đối tượng
 * (S3/Cloudinary/…) rồi `GET /p/:slug` đọc lại từ đó — seed không được ghi tệp thật, nên một hồ sơ PUBLISHED sẽ trỏ tới trang 404. Hồ sơ DRAFT đã đủ nội dung để
 * bấm "Công khai" (có phần giới thiệu, dự án và liên kết hợp lệ → qua `assertHasContent`) và việc dựng trang sẽ chạy bằng worker thật. Hồ sơ UNPUBLISHED mô phỏng
 * "đã công khai rồi ngừng": build v1 `READY` nhưng đã bị job dọn (`purgedAt`) nên không còn object nào trong kho — khớp trạng thái sau `unpublish` + `portfolio.purge-build`.
 *
 * Số liệu mỗi dự án là SNAPSHOT dựng đúng như `PortfolioSnapshotService.capture` (thẻ hoàn thành, story points ×10 chia đều, tỷ lệ đúng hạn, đồng đội chỉ khi
 * `showTeammates` và đồng đội đã bật `appearInOthersPortfolios`, điểm đóng góp chỉ khi chủ hồ sơ bật `showContribution` và đã có `ContributionSnapshot`).
 */
import { createHash } from "crypto";
import { LIMITS } from "../../../../src/core/constants/limits";
import { isReservedSlug } from "../../../../src/core/constants/reserved-slugs";
import { normalizeSearch } from "../../../../src/core/utils/normalize";
import { newObjectId } from "../../../../src/core/utils/object-id";
import { SLUG_REGEX, safeHttpsUrl } from "../../../../src/modules/portfolio/entities/portfolio.rules";
import { portfolioStoragePrefix, buildFolder } from "../../../../src/modules/portfolio/services/portfolio-paths";
import { DAY_MS, prisma, rngFrom } from "../core";
import type { ModuleSeed } from "../module-ctx";
import { loadContributionAggregates, loadSeedDoneTasks, memberStats } from "./career-source";
import { clampTime, loadUsers, maxDate, readSystemConfig, snapActive } from "./career-common";
import { PORTFOLIOS, type PortfolioSpec } from "./portfolio.content";

const SECTION_ORDER = ["ABOUT", "PROJECTS", "SKILLS", "CONTACT"] as const;

function slugify(name: string, maxLength = 24): string {
  const base = normalizeSearch(name).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, maxLength).replace(/-+$/g, "");
  return base.length >= LIMITS.portfolio.slugMin ? base : "portfolio";
}

async function slugUsable(slug: string, bannedTerms: readonly string[], now: Date): Promise<boolean> {
  if (!SLUG_REGEX.test(slug) || isReservedSlug(slug)) return false;
  const spaced = normalizeSearch(slug.replace(/-/g, " "));
  const compact = spaced.replace(/\s+/g, "");
  if (bannedTerms.some((t) => { const n = normalizeSearch(t); return n.length > 0 && (spaced.includes(n) || compact.includes(n.replace(/\s+/g, ""))); })) return false;
  if (await prisma.portfolio.findUnique({ where: { slugKey: slug }, select: { id: true } })) return false;
  const held = await prisma.portfolioSlugReservation.findUnique({ where: { slugKey: slug } });
  return !(held && held.expiresAt > now);
}

function validateSpec(spec: PortfolioSpec): void {
  const L = LIMITS.portfolio;
  const bad: string[] = [];
  if (spec.headline.length > L.headlineMax) bad.push("headline");
  if (spec.bio.length > L.bioMax) bad.push("bio");
  if (spec.links.length > L.linksMax) bad.push("links");
  for (const l of spec.links) if (l.label.length > L.linkLabelMax || !safeHttpsUrl(l.url, L.linkUrlMax)) bad.push(`link:${l.label}`);
  if (spec.projects.length > L.projectsMax) bad.push("projects");
  for (const p of spec.projects) {
    if (p.title.length < L.projectTitleMin || p.title.length > L.projectTitleMax) bad.push(`title:${p.title}`);
    if (p.summary.length > L.summaryMax) bad.push(`summary:${p.title}`);
    if (p.role.length > L.roleMax) bad.push(`role:${p.title}`);
    if (p.highlights.length > L.highlightsMax || p.highlights.some((h) => h.length > L.highlightMax)) bad.push(`highlights:${p.title}`);
  }
  if (bad.length > 0) throw new Error(`portfolio.content: "${spec.key}" vượt giới hạn: ${bad.join(", ")}`);
}

export const seedPortfolio: ModuleSeed = async (c) => {
  for (const spec of PORTFOLIOS) validateSpec(spec);
  const users = await loadUsers(c, PORTFOLIOS.map((p) => p.key));
  const tasks = await loadSeedDoneTasks(c);
  const ownerIds = [...users.values()].map((u) => u.id);
  const contribution = await loadContributionAggregates(ownerIds);

  const cfg = await readSystemConfig("portfolio");
  const banned = Array.isArray(cfg["bannedSlugTerms"]) ? (cfg["bannedSlugTerms"] as unknown[]).filter((t): t is string => typeof t === "string") : [];
  const seoIndexable = !(typeof cfg["defaultNoindex"] === "boolean" ? cfg["defaultNoindex"] : true);

  // Dữ liệu tham chiếu cho tên đồng đội (chỉ người đã đồng ý) và huy hiệu còn hiệu lực của chủ hồ sơ.
  const coIds = new Set<string>();
  for (const t of tasks) for (const id of t.assigneeIds) coIds.add(id);
  const people = new Map((coIds.size === 0 ? [] : await prisma.user.findMany({ where: { id: { in: [...coIds] } }, select: { id: true, name: true, status: true } })).map((u) => [u.id, u]));
  const careers = new Map((coIds.size === 0 ? [] : await prisma.userCareer.findMany({ where: { userId: { in: [...coIds] } }, select: { userId: true, visibility: true } })).map((r) => [r.userId, r.visibility]));

  let created = 0;
  let existing = 0;
  let projectCount = 0;
  let reservations = 0;
  let builds = 0;
  let skipped = 0;
  const prefix = portfolioStoragePrefix();

  for (const spec of PORTFOLIOS) {
    const user = users.get(spec.key);
    if (!user) continue;
    if (await prisma.portfolio.findUnique({ where: { userId: user.id }, select: { id: true } })) {
      existing += 1;
      continue; // hồ sơ người dùng tự tạo (hoặc lần seed trước) — không đụng tới
    }
    const rng = rngFrom(`portfolio:${spec.key}`);
    const floor = new Date(user.createdAt.getTime() + 2 * 3_600_000);
    const createdAt = clampTime(snapActive(new Date(c.now.getTime() - spec.createdDaysAgo * DAY_MS)), floor, new Date(c.now.getTime() - 3 * 3_600_000));
    const id = newObjectId();

    // Slug tự sinh (tên + 4 ký tự) — luôn có; slug tuỳ chọn thay sau đó nếu hợp lệ.
    const stable = createHash("sha1").update(`portfolio:${user.id}`).digest("hex");
    let autoSlug = "";
    for (let i = 0; i < 8; i += 1) {
      const candidate = `${slugify(user.name)}-${stable.slice(i * 4, i * 4 + 4)}`;
      if (await slugUsable(candidate, banned, c.now)) {
        autoSlug = candidate;
        break;
      }
    }
    if (!autoSlug) throw new Error(`Không sinh được slug cho "${spec.key}"`);
    let slug = autoSlug;
    let slugChangedAt: Date | null = null;
    if (spec.customSlug && (await slugUsable(spec.customSlug, banned, c.now))) {
      slug = spec.customSlug;
      slugChangedAt = clampTime(snapActive(new Date(createdAt.getTime() + (0.8 + rng() * 1.2) * DAY_MS)), createdAt, new Date(c.now.getTime() - 2 * 3_600_000));
    }

    // Huy hiệu còn hiệu lực (nếu career đã chạy) quyết định mục "Kỹ năng" có hiện không.
    const career = await prisma.userCareer.findUnique({ where: { userId: user.id }, select: { visibility: true } });
    const showSkills = career?.visibility.showSkills ?? true;
    const showContribution = career?.visibility.showContribution ?? false;
    const badgeCount = showSkills ? await prisma.userSkillBadge.count({ where: { userId: user.id, revokedAt: null } }) : 0;

    // Dự án: chỉ nhóm có ≥ 1 thẻ hoàn thành của người này.
    const projects: Array<{ text: PortfolioSpec["projects"][number]; wsId: string; wsCreatedAt: Date; stats: NonNullable<ReturnType<typeof memberStats>> }> = [];
    for (const text of spec.projects) {
      const ws = c.workspaces.get(text.ws);
      if (!ws) continue;
      const stats = memberStats(tasks, user.id, ws.id, contribution);
      if (!stats) continue;
      projects.push({ text, wsId: ws.id, wsCreatedAt: ws.createdAt, stats });
    }
    if (projects.length === 0) skipped += 1;

    const hasAbout = spec.bio.trim().length > 0;
    const contactOk = spec.links.some((l) => safeHttpsUrl(l.url) !== null);
    if (!hasAbout && !contactOk && projects.length === 0 && badgeCount === 0) continue; // không đủ nội dung để có ý nghĩa

    const sections = SECTION_ORDER.map((kind, order) => ({ kind, visible: kind === "SKILLS" ? badgeCount > 0 : kind === "PROJECTS" ? projects.length > 0 : true, order }));
    const version = 2 + (slugChangedAt ? 1 : 0);
    let lastTouch = maxDate(createdAt, slugChangedAt ?? createdAt);

    const projectRows = projects.map((p, index) => {
      const at = clampTime(snapActive(new Date(Math.max(createdAt.getTime() + (index + 1) * 2 * 3_600_000, p.stats.lastDoneAt.getTime() + 40 * 60_000))), createdAt, new Date(c.now.getTime() - 10 * 60_000));
      lastTouch = maxDate(lastTouch, at);
      const coPresent = p.stats.coAssigneeIds.filter((uid) => { const u = people.get(uid); return u !== undefined && u.status !== "ANONYMIZED"; });
      const named = p.text.showTeammates
        ? coPresent
            .filter((uid) => careers.get(uid)?.appearInOthersPortfolios === true && people.get(uid)?.status === "ACTIVE")
            .map((uid) => people.get(uid)?.name ?? "")
            .filter((n) => n.length > 0)
            .sort((a, b) => a.localeCompare(b, "vi"))
            .slice(0, LIMITS.portfolio.namedTeammatesMax)
        : [];
      return {
        portfolioId: id,
        userId: user.id,
        workspaceId: p.wsId,
        title: p.text.title,
        summary: p.text.summary,
        role: p.text.role,
        periodFrom: maxDate(p.wsCreatedAt, user.createdAt),
        // Nhóm còn hoạt động → dự án đang tiếp diễn (không đặt ngày kết thúc).
        periodTo: null,
        highlights: p.text.highlights,
        coverAssetId: null,
        visible: true,
        order: index,
        showTeammates: p.text.showTeammates,
        snapshot: {
          tasksDone: p.stats.tasksDone,
          storyPointsX10: p.stats.storyPointsX10,
          onTimeRatePct: p.stats.tasksWithDue > 0 ? Math.round((100 * p.stats.tasksOnTime) / p.stats.tasksWithDue) : null,
          contributionPctX10: showContribution ? p.stats.scoreX10 : null,
          contributionShareX10: showContribution ? p.stats.shareX10 : null,
          peerReviewAvgX10: null,
          filesUploaded: 0,
          teammatesCount: coPresent.length,
          namedTeammates: named,
          skillBadges: [],
        },
        snapshotAt: at,
        version: 1,
        createdAt: at,
        updatedAt: at,
        wsId: p.wsId,
      };
    });
    for (const row of projectRows) row.snapshot.filesUploaded = await prisma.resource.count({ where: { workspaceId: row.wsId, uploadedBy: user.id } });

    const unpublished = spec.status === "UNPUBLISHED";
    const publishedAt = unpublished ? clampTime(snapActive(new Date(lastTouch.getTime() + 2 * 3_600_000)), lastTouch, c.now) : null;
    const unpublishedAt = unpublished && publishedAt ? maxDate(publishedAt, clampTime(snapActive(new Date(publishedAt.getTime() + (1 + rng() * 2) * DAY_MS)), publishedAt, new Date(c.now.getTime() - 3_600_000))) : null;
    const updatedAt = maxDate(lastTouch, unpublishedAt ?? lastTouch);

    await prisma.$transaction(async (tx) => {
      await tx.portfolio.create({
        data: {
          id,
          userId: user.id,
          slug,
          slugKey: slug,
          displayName: user.name.slice(0, LIMITS.portfolio.displayNameMax),
          headline: spec.headline,
          bio: spec.bio,
          avatarAssetId: null,
          links: spec.links,
          theme: { template: spec.template, accent: spec.accent },
          sections,
          seoIndexable,
          status: spec.status,
          // Quy ước Mongo null-vs-absent: các field này được lọc/so sánh bằng `null`.
          currentBuildVersion: unpublished ? 1 : null,
          nextBuildVersion: unpublished ? 2 : 1,
          publishedAt,
          unpublishedAt,
          takenDownAt: null,
          takenDownBy: null,
          takedownReason: null,
          version,
          createdAt,
          updatedAt,
        },
      });
      for (const row of projectRows) {
        const { wsId: _ws, ...data } = row;
        void _ws;
        await tx.portfolioProject.create({ data });
      }

      if (slugChangedAt && slug !== autoSlug) {
        // Slug cũ giữ 30 ngày và chuyển hướng 301 sang slug mới (`changeSlug`).
        await tx.portfolioSlugReservation.create({
          data: { slugKey: autoSlug, portfolioId: id, redirectTo: slug, expiresAt: new Date(slugChangedAt.getTime() + LIMITS.portfolio.slugReserveDays * DAY_MS), createdAt: slugChangedAt },
        });
      }
      if (unpublished && publishedAt && unpublishedAt) {
        await tx.portfolioBuild.create({
          data: {
            portfolioId: id,
            buildVersion: 1,
            status: "READY",
            trigger: "PUBLISH",
            portfolioVersion: version,
            storageKey: buildFolder(prefix, id, 1),
            files: ["index.html"],
            sizeBytes: 22_000 + Math.floor(rng() * 9_000),
            error: null,
            createdBy: user.id,
            createdAt: new Date(publishedAt.getTime() - 60_000),
            startedAt: new Date(publishedAt.getTime() - 58_000),
            finishedAt: publishedAt,
            // Đã ngừng công khai → job `portfolio.purge-build` xoá object sau `purgeDelayMinutes` và đặt `purgedAt`.
            purgedAt: new Date(unpublishedAt.getTime() + LIMITS.portfolio.purgeDelayMinutes * 60_000),
          },
        });
      }
    },
    { timeout: 30_000, maxWait: 10_000 }
    );
    projectCount += projectRows.length;
    if (slugChangedAt && slug !== autoSlug) reservations += 1;
    if (unpublished) builds += 1;
    created += 1;
  }
  return `portfolio: +${created} hồ sơ (${existing} có sẵn; toàn bộ DRAFT trừ 1 UNPUBLISHED), +${projectCount} dự án, +${reservations} slug giữ chỗ, +${builds} bản dựng (đã dọn)${skipped ? `; ${skipped} hồ sơ chưa có dự án đủ điều kiện` : ""}`;
};
