/**
 * Nội dung tuyển dụng mẫu: 3 doanh nghiệp HƯ CẤU tại TP. Hồ Chí Minh (tên bịa, không logo, website dùng TLD `.example` không phân giải thật),
 * lời mời việc làm gửi thu và vài sinh viên, kèm tin nhắn thương lượng. Người đại diện công ty là `mentortuan`, `duyhung`, `vietdung`
 * (mỗi người ≤ 1 doanh nghiệp). Mốc thời gian là "số ngày trước" — mã seed kẹp lại cho hợp lý với ngày tạo tài khoản.
 */
export type CompanyStatusName = "PENDING" | "APPROVED";
export type OfferStatusName = "SENT" | "READ" | "INTERESTED" | "DECLINED" | "WITHDRAWN";
export type EmploymentTypeName = "INTERNSHIP" | "FULL_TIME" | "PART_TIME" | "FREELANCE";
export type DeclineReasonName = "NOT_LOOKING" | "NOT_A_FIT" | "LOCATION" | "TIMING" | "OTHER";

export interface CompanySpec {
  key: string;
  name: string;
  website: string;
  industry: string;
  sizeRange: "S1_10" | "S11_50" | "S51_200";
  tier: "FREE" | "PRO";
  status: CompanyStatusName;
  /** Khoá người đại diện (OWNER). */
  owner: string;
  createdDaysAgo: number;
  /** Chỉ với APPROVED: số ngày trước khi vận hành duyệt. */
  approvedDaysAgo?: number;
  description: string;
}

export const COMPANIES: readonly CompanySpec[] = [
  {
    key: "canhdieu",
    name: "Cánh Diều Software",
    website: "https://canhdieu-software.example",
    industry: "Phần mềm & ứng dụng di động",
    sizeRange: "S11_50",
    tier: "PRO",
    status: "APPROVED",
    owner: "mentortuan",
    createdDaysAgo: 14,
    approvedDaysAgo: 12,
    description:
      "Công ty phần mềm nhỏ tại TP. Hồ Chí Minh, chuyên làm ứng dụng web và di động cho giáo dục và bán lẻ. Team dùng React, React Native, Node.js/TypeScript và MongoDB; thực tập sinh được mentor kèm từng tuần và tham gia sản phẩm thật từ tháng đầu.",
  },
  {
    key: "hatde",
    name: "Hạt Dẻ Labs",
    website: "https://hatde-labs.example",
    industry: "Fintech cho sinh viên",
    sizeRange: "S1_10",
    tier: "FREE",
    status: "APPROVED",
    owner: "duyhung",
    createdDaysAgo: 12,
    approvedDaysAgo: 10,
    description:
      "Startup tại TP. Hồ Chí Minh làm ứng dụng ghi sổ chi tiêu và chia tiền cho nhóm bạn trẻ. Đội ngũ nhỏ, làm việc linh hoạt theo lịch học của sinh viên, dùng React, Node.js và MongoDB.",
  },
  {
    key: "tramsangtao",
    name: "Trạm Sáng Tạo",
    website: "https://tram-sang-tao.example",
    industry: "Studio thiết kế web & UI/UX",
    sizeRange: "S1_10",
    tier: "FREE",
    status: "PENDING",
    owner: "vietdung",
    createdDaysAgo: 2,
    description: "Studio nhỏ tại TP. Hồ Chí Minh nhận thiết kế giao diện ứng dụng, dựng landing page và hệ thống thiết kế cho các doanh nghiệp vừa và nhỏ.",
  },
];

export interface OfferMessageSpec {
  side: "COMPANY" | "CANDIDATE";
  text: string;
  /** Phút kể từ lúc phản hồi lời mời (Quan tâm) của sinh viên. */
  afterMinutes: number;
}

