import { dayKeyOf, periodKeyOf, recentPeriods, remainingQuota } from "../domain/periods";
import { emailDomainOf, memberActiveKey, memberRemovedKey, nameKeyOf, offerClosedKey, offerOpenKey, releasedNameKey, releasedTaxCodeKey, taxCodeKeyOf } from "../domain/company-keys";
import { companyActionsFor, dataPermissionsFor, effectiveThreadLocked, isOpenOffer, isThreadOpen, nextCompanyStatus, nextOfferStatus, offerFromStatuses, type CompanyAction, type OfferAction } from "../domain/state-machines";
import { COMPANY_STATUSES, OFFER_STATUSES } from "../entities/recruiter.interface";

describe("periods — kỳ tháng/ngày theo Asia/Ho_Chi_Minh (hạn mức lời mời)", () => {
  it("23:59 ngày cuối tháng (giờ VN) còn thuộc tháng đó; 00:01 ngày đầu tháng sau sang kỳ mới dù cùng ngày UTC", () => {
    // 2026-09-30 23:59 ICT = 2026-09-30T16:59Z; 2026-10-01 00:01 ICT = 2026-09-30T17:01Z (cùng ngày 30/09 theo UTC).
    expect(periodKeyOf(new Date("2026-09-30T16:59:00Z"))).toBe("2026-09");
    expect(periodKeyOf(new Date("2026-09-30T17:01:00Z"))).toBe("2026-10");
  });

  it("dayKeyOf theo múi giờ VN (quanh nửa đêm)", () => {
    expect(dayKeyOf(new Date("2026-09-14T16:59:00Z"))).toBe("2026-09-14");
    expect(dayKeyOf(new Date("2026-09-14T17:00:00Z"))).toBe("2026-09-15");
  });

  it("chấp nhận múi giờ khác (UTC) — tháng đổi đúng lúc 00:00 UTC", () => {
    expect(periodKeyOf(new Date("2026-09-30T23:59:00Z"), "UTC")).toBe("2026-09");
    expect(periodKeyOf(new Date("2026-10-01T00:00:00Z"), "UTC")).toBe("2026-10");
  });

  it("recentPeriods lùi qua ranh giới năm, mới → cũ", () => {
    expect(recentPeriods(new Date("2026-02-10T00:00:00Z"), 4)).toEqual(["2026-02", "2026-01", "2025-12", "2025-11"]);
    expect(recentPeriods(new Date("2026-09-15T00:00:00Z"), 1)).toEqual(["2026-09"]);
  });

  it("remainingQuota không âm", () => {
    expect(remainingQuota(5, 2)).toBe(3);
    expect(remainingQuota(5, 9)).toBe(0);
  });
});

describe("company-keys — khoá unique KHÔNG bao giờ null (Mongo coi vắng/null là một giá trị trong unique index)", () => {
  it("nameKey bỏ dấu/khoảng trắng/dấu câu, chữ thường: 'Công ty A.C.M.E' == 'cong ty acme'", () => {
    expect(nameKeyOf("Công ty A.C.M.E")).toBe("congtyacme");
    expect(nameKeyOf("  CONG  ty  ACME ")).toBe("congtyacme");
    expect(nameKeyOf("!!")).toBe("");
  });

  it("taxCodeKey: có MST → bỏ gạch; không MST → sentinel theo id (hai công ty không MST không đụng nhau)", () => {
    expect(taxCodeKeyOf("0123456789-001", "c1")).toBe("0123456789001");
    expect(taxCodeKeyOf(undefined, "c1")).toBe("none:c1");
    expect(taxCodeKeyOf(null, "c2")).toBe("none:c2");
    expect(taxCodeKeyOf(null, "c1")).not.toBe(taxCodeKeyOf(null, "c2"));
  });

  it("sentinel nhả khoá khi REJECTED và khoá thành viên/lời mời", () => {
    expect(releasedNameKey("c1")).toBe("rejected:c1");
    expect(releasedTaxCodeKey("c1")).toBe("none:c1");
    expect(memberActiveKey("u1")).toBe("u1");
    expect(memberRemovedKey("m1")).toBe("removed:m1");
    expect(offerOpenKey("c1", "s1")).toBe("c1:s1");
    expect(offerClosedKey("o1")).toBe("closed:o1");
  });

  it("emailDomainOf: bỏ www, chữ thường; URL hỏng → null", () => {
    expect(emailDomainOf("https://www.Acme.vn/about")).toBe("acme.vn");
    expect(emailDomainOf("http://jobs.acme.vn")).toBe("jobs.acme.vn");
    expect(emailDomainOf("không phải url")).toBeNull();
  });
});

