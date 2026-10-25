import { DOMAIN_EVENTS, eventKeys, portfolioBuildSchema, portfolioPublishedSchema, portfolioUnpublishedSchema, skillBadgeEventSchema } from "../../../shared/events/domain-events";
import { SocketEvent } from "../../../infrastructure/socket/socket.events";
import { newObjectId } from "../../../core/utils/object-id";
import { toSafeJobId } from "../../../infrastructure/queue";
import { buildRow, publishedRow, purgeRow, unpublishedRow, PORTFOLIO_BUILD_JOB, PORTFOLIO_EVENTS_JOB, PORTFOLIO_PURGE_JOB } from "../services/portfolio-outbox-rows";
import { PORTFOLIO_NOTIFICATION_TYPES } from "../notifications/portfolio.notification-types";

/** Hợp đồng sự kiện/job/socket: hàng outbox producer dựng ra PHẢI parse được bằng schema Zod mà consumer dùng (p6-08 lập chỉ mục từ `portfolio.published|unpublished`). */
const pf = newObjectId();
const user = newObjectId();
const at = new Date("2026-09-26T03:00:00.000Z");

describe("hàng outbox ↔ schema Zod", () => {
  it("portfolio.build: queue reports, jobName, dedupeKey theo (portfolio, buildVersion), payload hợp lệ", () => {
    const row = buildRow(pf, 3);
    expect(row).toMatchObject({ queue: "reports", jobName: PORTFOLIO_BUILD_JOB, type: "portfolio.build", aggregateType: "Portfolio", aggregateId: pf, dedupeKey: `portfolio.build:portfolio:${pf}:b3` });
    expect(portfolioBuildSchema.parse(row.payload)).toEqual({ event: "portfolio.build", portfolioId: pf, buildVersion: 3 });
  });

  it("portfolio.published: payload { portfolioId, userId, slug, url, buildVersion, at ISO } parse được; routing về processor `portfolio.events`", () => {
    const row = publishedRow({ portfolioId: pf, userId: user, slug: "an-dev", url: "https://superapp.vcijsc.com/p/an-dev", buildVersion: 2 }, at);
    expect(row).toMatchObject({ queue: "reports", jobName: PORTFOLIO_EVENTS_JOB, dedupeKey: `portfolio.published:portfolio:${pf}:b2` });
    expect(portfolioPublishedSchema.parse(row.payload)).toMatchObject({ event: "portfolio.published", slug: "an-dev", url: "https://superapp.vcijsc.com/p/an-dev", at: at.toISOString() });
    expect(portfolioUnpublishedSchema.safeParse(row.payload).success).toBe(false);
  });

  it.each(["UNPUBLISH", "TAKEDOWN", "ANONYMIZED"] as const)("portfolio.unpublished lý do %s parse được; dedupeKey có hậu tố thời điểm", (reason) => {
    const row = unpublishedRow({ portfolioId: pf, userId: user, reason }, at);
    expect(portfolioUnpublishedSchema.parse(row.payload)).toMatchObject({ event: "portfolio.unpublished", reason });
    expect(row.dedupeKey).toBe(`portfolio.unpublished:portfolio:${pf}:t${at.getTime()}`);
    expect(portfolioPublishedSchema.safeParse(row.payload).success).toBe(false);
  });

  it("purge-build: trễ tính bằng delayMs, dedupeKey có hậu tố thời điểm (một build có thể xếp dọn nhiều lần mà không trùng khoá)", () => {
    const a = purgeRow(pf, 1, 600_000, at);
    const b = purgeRow(pf, 1, 600_000, new Date(at.getTime() + 1));
    expect(a).toMatchObject({ queue: "reports", jobName: PORTFOLIO_PURGE_JOB, delayMs: 600_000, payload: { portfolioId: pf, buildVersion: 1 } });
    expect(a.dedupeKey).not.toBe(b.dedupeKey);
  });

  it("schema từ chối payload sai: id không phải ObjectId, buildVersion < 1, lý do lạ", () => {
    expect(portfolioBuildSchema.safeParse({ event: "portfolio.build", portfolioId: "x", buildVersion: 1 }).success).toBe(false);
    expect(portfolioBuildSchema.safeParse({ event: "portfolio.build", portfolioId: pf, buildVersion: 0 }).success).toBe(false);
    expect(portfolioUnpublishedSchema.safeParse({ event: "portfolio.unpublished", portfolioId: pf, userId: user, reason: "KHAC", at: at.toISOString() }).success).toBe(false);
  });
});

describe("jobId BullMQ", () => {
  it("mọi dedupeKey qua toSafeJobId không còn dấu ':' (BullMQ chỉ chấp nhận 0 hoặc đúng 2 dấu ':')", () => {
    for (const key of [eventKeys.portfolioBuild(pf, 1), eventKeys.portfolioPublished(pf, 1), eventKeys.portfolioUnpublished(pf, 5), eventKeys.portfolioPurgeBuild(pf, 1, 5)]) {
      expect(toSafeJobId(key)).not.toContain(":");
    }
    const skill = { event: "skill.revoked", userId: user, skillId: newObjectId(), code: "reactjs", name: "ReactJS", icon: "x", at: at.toISOString() };
    expect(skillBadgeEventSchema.safeParse(skill).success).toBe(true);
    expect(toSafeJobId(`portfolio.skill-revoked:${skill.userId}:${skill.skillId}:${skill.at}`)).not.toContain(":");
  });
});

describe("tên sự kiện / socket / thông báo (khớp be.md)", () => {
  it("DOMAIN_EVENTS và SocketEvent", () => {
    expect(DOMAIN_EVENTS.PORTFOLIO_PUBLISHED).toBe("portfolio.published");
    expect(DOMAIN_EVENTS.PORTFOLIO_UNPUBLISHED).toBe("portfolio.unpublished");
    expect(DOMAIN_EVENTS.PORTFOLIO_BUILD).toBe("portfolio.build");
    expect(SocketEvent.PORTFOLIO_BUILD_UPDATED).toBe("portfolio:build-updated");
  });

  it("loại thông báo theo quy ước dấu chấm hiện hành", () => {
    expect(PORTFOLIO_NOTIFICATION_TYPES).toEqual({ BUILD_FAILED: "portfolio.build-failed", TAKEN_DOWN: "portfolio.taken-down" });
  });
});
