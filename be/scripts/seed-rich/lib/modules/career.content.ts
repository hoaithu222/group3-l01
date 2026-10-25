/**
 * Hồ sơ nghề nghiệp mẫu (`UserCareer`) của 14 người — mục tiêu (headline), vị trí mong muốn, khu vực, bật/tắt "mở nhận lời mời" và quyền riêng tư.
 * Khu vực chỉ ghi cấp thành phố (không địa chỉ cụ thể). `openedDaysAgo` = số ngày trước khi họ bật/tắt "mở nhận lời mời" lần gần nhất.
 */
export interface CareerProfileSpec {
  key: string;
  openToWork: boolean;
  /** Đã từng bật rồi tắt (có `consentVersion` + `openToWorkChangedAt`) hay chưa bao giờ bật. Chỉ dùng khi `openToWork = false`. */
  wasOpen?: boolean;
  openedDaysAgo: number;
  headline: string;
  preferredRoles: string[];
  location: string;
  visibility: { showSkills: boolean; proofTitles: boolean; showContribution: boolean; showQuiz: boolean; appearInOthersPortfolios: boolean };
}

const HCM = "TP. Hồ Chí Minh";
const vis = (o: Partial<CareerProfileSpec["visibility"]> = {}): CareerProfileSpec["visibility"] => ({
  showSkills: true,
  proofTitles: false,
  showContribution: false,
  showQuiz: false,
  appearInOthersPortfolios: false,
  ...o,
});

export const CAREER_PROFILES: readonly CareerProfileSpec[] = [
  {
    key: "thu",
    openToWork: true,
    openedDaysAgo: 11,
    headline: "Sinh viên CNTT, trưởng nhóm dự án Tiêu Gọn — tìm thực tập Fullstack (React + Node.js)",
    preferredRoles: ["Fullstack Developer", "Frontend Developer"],
    location: HCM,
    visibility: vis({ showContribution: true, proofTitles: true, appearInOthersPortfolios: true }),
  },
  {
    key: "minhanh",
    openToWork: true,
    openedDaysAgo: 13,
    headline: "SV năm 3 CNTT · React/TypeScript · tìm thực tập Frontend",
    preferredRoles: ["Frontend Developer", "React Developer"],
    location: HCM,
    visibility: vis({ showContribution: true, appearInOthersPortfolios: true }),
  },
  {
    key: "quocbao",
    openToWork: true,
    openedDaysAgo: 12,
    headline: "SV năm 4 · Backend Node.js/MongoDB · tìm vị trí Backend Junior",
    preferredRoles: ["Backend Developer", "Node.js Developer"],
    location: HCM,
    visibility: vis({ showContribution: true, appearInOthersPortfolios: true }),
  },
  {
    key: "thuytrang",
    openToWork: true,
    openedDaysAgo: 10,
    headline: "Học UI/UX, thành thạo Figma · tìm thực tập thiết kế sản phẩm",
    preferredRoles: ["UI/UX Designer", "Product Designer"],
    location: HCM,
    visibility: vis({ appearInOthersPortfolios: true }),
  },
  {
    key: "hoanglong",
    openToWork: true,
    openedDaysAgo: 9,
    headline: "SV năm 3 · React Native · tìm thực tập phát triển ứng dụng di động",
    preferredRoles: ["Mobile Developer", "React Native Developer"],
    location: HCM,
    visibility: vis({ showContribution: true }),
  },
  {
    key: "ngocdiep",
    openToWork: false,
    wasOpen: true,
    openedDaysAgo: 6,
    headline: "SV năm 4 · trưởng nhóm đồ án tốt nghiệp · quản lý tiến độ và tài liệu dự án",
    preferredRoles: ["Business Analyst", "Project Coordinator"],
    location: HCM,
    visibility: vis({ appearInOthersPortfolios: true }),
  },
  {
    key: "giahuy",
    openToWork: true,
    openedDaysAgo: 8,
    headline: "SV năm 3 · Docker/CI-CD · tìm thực tập DevOps",
    preferredRoles: ["DevOps Engineer"],
    location: HCM,
    visibility: vis(),
  },
  {
    key: "phuongthao",
    openToWork: true,
    openedDaysAgo: 7,
    headline: "SV năm 2 · kiểm thử phần mềm, soi lỗi kỹ · tìm thực tập QA",
    preferredRoles: ["QA Engineer", "Tester"],
    location: HCM,
    // Chủ động ẩn huy hiệu kỹ năng: bản chiếu tìm kiếm không được chứa kỹ năng của người này.
    visibility: vis({ showSkills: false }),
  },
  {
    key: "phuocloi",
    openToWork: true,
    openedDaysAgo: 12,
    headline: "SV năm 4 · thiết kế CSDL, ERD · tìm vị trí Backend/Database",
    preferredRoles: ["Backend Developer", "Database Developer"],
    location: HCM,
    visibility: vis({ appearInOthersPortfolios: true }),
  },
  {
    key: "ngoclan",
    openToWork: false,
    openedDaysAgo: 0,
    headline: "SV năm 4 · phụ trách báo cáo và slide đồ án",
    preferredRoles: ["Technical Writer"],
    location: HCM,
    visibility: vis({ appearInOthersPortfolios: true }),
  },
  {
    key: "khanhlinh",
    openToWork: true,
    openedDaysAgo: 5,
    headline: "SV năm 2 · tổng hợp tài liệu, ghi chép gọn · tìm thực tập hỗ trợ nội dung",
    preferredRoles: ["Technical Writer", "Content Assistant"],
    location: HCM,
    visibility: vis({ proofTitles: true }),
  },
  {
    key: "thaonguyen",
    openToWork: true,
    openedDaysAgo: 6,
    headline: "SV năm 2 · UI/UX, vẽ wireframe · tìm thực tập thiết kế giao diện",
    preferredRoles: ["UI Designer", "UX Researcher"],
    location: HCM,
    visibility: vis(),
  },
  {
    key: "haidang",
    openToWork: true,
    openedDaysAgo: 10,
    headline: "SV năm 3 · cấu trúc dữ liệu & giải thuật · tìm thực tập Backend",
    preferredRoles: ["Backend Developer", "Software Engineer"],
    location: HCM,
    visibility: vis({ showContribution: true, showQuiz: true }),
  },
  {
    key: "tuankiet",
    openToWork: true,
    openedDaysAgo: 4,
    headline: "SV năm 2 · giải thuật, LeetCode mỗi ngày · tìm thực tập phát triển phần mềm",
    preferredRoles: ["Software Engineer"],
    location: HCM,
    visibility: vis({ showQuiz: true }),
  },
];