describe("state-machines — bảng chuyển trạng thái (be.md §5)", () => {
  const companyCases: Array<[CompanyAction, string, string | null]> = [
    ["approve", "PENDING", "APPROVED"],
    ["reject", "PENDING", "REJECTED"],
    ["suspend", "APPROVED", "SUSPENDED"],
    ["reinstate", "SUSPENDED", "APPROVED"],
    ["resubmit", "REJECTED", "PENDING"],
    ["approve", "APPROVED", null],
    ["approve", "REJECTED", null],
    ["reject", "APPROVED", null],
    ["suspend", "PENDING", null],
    ["reinstate", "APPROVED", null],
    ["resubmit", "PENDING", null],
  ];
  it.each(companyCases)("công ty: %s từ %s → %s", (action, from, to) => {
    expect(nextCompanyStatus(from as (typeof COMPANY_STATUSES)[number], action)).toBe(to);
  });

  const offerCases: Array<[OfferAction, string, string | null]> = [
    ["read", "SENT", "READ"],
    ["read", "READ", null],
    ["interested", "SENT", "INTERESTED"],
    ["interested", "READ", "INTERESTED"],
    ["interested", "INTERESTED", null],
    ["interested", "DECLINED", null],
    ["decline", "SENT", "DECLINED"],
    ["decline", "READ", "DECLINED"],
    ["decline", "INTERESTED", "DECLINED"],
    ["decline", "WITHDRAWN", null],
    ["withdraw", "SENT", "WITHDRAWN"],
    ["withdraw", "INTERESTED", "WITHDRAWN"],
    ["withdraw", "EXPIRED", null],
    ["expire", "SENT", "EXPIRED"],
    ["expire", "READ", "EXPIRED"],
    ["expire", "INTERESTED", null],
    ["expire", "DECLINED", null],
  ];
  it.each(offerCases)("lời mời: %s từ %s → %s", (action, from, to) => {
    expect(nextOfferStatus(from as (typeof OFFER_STATUSES)[number], action)).toBe(to);
  });

  it("trạng thái cuối (DECLINED/WITHDRAWN/EXPIRED) không chuyển được nữa; mở = SENT|READ|INTERESTED", () => {
    for (const s of ["DECLINED", "WITHDRAWN", "EXPIRED"] as const) {
      for (const a of ["read", "interested", "decline", "withdraw", "expire"] as const) expect(nextOfferStatus(s, a)).toBeNull();
      expect(isOpenOffer(s)).toBe(false);
    }
    for (const s of ["SENT", "READ", "INTERESTED"] as const) expect(isOpenOffer(s)).toBe(true);
    expect(offerFromStatuses("expire")).toEqual(["SENT", "READ"]);
  });

  it("thread chỉ mở khi INTERESTED + chưa khoá + công ty APPROVED; tạm ngưng công ty làm threadLocked HIỆU LỰC true", () => {
    expect(isThreadOpen({ status: "INTERESTED", threadLocked: false }, "APPROVED")).toBe(true);
    expect(isThreadOpen({ status: "READ", threadLocked: false }, "APPROVED")).toBe(false);
    expect(isThreadOpen({ status: "INTERESTED", threadLocked: true }, "APPROVED")).toBe(false);
    expect(isThreadOpen({ status: "INTERESTED", threadLocked: false }, "SUSPENDED")).toBe(false);
    expect(effectiveThreadLocked({ threadLocked: false }, "SUSPENDED")).toBe(true);
    expect(effectiveThreadLocked({ threadLocked: false }, "APPROVED")).toBe(false);
  });

  it("action theo vai + trạng thái công ty: PENDING/REJECTED/SUSPENDED không có talent/offer; chỉ OWNER có manage", () => {
    expect(companyActionsFor("PENDING", "OWNER")).toEqual(["company.view", "company.manage"]);
    expect(companyActionsFor("PENDING", "RECRUITER")).toEqual(["company.view"]);
    expect(companyActionsFor("APPROVED", "RECRUITER")).toEqual(["company.view", "company.talent", "company.offer"]);
    expect(companyActionsFor("APPROVED", "OWNER")).toEqual(["company.view", "company.manage", "company.talent", "company.offer"]);
    expect(companyActionsFor("SUSPENDED", "OWNER")).not.toContain("company.offer");
  });

  it("quyền theo dữ liệu recruiter:* (CompanyPermissionProvider)", () => {
    expect(dataPermissionsFor("PENDING", "OWNER")).toEqual(["recruiter:view"]);
    expect(dataPermissionsFor("APPROVED", "RECRUITER")).toEqual(["recruiter:view", "recruiter:create"]);
    expect(dataPermissionsFor("APPROVED", "OWNER")).toEqual(["recruiter:view", "recruiter:create", "recruiter:update"]);
    expect(dataPermissionsFor("SUSPENDED", "OWNER")).toEqual(["recruiter:view"]);
  });
});
