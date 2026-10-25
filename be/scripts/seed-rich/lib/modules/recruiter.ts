/**
 * Seed phân hệ `recruiter` (p6-08): 3 doanh nghiệp hư cấu + nhân sự, bản chiếu tìm kiếm `TalentSearchIndex`, chặn doanh nghiệp, lượt xem hồ sơ,
 * lời mời việc làm (đủ trạng thái SENT/READ/INTERESTED/DECLINED/WITHDRAWN) kèm tin nhắn thương lượng và bộ đếm hạn mức tháng.
 *
 * Quyền riêng tư: bản chiếu dựng bằng ĐÚNG hàm thuần `buildTalentIndexDoc` của dịch vụ từ `UserCareer`/huy hiệu/điểm đóng góp/liên kết portfolio —
 * người chưa bật "mở nhận lời mời" không có bản chiếu, `showSkills=false` thì không lộ kỹ năng, `showContribution=false` thì không lộ điểm. Lời mời chỉ
 * gửi cho người CÓ bản chiếu, chưa chặn công ty đó (đúng `assertTargetable`). Thứ tự chạy khuyến nghị: career → portfolio → recruiter.
 * KHÔNG ghi Asset (không logo/JD), KHÔNG outbox/socket; thông báo ghi trực tiếp, không push.
 */
import { newObjectId } from "../../../../src/core/utils/object-id";
import { normalizeSearch } from "../../../../src/core/utils/normalize";
import { emailDomainOf, nameKeyOf, taxCodeKeyOf } from "../../../../src/modules/recruiter/domain/company-keys";
import { buildTalentIndexDoc, type TalentIndexSource } from "../../../../src/modules/recruiter/domain/talent-index.builder";
import { portfolioBaseUrl } from "../../../../src/modules/portfolio/services/portfolio-paths";
import { DAY_MS, prisma, rngFrom } from "../core";
import type { ModuleCtx, ModuleSeed } from "../module-ctx";
import { CAREER_PROFILES } from "./career.content";
import { seedCareer } from "./career";
import { careerScore, loadContributionAggregates } from "./career-source";
import { clampTime, loadUsers, maxDate, notifyDirect, snapActive, type DirectNotification, type UserInfo } from "./career-common";
import { runOffers, runProfileViews, syncUsage, type CompanyRef } from "./recruiter-offers";
import { BLOCKS, COMPANIES, OFFERS, PROFILE_VIEWS } from "./recruiter.content";

const HOUR = 3_600_000;

async function seedCompanies(c: ModuleCtx, users: Map<string, UserInfo>): Promise<{ refs: Map<string, CompanyRef>; created: number; members: number; skipped: number }> {
  const refs = new Map<string, CompanyRef>();
  let created = 0;
  let members = 0;
  let skipped = 0;
  for (const spec of COMPANIES) {
    const owner = users.get(spec.owner);
    if (!owner) continue;
    let row = await prisma.company.findFirst({ where: { nameKey: nameKeyOf(spec.name) } });
    if (!row) {
      const mine = await prisma.companyMember.findFirst({ where: { userId: owner.id, status: "ACTIVE" }, select: { id: true } });
      if (mine) {
        skipped += 1; // người này đã thuộc một doanh nghiệp khác (một người ≤ 1 doanh nghiệp)
        continue;
      }
      const rng = rngFrom(`company:${spec.key}`);
      const id = newObjectId();
      const createdAt = clampTime(snapActive(new Date(c.now.getTime() - spec.createdDaysAgo * DAY_MS + Math.floor(rng() * 4 * HOUR))), new Date(owner.createdAt.getTime() + 3 * HOUR), new Date(c.now.getTime() - 6 * HOUR));
      const approved = spec.status === "APPROVED";
      const approvedAt = approved ? clampTime(snapActive(new Date(c.now.getTime() - (spec.approvedDaysAgo ?? 1) * DAY_MS + Math.floor(rng() * 3 * HOUR))), new Date(createdAt.getTime() + 20 * HOUR), new Date(c.now.getTime() - 4 * HOUR)) : null;
      row = await prisma.company.create({
        data: {
          id,
          name: spec.name,
          normalizedName: normalizeSearch(spec.name),
          nameKey: nameKeyOf(spec.name),
          taxCode: null,
          taxCodeKey: taxCodeKeyOf(null, id),
          website: spec.website,
          emailDomain: emailDomainOf(spec.website),
          description: spec.description,
          logoAssetId: null,
          industry: spec.industry,
          sizeRange: spec.sizeRange,
          tier: spec.tier,
          offerQuotaOverride: null,
          status: spec.status,
          statusReason: null,
          // Seed không giả danh một nhân sự vận hành thật đã duyệt: người duyệt để trống, vẫn có mốc duyệt.
          reviewedBy: null,
          reviewedAt: approvedAt,
          reportedCount: 0,
          createdBy: owner.id,
          version: approved ? 2 : 1,
          createdAt,
          updatedAt: approvedAt ?? createdAt,
        },
      });
      created += 1;
    }
    if (!(await prisma.companyMember.findUnique({ where: { companyId_userId: { companyId: row.id, userId: owner.id } }, select: { id: true } }))) {
      if (!(await prisma.companyMember.findFirst({ where: { userId: owner.id, status: "ACTIVE" }, select: { id: true } }))) {
        await prisma.companyMember.create({ data: { companyId: row.id, userId: owner.id, role: "OWNER", status: "ACTIVE", activeKey: owner.id, invitedBy: null, joinedAt: row.createdAt, removedAt: null } });
        members += 1;
      }
    }
    refs.set(spec.key, { id: row.id, spec, ownerId: owner.id, status: row.status, createdAt: row.createdAt, approvedAt: row.reviewedAt ?? null, version: row.version });
  }
  return { refs, created, members, skipped };
}

