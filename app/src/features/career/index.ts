/**
 * Feature nghề nghiệp (p6-06 huy hiệu kỹ năng; p6-07 portfolio, p6-08 recruiter mở rộng tại đây). Route mỏng ở `app/(app)/me/career/*`.
 * Nơi lắp ráp: `app/(app)/_layout.tsx` mount `SkillUnlockedHost` MỘT lần; `app/(app)/me/_layout.tsx` import `register-profile.tsx` (đăng ký hàng "Nghề nghiệp" ở màn Tôi).
 */
export { CareerHomeScreen } from './screens/CareerHomeScreen';
export { SkillDetailScreen } from './screens/SkillDetailScreen';
export { SkillListScreen } from './screens/SkillListScreen';
export { UserSkillsScreen } from './screens/UserSkillsScreen';
export { SkillUnlockedHost } from './components/SkillUnlockedSheet';
export { userSkillsHref } from './utils/career-routes';
// p6-08 (Recruiter board phía sinh viên): Tìm việc, hộp thư lời mời, chi tiết, trao đổi, doanh nghiệp đã chặn.
export { BlockedCompaniesScreen } from './screens/jobs/BlockedCompaniesScreen';
export { JobSettingsScreen } from './screens/jobs/JobSettingsScreen';
export { OfferDetailScreen } from './screens/jobs/OfferDetailScreen';
export { OfferThreadScreen } from './screens/jobs/OfferThreadScreen';
export { OffersHomeScreen } from './screens/jobs/OffersHomeScreen';
export { OffersSplitLayout } from './screens/jobs/OffersSplitLayout';
export { ProfileViewsScreen } from './screens/jobs/ProfileViewsScreen';
// p6-07 (Portfolio một chạm): tổng quan, thông tin, giao diện, thêm/sửa dự án, xem trước. Route mỏng ở `app/(app)/me/career/portfolio/*`.
export { PortfolioAddProjectScreen } from './screens/portfolio/PortfolioAddProjectScreen';
export { PortfolioAppearanceScreen } from './screens/portfolio/PortfolioAppearanceScreen';
export { PortfolioHomeScreen } from './screens/portfolio/PortfolioHomeScreen';
export { PortfolioPreviewScreen } from './screens/portfolio/PortfolioPreviewScreen';
export { PortfolioProfileScreen } from './screens/portfolio/PortfolioProfileScreen';
export { PortfolioProjectScreen } from './screens/portfolio/PortfolioProjectScreen';
