/**
 * Lời mời việc làm, hạn mức tháng và lượt xem hồ sơ của seed `recruiter` (tách khỏi `recruiter.ts` cho gọn). Xem tiêu đề `recruiter.ts` về các quy ước đối chiếu.
 */
import { newObjectId } from "../../../../src/core/utils/object-id";
import { LIMITS } from "../../../../src/core/constants/limits";
import { offerClosedKey, offerOpenKey } from "../../../../src/modules/recruiter/domain/company-keys";
import { dayKeyOf, periodKeyOf } from "../../../../src/modules/recruiter/domain/periods";
import { DAY_MS, prisma } from "../core";
import type { ModuleCtx } from "../module-ctx";
import { clampTime, maxDate, minDate, snapActive, type DirectNotification, type UserInfo } from "./career-common";
import { OFFERS, PROFILE_VIEWS, type CompanySpec } from "./recruiter.content";

const HOUR = 3_600_000;

export interface CompanyRef {
  id: string;
  spec: CompanySpec;
  ownerId: string;
  status: string;
  createdAt: Date;
  approvedAt: Date | null;
  version: number;
}

interface OfferResult {
  offers: number;
  messages: number;
  byStatus: Record<string, number>;
  notifications: DirectNotification[];
}

export async function runOffers(c: ModuleCtx, users: Map<string, UserInfo>, companies: Map<string, CompanyRef>): Promise<OfferResult> {
  const out: OfferResult = { offers: 0, messages: 0, byStatus: {}, notifications: [] };
  const studentIds = [...new Set(OFFERS.map((o) => users.get(o.student)?.id).filter((x): x is string => !!x))];
  const careers = new Map((studentIds.length === 0 ? [] : await prisma.userCareer.findMany({ where: { userId: { in: studentIds } } })).map((r) => [r.userId, r]));
  const index = new Map((studentIds.length === 0 ? [] : await prisma.talentSearchIndex.findMany({ where: { userId: { in: studentIds } }, select: { userId: true, blockedCompanyIds: true } })).map((r) => [r.userId, r.blockedCompanyIds]));

  for (let i = 0; i < OFFERS.length; i += 1) {
    const spec = OFFERS[i];
    const co = companies.get(spec.company);
    const student = users.get(spec.student);
    const recruiter = co ? users.get(co.spec.owner) : undefined;
    if (!co || !student || !recruiter || co.status !== "APPROVED") continue;
    const clientRequestId = `seed-rich:offer:${i}`;
    if (await prisma.jobOffer.findUnique({ where: { recruiterId_clientRequestId: { recruiterId: recruiter.id, clientRequestId } }, select: { id: true } })) continue;
    // Điều kiện gửi (assertTargetable): sinh viên có bản chiếu (đang mở nhận lời mời), chưa chặn công ty, chưa có lời mời mở với công ty này.
    const blocked = index.get(student.id);
    if (!blocked || blocked.includes(co.id)) continue;
    if ((await prisma.jobOffer.count({ where: { studentId: student.id, companyId: co.id, status: { in: ["SENT", "READ", "INTERESTED"] } } })) > 0) continue;

    const consentAt = careers.get(student.id)?.openToWorkChangedAt ?? student.createdAt;
    const ceiling = new Date(c.now.getTime() - 2 * 60_000);
    // Mọi mốc đều rơi vào khung sinh hoạt (snapActive) và tăng dần.
    const after = (t: Date, prev: Date): Date => minDate(ceiling, maxDate(snapActive(t), prev));
    const sentAt = minDate(ceiling, snapActive(maxDate(new Date(c.now.getTime() - spec.sentDaysAgo * DAY_MS), new Date((co.approvedAt ?? co.createdAt).getTime() + 2 * HOUR), new Date(consentAt.getTime() + 2 * HOUR))));
    const readAt = spec.status === "SENT" ? null : after(new Date(sentAt.getTime() + (spec.readAfterHours ?? 4) * HOUR), sentAt);
    const respondedAt =
      spec.status === "INTERESTED" || spec.status === "DECLINED" ? after(new Date((readAt as Date).getTime() + (spec.respondAfterHours ?? 6) * HOUR), readAt as Date) : null;
    const withdrawnAt = spec.status === "WITHDRAWN" ? after(new Date((readAt as Date).getTime() + (spec.respondAfterHours ?? 48) * HOUR), readAt as Date) : null;
    const id = newObjectId();
    const closed = spec.status === "DECLINED" || spec.status === "WITHDRAWN";

    // Tin nhắn: chỉ khi INTERESTED. Mỗi bên "mở thread" ngay trước khi gửi nên chưa-đọc của bên gửi = 0; bên kia = số tin liên tiếp cuối cùng.
    let prevAt = respondedAt as Date;
    const msgs = (spec.status === "INTERESTED" ? (spec.thread ?? []) : []).map((m, k) => {
      prevAt = after(new Date((respondedAt as Date).getTime() + m.afterMinutes * 60_000), new Date(prevAt.getTime() + 60_000));
      return {
        id: newObjectId(),
        side: m.side,
        authorId: m.side === "COMPANY" ? recruiter.id : student.id,
        content: m.text,
        clientMessageId: `seed-rich:offer-msg:${i}:${k}`,
        createdAt: prevAt,
      };
    });
    let studentUnread = 0;
    let companyUnread = 0;
    for (const m of msgs) {
      if (m.side === "COMPANY") {
        studentUnread += 1;
        companyUnread = 0;
      } else {
        companyUnread += 1;
        studentUnread = 0;
      }
    }
    const last = msgs[msgs.length - 1];
    const version = 1 + (readAt ? 1 : 0) + (respondedAt || withdrawnAt ? 1 : 0);
    await prisma.$transaction(
      async (tx) => {
      await tx.jobOffer.create({
        data: {
          id,
          companyId: co.id,
          recruiterId: recruiter.id,
          studentId: student.id,
          title: spec.title,
          message: spec.message,
          employmentType: spec.employmentType,
          location: spec.location,
          jdAssetId: null,
          status: spec.status,
          activeKey: closed ? offerClosedKey(id) : offerOpenKey(co.id, student.id),
          clientRequestId,
          // Email mẫu của tài khoản seed (miền giả `seed.superapp.local`) — chỉ khi sinh viên chọn chia sẻ lúc Quan tâm.
          sharedEmail: spec.status === "INTERESTED" && spec.shareEmail ? student.email : null,
          declineReason: spec.declineReason ?? null,
          threadLocked: closed,
          studentUnread,
          companyUnread,
          reportedCount: 0,
          sentAt,
          readAt,
          respondedAt,
          withdrawnAt,
          expiresAt: new Date(sentAt.getTime() + LIMITS.offer.expiresDays * DAY_MS),
          lastMessageAt: last ? last.createdAt : null,
          version,
        },
      });
      if (msgs.length > 0) await tx.jobOfferMessage.createMany({ data: msgs.map((m) => ({ id: m.id, offerId: id, authorId: m.authorId, side: m.side, content: m.content, clientMessageId: m.clientMessageId, createdAt: m.createdAt, deletedAt: null })) });
      },
      { timeout: 30_000, maxWait: 10_000 }
    );
    out.offers += 1;
    out.messages += msgs.length;
    out.byStatus[spec.status] = (out.byStatus[spec.status] ?? 0) + 1;

    // Thông báo (đúng loại/khoá dedupe như dịch vụ): lời mời tới sinh viên, phản hồi tới HR, mỗi tin nhắn tới bên kia.
    const day = 2 * DAY_MS;
    out.notifications.push({
      type: "job-offer.received",
      recipientId: student.id,
      actorId: recruiter.id,
      sourceType: "JobOffer",
      sourceId: `job-offer:${id}:received`,
      refs: { offerId: id, companyId: co.id, companyName: co.spec.name },
      dedupeKey: `job-offer.received:offer:${id}`,
      createdAt: sentAt,
      unread: spec.status === "SENT",
    });
    if (respondedAt) {
      out.notifications.push({
        type: "job-offer.responded",
        recipientId: recruiter.id,
        actorId: student.id,
        sourceType: "JobOffer",
        sourceId: `job-offer:${id}:responded:v${version}`,
        refs: { offerId: id, companyId: co.id, companyName: co.spec.name, status: spec.status },
        dedupeKey: `job-offer.responded:offer:${id}:v${version}`,
        createdAt: respondedAt,
        unread: c.now.getTime() - respondedAt.getTime() < day,
      });
    }
    const run = last ? (last.side === "COMPANY" ? studentUnread : companyUnread) : 0;
    msgs.forEach((m, k) => {
      const toStudent = m.side === "COMPANY";
      out.notifications.push({
        type: "job-offer.message",
        recipientId: toStudent ? student.id : recruiter.id,
        actorId: m.authorId,
        sourceType: "JobOffer",
        sourceId: `job-offer:${id}:message:${m.id}`,
        refs: { offerId: id, companyId: co.id },
        dedupeKey: `job-offer.message:msg:${m.id}`,
        createdAt: m.createdAt,
        // Chưa đọc = các tin liên tiếp cuối cùng của một bên (khớp bộ đếm studentUnread/companyUnread).
        unread: m.side === last?.side && k >= msgs.length - run,
      });
    });
  }
  return out;
}

