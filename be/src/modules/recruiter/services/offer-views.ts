import type { AuthUser } from "../../../core/types/express";
import type { Company, JobOffer } from "../entities/recruiter.interface";
import {
  DELETED_ACCOUNT_NAME,
  presentCompanyBrief,
  presentCompanyOfferDetail,
  presentCompanyOfferItem,
  presentStudent,
  presentStudentOfferDetail,
  presentStudentOfferItem,
  type CompanyOfferDetail,
  type CompanyOfferItem,
  type StudentOfferDetail,
  type StudentOfferItem,
} from "./recruiter.presenter";
import type { RecruiterDeps } from "./recruiter.deps";
import { recruiterErrors } from "./recruiter.errors";

/** Dựng view lời mời cho từng phía (batch — không N+1): sinh viên thấy công ty (tên/logo/trạng thái), HR thấy sinh viên (tên + ảnh) và người gửi. */
export class OfferViews {
  constructor(private readonly d: RecruiterDeps) {}

  async studentItems(offers: readonly JobOffer[]): Promise<StudentOfferItem[]> {
    const companies = await this.d.companies.findMany([...new Set(offers.map((o) => o.companyId))]);
    const logos = await this.d.assets.signThumbs([...companies.values()].flatMap((c) => (c.logoAssetId ? [c.logoAssetId] : [])));
    return offers.flatMap((o) => {
      const c = companies.get(o.companyId);
      if (!c) return [];
      return [presentStudentOfferItem(o, presentCompanyBrief(c, c.logoAssetId ? (logos.get(c.logoAssetId) ?? null) : null), c.status)];
    });
  }

  async studentDetail(o: JobOffer, viewer: AuthUser): Promise<StudentOfferDetail> {
    const c = await this.d.companies.findById(o.companyId);
    if (!c) throw recruiterErrors.offerNotFound();
    const [recruiter, logoUrl, jdUrl] = await Promise.all([
      this.d.directory.findUser(o.recruiterId),
      c.logoAssetId ? this.d.assets.signedUrl(c.logoAssetId, viewer) : Promise.resolve(null),
      o.jdAssetId ? this.d.assets.signedUrl(o.jdAssetId, viewer) : Promise.resolve(null),
    ]);
    return presentStudentOfferDetail(o, presentCompanyBrief(c, logoUrl), c.status, recruiter?.status === "ANONYMIZED" || !recruiter ? DELETED_ACCOUNT_NAME : recruiter.name, jdUrl);
  }

  async companyItems(offers: readonly JobOffer[], company: Pick<Company, "status">): Promise<CompanyOfferItem[]> {
    const users = await this.d.directory.findUsers([...new Set(offers.flatMap((o) => [o.studentId, o.recruiterId]))]);
    return offers.map((o) => this.companyItem(o, company, users));
  }

  async companyDetail(o: JobOffer, company: Company, viewer: AuthUser): Promise<CompanyOfferDetail> {
    const users = await this.d.directory.findUsers([o.studentId, o.recruiterId]);
    const jdUrl = o.jdAssetId ? await this.d.assets.signedUrl(o.jdAssetId, viewer) : null;
    return presentCompanyOfferDetail(this.companyItem(o, company, users), o, company.status, jdUrl);
  }

  private companyItem(o: JobOffer, company: Pick<Company, "status">, users: Map<string, { name: string; status: string; avatarAssetId: string | null; id: string; email: string; role: string }>): CompanyOfferItem {
    const r = users.get(o.recruiterId);
    return presentCompanyOfferItem(o, presentStudent(o.studentId, users.get(o.studentId)), { userId: o.recruiterId, name: r && r.status !== "ANONYMIZED" ? r.name : DELETED_ACCOUNT_NAME }, company.status);
  }
}
