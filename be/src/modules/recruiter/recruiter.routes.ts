import { Router } from "express";
import { createCompaniesRouter } from "./companies.routes";
import { createMeCareerRouter } from "./me-career.routes";
import { createOffersRouter } from "./offers.routes";
import { createTalentRouter } from "./talent.routes";
import { getRecruiterContainer, type RecruiterContainer } from "./recruiter.container";
import { registerRecruiterApiHooks, registerRecruiterModule } from "./index";

/**
 * Router người dùng/HR của p6-08 (path tuyệt đối, mount ở root v1): doanh nghiệp + nhân sự, tìm/xem ứng viên, lời mời + thread, hồ sơ tìm việc/chặn/lượt xem. Cờ `career` + công tắc
 * `recruiter.enabled` (mặc định TẮT) gắn ở từng route. Vận hành ở `admin-recruiter.routes.ts`.
 */
export function createRecruiterRouter(c: RecruiterContainer = getRecruiterContainer()): Router {
  const router = Router();
  router.use(createCompaniesRouter(c));
  router.use(createTalentRouter(c));
  router.use(createOffersRouter(c));
  router.use(createMeCareerRouter(c));
  return router;
}

// Loại thông báo, resolver COMPANY, provider quyền, đích báo cáo + quyền đọc asset (side-effect lúc import, giống `documents`/`portfolio`).
registerRecruiterModule();
registerRecruiterApiHooks();

export default createRecruiterRouter();