/** Bộ đếm hạn mức tháng = số lời mời công ty đã gửi trong tháng (giờ VN); chỉ nâng lên, không bao giờ hạ số đã có. */
export async function syncUsage(companies: Map<string, CompanyRef>): Promise<number> {
  let n = 0;
  for (const co of companies.values()) {
    const offers = await prisma.jobOffer.findMany({ where: { companyId: co.id }, select: { sentAt: true } });
    const byPeriod = new Map<string, number>();
    for (const o of offers) byPeriod.set(periodKeyOf(o.sentAt), (byPeriod.get(periodKeyOf(o.sentAt)) ?? 0) + 1);
    for (const [period, used] of byPeriod) {
      const row = await prisma.companyOfferUsage.findUnique({ where: { companyId_period: { companyId: co.id, period } } });
      if (!row) {
        await prisma.companyOfferUsage.create({ data: { companyId: co.id, period, used } });
        n += 1;
      } else if (row.used < used) {
        await prisma.companyOfferUsage.update({ where: { id: row.id }, data: { used } });
        n += 1;
      }
    }
  }
  return n;
}

export async function runProfileViews(c: ModuleCtx, users: Map<string, UserInfo>, companies: Map<string, CompanyRef>): Promise<number> {
  let n = 0;
  for (const v of PROFILE_VIEWS) {
    const co = companies.get(v.company);
    const student = users.get(v.student);
    const owner = co ? users.get(co.spec.owner) : undefined;
    if (!co || !student || !owner || co.status !== "APPROVED") continue;
    // Idempotent theo cặp (công ty, sinh viên): đã có lượt xem nào (seed lần trước hoặc HR thật) thì không thêm — mốc ngày phụ thuộc lúc chạy nên không dùng làm khoá.
    if ((await prisma.talentProfileView.count({ where: { companyId: co.id, studentId: student.id } })) > 0) continue;
    const doc = await prisma.talentSearchIndex.findUnique({ where: { userId: student.id }, select: { blockedCompanyIds: true } });
    if (!doc || doc.blockedCompanyIds.includes(co.id)) continue; // HR chỉ xem được hồ sơ có trong bản chiếu và không chặn mình
    const consentAt = (await prisma.userCareer.findUnique({ where: { userId: student.id }, select: { openToWorkChangedAt: true } }))?.openToWorkChangedAt ?? student.createdAt;
    const offer = await prisma.jobOffer.findFirst({ where: { companyId: co.id, studentId: student.id }, orderBy: { sentAt: "asc" }, select: { sentAt: true } });
    const lower = new Date(maxDate(co.approvedAt ?? co.createdAt, consentAt).getTime() + HOUR);
    const upper = offer ? new Date(offer.sentAt.getTime() - 15 * 60_000) : new Date(c.now.getTime() - 30 * 60_000);
    if (lower > upper) continue;
    const perDay = new Map<string, { count: number; last: Date }>();
    for (const [daysAgo, count] of v.views) {
      const at = clampTime(snapActive(new Date(c.now.getTime() - daysAgo * DAY_MS)), lower, upper);
      const key = dayKeyOf(at);
      const cur = perDay.get(key);
      perDay.set(key, { count: (cur?.count ?? 0) + count, last: cur && cur.last > at ? cur.last : at });
    }
    for (const [dayKey, { count, last }] of perDay) {
      if (await prisma.talentProfileView.findUnique({ where: { companyId_studentId_dayKey: { companyId: co.id, studentId: student.id, dayKey } }, select: { id: true } })) continue;
      await prisma.talentProfileView.create({ data: { companyId: co.id, studentId: student.id, dayKey, viewCount: count, recruiterIds: [owner.id], lastViewedAt: last } });
      n += 1;
    }
  }
  return n;
}

