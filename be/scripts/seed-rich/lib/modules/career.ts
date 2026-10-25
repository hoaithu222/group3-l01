/**
 * Seed phân hệ `career` (p6-06): hồ sơ nghề `UserCareer` của 14 người + tiến độ kỹ năng dựng từ CHÍNH các thẻ Kanban đã hoàn thành do seed tạo.
 *
 * Cách tính khớp `SkillProgressService.onTaskCompleted`: thẻ ở cột DONE, có story points ≥ `creditMinStoryPoints`, nhãn (đã `normalizeSkillLabel`)
 * khớp `SkillDefinition.labelMatch` → mỗi người được giao nhận một `UserSkillTaskCredit` (story points ×10 chia đều cho người làm, `reviewScoreX10 = null`
 * vì bảng seed không bật chấm chéo). `UserSkillProgress` là TỔNG các credit ACTIVE (đúng nguồn sự thật mà cron đối soát dựng lại). Huy hiệu
 * `UserSkillBadge` CHỈ cấp khi kỹ năng đang BẬT và tiến độ đạt `evaluateSkillCriteria` — không bật/tắt/sửa định nghĩa kỹ năng nào.
 */
import { LIMITS } from "../../../../src/core/constants/limits";
import { normalizeSkillLabel } from "../../../../src/core/utils/normalize";
import { avgPeerScoreX10, evaluateSkillCriteria, type StoredSkillCriteria } from "../../../../src/shared/criteria/skill-criteria";
import { prisma, rngFrom } from "../core";
import type { ModuleCtx, ModuleSeed } from "../module-ctx";
import { CAREER_PROFILES } from "./career.content";
import { loadSeedDoneTasks } from "./career-source";
import { chunk, clampTime, loadUsers, notifyDirect, readSystemConfig, snapActive, DAY_MS } from "./career-common";

const CONSENT_FALLBACK = LIMITS.company.defaultConsentVersion;

/** Phiên bản chính sách dữ liệu đang hiệu lực (`SystemConfig recruiter.consentVersion`, mặc định "v1"). */
export async function requiredConsentVersion(): Promise<string> {
  const v = (await readSystemConfig("recruiter"))["consentVersion"];
  return typeof v === "string" && v.length > 0 ? v : CONSENT_FALLBACK;
}

async function seedProfiles(c: ModuleCtx): Promise<{ created: number; existing: number; openToWork: number }> {
  const users = await loadUsers(c, CAREER_PROFILES.map((p) => p.key));
  const consent = await requiredConsentVersion();
  let created = 0;
  let existing = 0;
  let openToWork = 0;
  for (const p of CAREER_PROFILES) {
    const u = users.get(p.key);
    if (!u) continue;
    if (p.headline.length > LIMITS.talent.headlineMax || p.preferredRoles.length > LIMITS.talent.preferredRolesMax) throw new Error(`career.content: hồ sơ "${p.key}" vượt giới hạn`);
    const row = await prisma.userCareer.findUnique({ where: { userId: u.id }, select: { id: true, openToWork: true } });
    if (row) {
      existing += 1;
      if (row.openToWork) openToWork += 1;
      continue; // hồ sơ người dùng tự đặt (hoặc lần seed trước) — không ghi đè
    }
    const rng = rngFrom(`career:${p.key}`);
    const lower = new Date(u.createdAt.getTime() + 3_600_000);
    // Tạo hồ sơ sau khi có tài khoản ≥ 1 giờ; mốc bật/tắt "mở nhận lời mời" nằm giữa lúc tạo và hiện tại.
    const touchedAt = clampTime(snapActive(new Date(c.now.getTime() - p.openedDaysAgo * DAY_MS - Math.floor(rng() * 6 * 3_600_000))), lower, c.now);
    const createdAt = clampTime(snapActive(new Date(touchedAt.getTime() - Math.floor((0.2 + rng() * 0.6) * DAY_MS))), lower, touchedAt);
    const everOpen = p.openToWork || p.wasOpen === true;
    await prisma.userCareer.create({
      data: {
        userId: u.id,
        openToWork: p.openToWork,
        openToWorkChangedAt: everOpen ? touchedAt : null,
        headline: p.headline,
        preferredRoles: p.preferredRoles,
        location: p.location,
        consentVersion: everOpen ? consent : null,
        visibility: p.visibility,
        createdAt,
        updatedAt: touchedAt,
      },
    });
    created += 1;
    if (p.openToWork) openToWork += 1;
  }
  return { created, existing, openToWork };
}

interface CreditRow {
  id?: string;
  userId: string;
  skillId: string;
  taskId: string;
  workspaceId: string;
  storyPointsX10: number;
  completedAt: Date;
  completionCount: number;
}

const sameCriteria = (c: StoredSkillCriteria): StoredSkillCriteria => ({
  requiredTasksDone: c.requiredTasksDone,
  minStoryPointsX10: c.minStoryPointsX10 ?? null,
  minAvgPeerScoreX10: c.minAvgPeerScoreX10 ?? null,
  requireReview: c.requireReview,
});