async function seedBlocks(c: ModuleCtx, users: Map<string, UserInfo>, companies: Map<string, CompanyRef>): Promise<number> {
  let n = 0;
  for (const b of BLOCKS) {
    const u = users.get(b.student);
    const co = companies.get(b.company);
    if (!u || !co) continue;
    if (await prisma.companyBlock.findUnique({ where: { userId_companyId: { userId: u.id, companyId: co.id } }, select: { id: true } })) continue;
    const at = clampTime(snapActive(new Date(c.now.getTime() - b.daysAgo * DAY_MS)), maxDate(u.createdAt, co.createdAt), c.now);
    await prisma.companyBlock.create({ data: { userId: u.id, companyId: co.id, createdAt: at } });
    n += 1;
  }
  return n;
}

const searchKey = (d: { openToWork: boolean; displayName: string; normalizedText: string; headline: string | null; preferredRolesKey: string[]; locationKey: string | null; skillCodes: string[]; badgeCount: number; contributionPctX10: number | null; contributionWorkspaces: number | null; portfolioUrl: string | null; blockedCompanyIds: string[]; avatarAssetId: string | null }): string =>
  JSON.stringify([d.openToWork, d.displayName, d.normalizedText, d.headline, d.preferredRolesKey, d.locationKey, d.skillCodes, d.badgeCount, d.contributionPctX10, d.contributionWorkspaces, d.portfolioUrl, [...d.blockedCompanyIds].sort(), d.avatarAssetId]);