export interface OfferSpec {
  company: string;
  student: string;
  title: string;
  employmentType: EmploymentTypeName;
  location: string;
  message: string;
  status: OfferStatusName;
  sentDaysAgo: number;
  /** Số giờ từ lúc gửi tới lúc sinh viên mở đọc (bỏ qua với SENT). */
  readAfterHours?: number;
  /** Số giờ từ lúc đọc tới lúc phản hồi/thu hồi. */
  respondAfterHours?: number;
  declineReason?: DeclineReasonName;
  /** Sinh viên chọn chia sẻ email lúc Quan tâm (email mẫu của tài khoản seed — miền giả). */
  shareEmail?: boolean;
  thread?: OfferMessageSpec[];
}

export const OFFERS: readonly OfferSpec[] = [
  {
    company: "canhdieu",
    student: "thu",
    title: "Thực tập sinh Frontend React (6 tháng)",
    employmentType: "INTERNSHIP",
    location: "TP. Hồ Chí Minh (hybrid)",
    message:
      "Chào bạn, mình là anh Tuấn, tech lead tại Cánh Diều Software. Team mình đang tìm một thực tập sinh Frontend dùng React + TypeScript cho sản phẩm quản lý lớp học. Mình thấy bạn làm dự án Tiêu Gọn và đang dẫn dắt cả nhóm nên rất muốn trao đổi thêm. Thời gian thực tập 6 tháng, có hỗ trợ chi phí hằng tháng và mentor kèm từng tuần. Bạn quan tâm thì nhắn lại để mình hẹn phỏng vấn nhé.",
    status: "INTERESTED",
    sentDaysAgo: 7,
    readAfterHours: 5,
    respondAfterHours: 20,
    thread: [
      { side: "CANDIDATE", afterMinutes: 8, text: "Em cảm ơn anh Tuấn ạ. Em quan tâm vị trí này. Em đang học năm cuối nên có thể thực tập 3 buổi/tuần, anh cho em hỏi lịch làm việc cụ thể được không ạ?" },
      { side: "COMPANY", afterMinutes: 150, text: "Chào em. Bên anh thực tập 3 buổi/tuần là ổn, em chọn buổi nào cũng được miễn có mặt thứ Ba để họp team. Em gửi giúp anh link GitHub hoặc portfolio để team xem trước nhé." },
      { side: "CANDIDATE", afterMinutes: 330, text: "Dạ em gửi link GitHub dự án Tiêu Gọn ạ: https://github.com/thu-sv-demo/tieu-gon-app. Ngoài ra em còn làm đồ án thư viện bằng React + Node/Express, anh xem giúp em." },
      { side: "COMPANY", afterMinutes: 1500, text: "Ok em, team xem xong sẽ mời em phỏng vấn kỹ thuật khoảng 45 phút qua video, dự kiến đầu tuần sau. Em báo giúp anh một khung giờ buổi chiều tiện cho em nhé." },
    ],
  },
  {
    company: "hatde",
    student: "thu",
    title: "Bán thời gian Fullstack Node.js/React (20 giờ/tuần)",
    employmentType: "PART_TIME",
    location: "Làm việc từ xa",
    message:
      "Chào bạn, mình là Hưng ở Hạt Dẻ Labs — startup nhỏ làm ứng dụng ghi sổ chi tiêu cho nhóm sinh viên. Bọn mình đang cần một bạn Fullstack (React + Node.js/MongoDB) làm bán thời gian khoảng 20 giờ/tuần, làm từ xa và linh hoạt giờ theo lịch học. Nghiệp vụ của Tiêu Gọn khá gần sản phẩm của bên mình nên mình muốn mời bạn trao đổi thêm.",
    status: "SENT",
    sentDaysAgo: 1,
  },
  {
    company: "canhdieu",
    student: "hoanglong",
    title: "Thực tập React Native — ứng dụng di động",
    employmentType: "INTERNSHIP",
    location: "TP. Hồ Chí Minh (hybrid)",
    message:
      "Chào Long, Cánh Diều Software đang mở vị trí thực tập React Native cho ứng dụng di động quản lý lớp học. Mình thấy bạn phụ trách phần mobile của Tiêu Gọn bằng React Native + Expo nên nghĩ bạn rất hợp. Thực tập 4–6 tháng, có mentor kèm và được tham gia sản phẩm thật. Bạn quan tâm thì phản hồi để mình gửi chi tiết nhé.",
    status: "INTERESTED",
    sentDaysAgo: 6,
    readAfterHours: 3,
    respondAfterHours: 6,
    shareEmail: true,
    thread: [
      { side: "CANDIDATE", afterMinutes: 5, text: "Em chào anh, em đã đọc mô tả rồi ạ. Em đang làm phần mobile của Tiêu Gọn bằng React Native + Expo nên rất quan tâm vị trí này haha. Em xin chia sẻ email để team liên hệ ạ." },
      { side: "COMPANY", afterMinutes: 240, text: "Chào em, cảm ơn em đã quan tâm. Team đang dùng Expo Router + TypeScript, đúng hướng em đang làm. Bước tiếp theo là một bài làm thử nhỏ khoảng 2 giờ, anh sẽ gửi đề qua email em chia sẻ." },
      { side: "CANDIDATE", afterMinutes: 1700, text: "Dạ em nhận bài làm thử ạ. Em nên nộp trước ngày nào để kịp lịch của team vậy anh?" },
    ],
  },
  {
    company: "canhdieu",
    student: "thuytrang",
    title: "Thực tập UI/UX Designer",
    employmentType: "INTERNSHIP",
    location: "TP. Hồ Chí Minh (hybrid)",
    message:
      "Chào bạn, Cánh Diều Software đang tìm một bạn thực tập thiết kế sản phẩm phối hợp cùng team frontend. Bạn sẽ làm wireframe, prototype Figma và tham gia nghiên cứu người dùng cho ứng dụng học tập. Mình thấy hồ sơ của bạn có dẫn nhóm thiết kế app Học nhóm nên muốn mời bạn trao đổi.",
    status: "READ",
    sentDaysAgo: 5,
    readAfterHours: 30,
  },
  {
    company: "canhdieu",
    student: "minhanh",
    title: "Lập trình viên Frontend Junior (React/TypeScript)",
    employmentType: "FULL_TIME",
    location: "TP. Hồ Chí Minh",
    message:
      "Chào Minh Anh, team Cánh Diều Software đang tuyển một Frontend Junior làm việc với React + TypeScript. Mình thấy bạn là quản trị viên nhóm học front-end và review code khá kỹ nên muốn hỏi bạn có muốn làm full-time sau khi tốt nghiệp không. Nếu bạn quan tâm, mình sẽ gửi mô tả công việc chi tiết.",
    status: "DECLINED",
    sentDaysAgo: 8,
    readAfterHours: 12,
    respondAfterHours: 28,
    declineReason: "TIMING",
  },
  {
    company: "canhdieu",
    student: "haidang",
    title: "Thực tập Software Engineer (thuật toán & backend)",
    employmentType: "INTERNSHIP",
    location: "TP. Hồ Chí Minh",
    message:
      "Chào Đăng, Cánh Diều Software mở vị trí thực tập Software Engineer thiên về backend và xử lý dữ liệu. Mình thấy bạn mạnh về cấu trúc dữ liệu & giải thuật và là trưởng nhóm ôn thi của lớp nên muốn mời bạn trao đổi về công việc, bạn quan tâm thì phản hồi giúp mình nhé.",
    status: "SENT",
    sentDaysAgo: 2,
  },
  {
    company: "hatde",
    student: "quocbao",
    title: "Backend Developer (Node.js) bán thời gian",
    employmentType: "PART_TIME",
    location: "Làm việc từ xa",
    message:
      "Chào bạn, Hạt Dẻ Labs đang tìm một bạn backend Node.js làm bán thời gian, tập trung vào API và tối ưu truy vấn MongoDB. Mình thấy bạn là trưởng CLB Backend Node.js nên nghĩ bạn sẽ hợp. Nếu bạn quan tâm, mình có thể trao đổi chi tiết về phạm vi công việc.",
    status: "WITHDRAWN",
    sentDaysAgo: 6,
    readAfterHours: 8,
    respondAfterHours: 70,
  },
  {
    company: "hatde",
    student: "giahuy",
    title: "Thực tập DevOps (Docker, CI/CD)",
    employmentType: "INTERNSHIP",
    location: "TP. Hồ Chí Minh",
    message:
      "Chào Huy, Hạt Dẻ Labs cần một bạn thực tập DevOps hỗ trợ đóng gói bằng Docker và dựng pipeline CI/CD cho dịch vụ Node.js. Mình thấy bạn hay chia sẻ về Docker trong CLB nên muốn mời bạn thử sức. Thực tập 3 tháng, làm linh hoạt theo lịch học.",
    status: "DECLINED",
    sentDaysAgo: 4,
    readAfterHours: 20,
    respondAfterHours: 3,
    declineReason: "NOT_A_FIT",
  },
  {
    company: "hatde",
    student: "phuocloi",
    title: "Hỗ trợ CSDL/Backend bán thời gian",
    employmentType: "PART_TIME",
    location: "Làm việc từ xa",
    message:
      "Chào Lợi, Hạt Dẻ Labs đang cần một bạn hỗ trợ phần cơ sở dữ liệu và backend bán thời gian cho dịch vụ ghi sổ chi tiêu nhóm. Mình thấy bạn phụ trách thiết kế CSDL đồ án thư viện rất bài bản nên muốn mời bạn trao đổi. Công việc linh hoạt, làm từ xa.",
    status: "INTERESTED",
    sentDaysAgo: 5,
    readAfterHours: 6,
    respondAfterHours: 10,
    thread: [
      { side: "CANDIDATE", afterMinutes: 12, text: "Em chào anh Hưng, em quan tâm ạ. Hiện em đang bận bảo vệ đồ án khoảng 3 tuần nữa, sau đó em có thể làm khoảng 15 giờ/tuần, như vậy có phù hợp với bên anh không ạ?" },
      { side: "COMPANY", afterMinutes: 420, text: "Phù hợp em nhé, bên anh có thể chờ tới sau khi em bảo vệ xong. Em sắp xếp giúp anh một buổi gọi 30 phút để hai bên nói rõ phạm vi công việc và mức hỗ trợ." },
    ],
  },
];