async function seedSkillLedger(c: ModuleCtx): Promise<{ credits: number; progress: number; badges: number; skills: number; active: number; notifications: number }> {
  const zero = { credits: 0, progress: 0, badges: 0, skills: 0, active: 0, notifications: 0 };
  const skills = await prisma.skillDefinition.findMany({ orderBy: [{ order: "asc" }, { name: "asc" }] });
  if (skills.length === 0) return zero;
  const tasks = await loadSeedDoneTasks(c);
  const known = new Set<string>();
  const keyOfId = new Map<string, string>();
  for (const t of tasks) {
    for (const id of t.assigneeIds) {
      const key = c.dir.keyOfId(id);
      if (key) {
        known.add(id);
        keyOfId.set(id, key);
      }
    }
  }
  // Bản ghi credit/tiến độ/huy hiệu không thể có trước khi tài khoản tồn tại (mốc `completedAt` của thẻ giữ nguyên như nguồn).
  const accountAt = new Map([...(await loadUsers(c, [...new Set(keyOfId.values())])).values()].map((u) => [u.id, u.createdAt]));
  const notBeforeAccount = (userId: string, t: Date): Date => new Date(Math.max(t.getTime(), (accountAt.get(userId)?.getTime() ?? 0) + 60_000));

  const skillCfg = await readSystemConfig("skill");
  const creditMin = typeof skillCfg["creditMinStoryPoints"] === "number" ? (skillCfg["creditMinStoryPoints"] as number) : LIMITS.skill.creditMinStoryPoints;

  // Ứng viên credit theo đúng luật của dịch vụ.
  const wanted = new Map<string, CreditRow>();
  for (const t of tasks) {
    if (t.storyPoints < creditMin) continue;
    const labels = [...new Set(t.labelNames.map(normalizeSkillLabel).filter(Boolean))];
    if (labels.length === 0) continue;
    const hit = skills.filter((s) => s.labelMatch.some((m) => labels.includes(m)));
    const assignees = [...new Set(t.assigneeIds)].filter((id) => known.has(id));
    for (const userId of assignees) {
      for (const s of hit) {
        wanted.set(`${userId}:${s.id}:${t.id}`, {
          userId,
          skillId: s.id,
          taskId: t.id,
          workspaceId: t.workspaceId,
          // Chia đều cho người làm TẠI LÚC Done (CR-23), lưu ×10.
          storyPointsX10: Math.round((t.storyPoints * 10) / new Set(t.assigneeIds).size),
          completedAt: t.completedAt,
          completionCount: t.completionCount,
        });
      }
    }
  }
  const userIds = [...new Set([...wanted.values()].map((w) => w.userId))];
  const taskIds = [...new Set([...wanted.values()].map((w) => w.taskId))];
  const have = new Set<string>();
  for (const part of chunk(taskIds, 100)) {
    for (const r of await prisma.userSkillTaskCredit.findMany({ where: { taskId: { in: part } }, select: { userId: true, skillId: true, taskId: true } })) have.add(`${r.userId}:${r.skillId}:${r.taskId}`);
  }
  const fresh = [...wanted.entries()].filter(([k]) => !have.has(k)).map(([, v]) => v);
  for (const part of chunk(fresh, 200)) {
    await prisma.userSkillTaskCredit.createMany({
      data: part.map((r) => ({
        userId: r.userId,
        skillId: r.skillId,
        taskId: r.taskId,
        workspaceId: r.workspaceId,
        storyPointsX10: r.storyPointsX10,
        reviewScoreX10: null,
        completedAt: r.completedAt,
        completionCount: r.completionCount,
        status: "ACTIVE" as const,
        // Sink `task.events` ghi credit ngay sau khi thẻ Done.
        createdAt: notBeforeAccount(r.userId, new Date(r.completedAt.getTime() + 20_000)),
        updatedAt: notBeforeAccount(r.userId, new Date(r.completedAt.getTime() + 20_000)),
      })),
    });
  }

  // Dựng lại tiến độ từ credit ACTIVE (nguồn sự thật) cho mọi (người, kỹ năng) liên quan.
  const all = userIds.length === 0 ? [] : await prisma.userSkillTaskCredit.findMany({ where: { userId: { in: userIds }, status: "ACTIVE" }, orderBy: [{ completedAt: "asc" }, { id: "asc" }] });
  const grouped = new Map<string, typeof all>();
  for (const r of all) grouped.set(`${r.userId}:${r.skillId}`, [...(grouped.get(`${r.userId}:${r.skillId}`) ?? []), r]);
  const existingProgress = new Map((userIds.length === 0 ? [] : await prisma.userSkillProgress.findMany({ where: { userId: { in: userIds } } })).map((p) => [`${p.userId}:${p.skillId}`, p]));
  let progressChanged = 0;
  for (const [key, rows] of grouped) {
    const [userId, skillId] = key.split(":");
    const want = {
      tasksDone: rows.length,
      storyPointsX10: rows.reduce((a, r) => a + r.storyPointsX10, 0),
      reviewScoreSumX10: rows.reduce((a, r) => a + (r.reviewScoreX10 ?? 0), 0),
      reviewScoreCount: rows.filter((r) => r.reviewScoreX10 !== null).length,
      lastTaskAt: rows[rows.length - 1].completedAt,
    };
    const cur = existingProgress.get(key);
    if (!cur) {
      await prisma.userSkillProgress.create({ data: { userId, skillId, ...want, createdAt: rows[0].createdAt, updatedAt: rows[rows.length - 1].createdAt } });
      progressChanged += 1;
    } else if (cur.tasksDone !== want.tasksDone || cur.storyPointsX10 !== want.storyPointsX10 || cur.reviewScoreSumX10 !== want.reviewScoreSumX10 || cur.reviewScoreCount !== want.reviewScoreCount) {
      await prisma.userSkillProgress.update({ where: { userId_skillId: { userId, skillId } }, data: want });
      progressChanged += 1;
    }
  }

  // Huy hiệu: chỉ kỹ năng đang bật, chưa có huy hiệu, tiến độ đạt tiêu chí — `unlockedAt` = lúc credit đưa tiến độ vượt ngưỡng.
  const skillById = new Map(skills.map((s) => [s.id, s]));
  const badgesHave = new Set((userIds.length === 0 ? [] : await prisma.userSkillBadge.findMany({ where: { userId: { in: userIds } }, select: { userId: true, skillId: true } })).map((b) => `${b.userId}:${b.skillId}`));
  let badges = 0;
  const notifications: Parameters<typeof notifyDirect>[0][number][] = [];
  for (const [key, rows] of grouped) {
    const [userId, skillId] = key.split(":");
    const skill = skillById.get(skillId);
    if (!skill || !skill.isActive || badgesHave.has(key)) continue;
    const criteria = sameCriteria(skill.criteria);
    let sum = { tasksDone: 0, storyPointsX10: 0, reviewScoreSumX10: 0, reviewScoreCount: 0 };
    let hitAt = -1;
    for (let i = 0; i < rows.length; i += 1) {
      sum = {
        tasksDone: sum.tasksDone + 1,
        storyPointsX10: sum.storyPointsX10 + rows[i].storyPointsX10,
        reviewScoreSumX10: sum.reviewScoreSumX10 + (rows[i].reviewScoreX10 ?? 0),
        reviewScoreCount: sum.reviewScoreCount + (rows[i].reviewScoreX10 === null ? 0 : 1),
      };
      if (evaluateSkillCriteria(criteria, sum)) {
        hitAt = i;
        break;
      }
    }
    if (hitAt < 0) continue;
    const upto = rows.slice(0, hitAt + 1);
    const top = [...upto]
      .sort((a, b) => b.storyPointsX10 - a.storyPointsX10 || (b.reviewScoreX10 ?? -1) - (a.reviewScoreX10 ?? -1) || b.completedAt.getTime() - a.completedAt.getTime())
      .slice(0, LIMITS.skill.proofTasksMax);
    const unlockedAt = clampTime(notBeforeAccount(userId, new Date(rows[hitAt].completedAt.getTime() + 90_000)), rows[hitAt].completedAt, c.now);
    await prisma.userSkillBadge.create({
      data: {
        userId,
        skillId,
        unlockedAt,
        proof: { taskCreditIds: top.map((r) => r.id), tasksDone: sum.tasksDone, storyPointsX10: sum.storyPointsX10, avgPeerScoreX10: avgPeerScoreX10(sum) },
        criteriaSnapshot: criteria,
        // `revokedAt: null` tường minh — app lọc huy hiệu còn hiệu lực bằng `{ revokedAt: null }`.
        revokedAt: null,
        revokedBy: null,
        revokedReason: null,
      },
    });
    badges += 1;
    const dedupe = `skill-unlocked:${userId}:${skillId}`;
    notifications.push({
      type: "career.skill-unlocked",
      recipientId: userId,
      sourceType: "UserSkillBadge",
      sourceId: dedupe,
      refs: { skillId, code: skill.code, name: skill.name, icon: skill.icon },
      dedupeKey: dedupe,
      createdAt: unlockedAt,
      unread: c.now.getTime() - unlockedAt.getTime() < 2 * DAY_MS,
    });
  }
  const sent = await notifyDirect(notifications, c.now);
  return { credits: fresh.length, progress: progressChanged, badges, skills: skills.length, active: skills.filter((s) => s.isActive).length, notifications: sent };
}

export const seedCareer: ModuleSeed = async (c) => {
  const profiles = await seedProfiles(c);
  const ledger = await seedSkillLedger(c);
  const skillNote = ledger.skills === 0 ? "chưa có SkillDefinition nào — bỏ qua tiến độ kỹ năng" : `${ledger.active}/${ledger.skills} kỹ năng đang bật`;
  return `career: +${profiles.created} hồ sơ nghề (${profiles.existing} có sẵn, ${profiles.openToWork} mở nhận lời mời), +${ledger.credits} tín dụng thẻ, ${ledger.progress} tiến độ kỹ năng ghi/đổi, +${ledger.badges} huy hiệu (+${ledger.notifications} thông báo); ${skillNote}`;
};