async function seedIndex(c: ModuleCtx): Promise<{ created: number; updated: number; removed: number; total: number }> {
  const users = await loadUsers(c, CAREER_PROFILES.map((p) => p.key));
  const ids = [...users.values()].map((u) => u.id);
  const none = { created: 0, updated: 0, removed: 0, total: 0 };
  if (ids.length === 0) return none;
  const careers = new Map((await prisma.userCareer.findMany({ where: { userId: { in: ids } } })).map((r) => [r.userId, r]));
  const badgeRows = await prisma.userSkillBadge.findMany({ where: { userId: { in: ids }, revokedAt: null }, orderBy: [{ unlockedAt: "desc" }] });
  const skillIds = [...new Set(badgeRows.map((b) => b.skillId))];
  const skills = new Map((skillIds.length === 0 ? [] : await prisma.skillDefinition.findMany({ where: { id: { in: skillIds } } })).map((s) => [s.id, s]));
  const blocks = await prisma.companyBlock.findMany({ where: { userId: { in: ids } }, select: { userId: true, companyId: true } });
  const published = new Map((await prisma.portfolio.findMany({ where: { userId: { in: ids }, status: "PUBLISHED", takenDownAt: null }, select: { userId: true, slug: true } })).map((p) => [p.userId, p.slug]));
  const agg = await loadContributionAggregates(ids);
  let created = 0;
  let updated = 0;
  let removed = 0;
  let total = 0;
  for (const u of users.values()) {
    const career = careers.get(u.id);
    const existing = await prisma.talentSearchIndex.findUnique({ where: { userId: u.id } });
    const vis = career?.visibility;
    const src: TalentIndexSource | null = career
      ? {
          now: c.now,
          user: { id: u.id, name: u.name, status: u.status, avatarAssetId: u.avatarAssetId },
          career: { openToWork: career.openToWork, headline: career.headline ?? null, preferredRoles: career.preferredRoles, location: career.location ?? null, updatedAt: career.updatedAt, visibility: { showSkills: vis?.showSkills ?? true, showContribution: vis?.showContribution ?? false } },
          badges: badgeRows.filter((b) => b.userId === u.id).flatMap((b) => { const s = skills.get(b.skillId); return s ? [{ skill: { id: s.id, code: s.code, name: s.name, icon: s.icon } }] : []; }),
          contribution: vis?.showContribution ? careerScore(u.id, agg) : null,
          portfolioUrl: published.has(u.id) ? `${portfolioBaseUrl()}/${published.get(u.id)}` : null,
          blockedCompanyIds: blocks.filter((b) => b.userId === u.id).map((b) => b.companyId),
        }
      : null;
    const doc = src ? buildTalentIndexDoc(src) : null;
    if (!doc) {
      if (existing) {
        await prisma.talentSearchIndex.deleteMany({ where: { userId: u.id } });
        removed += 1;
      }
      continue;
    }
    total += 1;
    const { skills: docSkills, ...rest } = doc;
    const skillRefs = docSkills.map((s) => ({ skillId: s.skillId, code: s.code, name: s.name, icon: s.icon }));
    if (!existing) {
      await prisma.talentSearchIndex.create({ data: { ...rest, skills: skillRefs } });
      created += 1;
    } else if (searchKey(existing) !== searchKey(doc)) {
      await prisma.talentSearchIndex.update({ where: { userId: u.id }, data: { ...rest, skills: { set: skillRefs } } });
      updated += 1;
    }
  }
  return { created, updated, removed, total };
}

export const seedRecruiter: ModuleSeed = async (c) => {
  const keys = [
    ...COMPANIES.map((x) => x.owner),
    ...OFFERS.map((o) => o.student),
    ...PROFILE_VIEWS.map((v) => v.student),
    ...BLOCKS.map((b) => b.student),
  ];
  const users = await loadUsers(c, keys);
  // Bản chiếu tìm kiếm dựng từ `UserCareer`: nếu bộ seed career chưa chạy thì chạy trước (idempotent).
  const careerIds = [...(await loadUsers(c, CAREER_PROFILES.map((p) => p.key))).values()].map((u) => u.id);
  if (careerIds.length > 0 && (await prisma.userCareer.count({ where: { userId: { in: careerIds } } })) < careerIds.length) await seedCareer(c);
  const co = await seedCompanies(c, users);
  const blocks = await seedBlocks(c, users, co.refs);
  const index = await seedIndex(c);
  const offers = await runOffers(c, users, co.refs);
  const usage = await syncUsage(co.refs);
  const views = await runProfileViews(c, users, co.refs);

  const notes: DirectNotification[] = [...offers.notifications];
  for (const ref of co.refs.values()) {
    if (ref.status !== "APPROVED" || !ref.approvedAt) continue;
    notes.push({
      type: "company.status-changed",
      recipientId: ref.ownerId,
      sourceType: "Company",
      sourceId: `company:${ref.id}:v${ref.version}`,
      refs: { companyId: ref.id, status: "APPROVED" },
      dedupeKey: `company.status:${ref.id}:v${ref.version}`,
      createdAt: ref.approvedAt,
      unread: false,
    });
  }
  const sent = await notifyDirect(notes, c.now);
  const statuses = Object.entries(offers.byStatus).map(([s, n]) => `${n} ${s}`).join(", ");
  return `recruiter: +${co.created} công ty (+${co.members} nhân sự${co.skipped ? `, ${co.skipped} bỏ qua vì người đại diện đã thuộc công ty khác` : ""}), index ${index.total} người (+${index.created} mới, ${index.updated} cập nhật, ${index.removed} xoá), +${blocks} chặn, +${offers.offers} lời mời${statuses ? ` (${statuses})` : ""}, +${offers.messages} tin nhắn, ${usage} bộ đếm hạn mức, +${views} lượt xem hồ sơ, +${sent} thông báo`;
};