export interface ProfileViewSpec {
  company: string;
  student: string;
  /** [số ngày trước, số lượt xem] */
  views: Array<[daysAgo: number, count: number]>;
}

export const PROFILE_VIEWS: readonly ProfileViewSpec[] = [
  { company: "canhdieu", student: "thu", views: [[8, 2], [7, 1]] },
  { company: "canhdieu", student: "hoanglong", views: [[7, 1]] },
  { company: "canhdieu", student: "thuytrang", views: [[6, 2]] },
  { company: "canhdieu", student: "minhanh", views: [[9, 1]] },
  { company: "canhdieu", student: "haidang", views: [[3, 1]] },
  { company: "canhdieu", student: "giahuy", views: [[5, 1]] },
  { company: "hatde", student: "thu", views: [[3, 2]] },
  { company: "hatde", student: "quocbao", views: [[7, 1]] },
  { company: "hatde", student: "giahuy", views: [[5, 1]] },
  { company: "hatde", student: "phuocloi", views: [[6, 2]] },
];

/** Sinh viên đã chặn doanh nghiệp (không còn thấy trong tìm kiếm của công ty đó). */
export const BLOCKS: ReadonlyArray<{ student: string; company: string; daysAgo: number }> = [{ student: "phuongthao", company: "hatde", daysAgo: 3 }];
