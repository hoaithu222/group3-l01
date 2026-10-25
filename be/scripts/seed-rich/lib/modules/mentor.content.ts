import type { PersonKey } from "../../types";
import { CHAT_DATABASE, CHAT_DESIGN_SYSTEM, CHAT_LIBRARY_UI, CHAT_PERFORMANCE, CHAT_REPORT, CHAT_SPEAKING, type ChatSpec } from "./mentor.chats";

/**
 * Nội dung bảng tin "Tìm cố vấn" (Mentor Connect). Mọi mốc thời gian là "số ngày trước" so với lúc chạy seed; mã ghi (mentor.ts)
 * co dòng thời gian của bài cho vừa tuổi nhóm (nhóm mới tạo vài ngày thì nén lại) và giữ đúng thứ tự
 * bài → đơn → duyệt → đợt cố vấn → kết thúc/đóng.
 */
export type AppStatus = "PENDING" | "ACCEPTED" | "REJECTED" | "WITHDRAWN" | "EXPIRED";
export type EndReason = "EXPIRED" | "LEFT_BY_MENTOR" | "ENDED_BY_OWNER";

export interface EngagementSpec {
  /** Người chấp nhận đơn (OWNER/ADMIN của nhóm). */
  by: PersonKey;
  days: number;
  /** Có = chọn thời hạn sao cho đợt còn đúng chừng này ngày nữa (đợt "sắp kết thúc"); ghi đè `days`. */
  endsInDays?: number;
  /** Tên kênh cấp quyền cho cố vấn (kênh chung luôn có "Chung"). */
  channels: string[];
  extend?: { addDays: number; daysAgo: number };
  /** Có = đợt đã kết thúc. `EXPIRED` tính từ `endsAt`; còn lại tính theo `daysAgo`. */
  end?: { reason: EndReason; daysAgo?: number };
  /** Không có = job không tạo nhóm chat (`createConversation=false`). */
  chat?: ChatSpec;
  /** Đợt còn ≤ 3 ngày: cron `mentor.ending-soon` đã báo (đặt `endingSoonNotifiedAt`). */
  endingSoon?: boolean;
}

export interface ApplicationSpec {
  who: PersonKey;
  status: AppStatus;
  daysAgo: number;
  /** Lúc duyệt / từ chối / rút đơn (ngày trước). */
  reviewDaysAgo?: number;
  /** Người từ chối (mặc định: người đăng bài). */
  reviewBy?: PersonKey;
  reason?: string;
  message: string;
  portfolio?: string;
  engagement?: EngagementSpec;
}

export interface PostSpec {
  key: string;
  ws: string;
  by: PersonKey;
  title: string;
  description: string;
  skills: string[];
  hours: number;
  needed: number;
  ageDays: number;
  expiresInDays: number;
  /** Có = nhóm đã đóng bài thủ công cách đây bấy nhiêu ngày (đơn chờ → EXPIRED). */
  closedDaysAgo?: number;
  apps: ApplicationSpec[];
}

export const POSTS: readonly PostSpec[] = [
  {
    key: "frontend-review", ws: "frontend", by: "minhanh", ageDays: 5, expiresInDays: 40, hours: 4, needed: 2,
    title: "Cần cố vấn review code React và kiểm tra accessibility",
    description:
      "Nhóm đang làm bài tập lớn bằng React (từ todo app lên trang quản lý lớp học), code còn lặp nhiều và state chưa gọn. Tụi mình cần 1–2 anh chị có kinh nghiệm review PR TypeScript/React: góp ý cách tách component, custom hook và các lỗi accessibility cơ bản (label, focus, độ tương phản, điều hướng bằng bàn phím). Hình thức: mỗi tuần một buổi review trực tuyến khoảng 1 giờ và trả lời comment trên PR trong kênh Review với mentor. Nhóm sẽ gửi trước link PR và phần cần soi kỹ.",
    skills: ["ReactJS", "TypeScript", "Accessibility", "Code review", "Testing"],
    apps: [
      { who: "mentortuan", status: "PENDING", daysAgo: 4.3, portfolio: "https://portfolio.example.com/leanhtuan",
        message: "Chào nhóm, mình là Tuấn, tech lead mobile/backend. Mình làm mobile và backend là chính nhưng thường xuyên review PR React cho team web, hay góp ý về tách component, custom hook và test bằng React Testing Library. Phần accessibility mình sẽ dùng axe và tự duyệt bằng bàn phím. Mình review được vào tối thứ 3 và thứ 6, mỗi buổi khoảng 1 giờ." },
      { who: "quocbao", status: "PENDING", daysAgo: 3.1,
        message: "Chào các bạn, mình là Bảo, sinh viên năm 4. Mình không chuyên front-end nhưng hay ghép API với React nên thấy rõ lỗi thường gặp: gọi API trong effect không dọn dẹp, state bị trùng, thiếu trạng thái loading/error. Mình có thể review phần tích hợp API và TypeScript, còn accessibility mình sẽ học thêm cùng nhóm. Mỗi tuần mình dành được khoảng 3 giờ." },
    ],
  },
  {
    key: "frontend-performance", ws: "frontend", by: "thu", ageDays: 19, expiresInDays: 30, hours: 3, needed: 2, closedDaysAgo: 8,
    title: "Tìm cố vấn tối ưu hiệu năng trang web (Lighthouse, Core Web Vitals)",
    description:
      "Trang portfolio của nhóm đang chỉ đạt khoảng 55 điểm Performance trên Lighthouse: ảnh chưa nén, bundle lớn, font tải chậm. Nhóm cần một cố vấn chỉ cách đọc báo cáo Lighthouse, lazy-load ảnh/route, tách bundle và cấu hình cache; ưu tiên người từng tối ưu một dự án thật. Cam kết khoảng 3 giờ mỗi tuần trong 2–3 tuần, trao đổi qua kênh React và một buổi pair debug.",
    skills: ["Web Performance", "Lighthouse", "ReactJS"],
    apps: [
      { who: "duyhung", status: "ACCEPTED", daysAgo: 18.2, reviewDaysAgo: 17.3,
        message: "Chào anh chị, mình là Hưng, sinh viên năm 4. Mình mới tối ưu trang quản trị của đồ án (tách bundle bằng dynamic import, nén ảnh WebP, bật cache header) và điểm Lighthouse tăng từ 58 lên 91. Mình có thể chỉ nhóm cách đọc báo cáo và làm lần lượt từng bước, kèm một buổi pair debug. Mình rảnh tối thứ 2 và thứ 4.",
        engagement: { by: "minhanh", days: 21, channels: ["React"], end: { reason: "LEFT_BY_MENTOR", daysAgo: 9.6 }, chat: CHAT_PERFORMANCE } },
      { who: "mentortuan", status: "EXPIRED", daysAgo: 15.5,
        message: "Chào nhóm, mình từng tối ưu thời gian tải cho app mobile và web admin nên quen với cách làm đo trước – sửa sau – đo lại. Mình có thể hướng dẫn đọc waterfall mạng và đặt ngân sách hiệu năng cho nhóm. Mình xin ứng tuyển làm cố vấn thứ hai, mỗi tuần khoảng 2 giờ." },
    ],
  },
  {
    key: "math-probability", ws: "math", by: "thu", ageDays: 9, expiresInDays: 30, hours: 3, needed: 1,
    title: "Cần giảng viên hoặc anh chị giải đáp Xác suất thống kê trước kỳ thi",
    description:
      "Nhóm mình ổn phần Giải tích và Đại số tuyến tính nhưng còn yếu Xác suất thống kê: xác suất có điều kiện, công thức Bayes, biến ngẫu nhiên rời rạc/liên tục và phân phối chuẩn. Cần người giải đáp thắc mắc, chữa đề các năm và chỉ cách trình bày lời giải đúng barem. Mỗi tuần 1–2 buổi tối trên kênh Xác suất thống kê hoặc phòng giải bài, tổng khoảng 3 giờ. Ưu tiên người đã học và đạt điểm cao môn này.",
    skills: ["Xác suất thống kê", "Toán cao cấp", "Giải đề thi"],
    apps: [
      { who: "vietdung", status: "PENDING", daysAgo: 8.2,
        message: "Chào nhóm, mình là Dũng, sinh viên năm 4. Hồi năm 2 mình học Xác suất thống kê được 9,0 và từng kèm các bạn cùng lớp trước kỳ thi. Mình quen cách chia dạng bài: xác suất có điều kiện, Bayes, biến ngẫu nhiên và phân phối chuẩn. Mình có thể chữa đề các năm và chỉ cách trình bày đúng barem, khoảng 2 buổi tối mỗi tuần." },
      { who: "minhanh", status: "PENDING", daysAgo: 6.5,
        message: "Chào nhóm, mình là Minh Anh, sinh viên năm 3. Môn Xác suất thống kê mình học kỳ trước, đạt 8,5. Mình giải thích khá tốt phần phân phối chuẩn và cách tra bảng Φ(z), còn phần ước lượng khoảng tin cậy mình đang ôn lại. Mình xin đăng ký hỗ trợ khoảng 2 giờ mỗi tuần." },
      { who: "quocbao", status: "REJECTED", daysAgo: 8.0, reviewDaysAgo: 7.1,
        reason: "Cảm ơn bạn Bảo. Nhóm đang cần người dạy theo lịch 2 buổi mỗi tuần nên xin phép chưa chọn lần này.",
        message: "Mình đã dùng thống kê khi phân tích log hệ thống nên có thể giải thích công thức Bayes bằng ví dụ thực tế. Tuy nhiên lịch của mình khá dày, mình chỉ nhận được 1 buổi mỗi tuần." },
    ],
  },
  {
    key: "math-linear-algebra", ws: "math", by: "baotram", ageDays: 2, expiresInDays: 45, hours: 2, needed: 1,
    title: "Tìm anh chị kèm Đại số tuyến tính (ma trận, định thức, trị riêng)",
    description:
      "Nhiều bạn mới vào nhóm hay vướng ở định thức cấp cao, hạng của ma trận và bài toán trị riêng – vector riêng. Nhóm tìm một anh chị kèm nhẹ nhàng, ưu tiên giải thích trực quan (biến đổi tuyến tính, hình học) trước khi vào tính toán, kèm vài bài tập mẫu mỗi tuần. Khoảng 2 giờ mỗi tuần, linh hoạt tối thứ 3 hoặc thứ 6.",
    skills: ["Đại số tuyến tính", "Toán cao cấp", "Giải đề thi"],
    apps: [],
  },
  {
    key: "appdev-architecture", ws: "appdev", by: "thu", ageDays: 11, expiresInDays: 45, hours: 4, needed: 1,
    title: "Cần cố vấn kiến trúc React Native/Expo và CI/CD cho app Tiêu Gọn",
    description:
      "App Tiêu Gọn (quản lý chi tiêu cho sinh viên) đã có MVP chạy trên Expo nhưng cấu trúc thư mục, quản lý state và điều hướng đang phát triển tự phát. Nhóm cần cố vấn có kinh nghiệm React Native để góp ý kiến trúc (chia theo tính năng, Expo Router, lưu trữ offline) và dựng quy trình CI/CD: lint + test trên GitHub Actions, build bằng EAS, phát hành bản thử nội bộ. Cam kết khoảng 4 giờ mỗi tuần, gồm một buổi review kiến trúc và hỗ trợ khi nhóm bị kẹt.",
    skills: ["React Native", "Expo", "TypeScript", "CI/CD", "DevOps", "Mobile"],
    apps: [
      { who: "mentorson", status: "PENDING", daysAgo: 3.4, portfolio: "https://portfolio.example.com/phamthanhson",
        message: "Chào anh Thu và cả nhóm, mình là Sơn, senior front-end developer, 6 năm kinh nghiệm. Hai năm gần đây mình dựng app React Native cho một team nhỏ nên khá rành Expo Router, tách module theo tính năng và build bằng EAS. Mình có thể review kiến trúc của Tiêu Gọn trong buổi đầu, sau đó cùng nhóm dựng pipeline GitHub Actions chạy lint, test và build bản thử. Mỗi tuần mình dành khoảng 4 giờ." },
    ],
  },
  {
    key: "appdev-report", ws: "appdev", by: "thu", ageDays: 17, expiresInDays: 30, hours: 2, needed: 1,
    title: "Tìm cố vấn viết báo cáo và slide demo cho dự án Tiêu Gọn",
    description:
      "Nhóm sắp nộp báo cáo và bảo vệ dự án Tiêu Gọn. Phần kỹ thuật tạm ổn nhưng báo cáo còn rời rạc, slide chưa kể được câu chuyện từ vấn đề đến giải pháp và kết quả. Cần một cố vấn có kinh nghiệm hướng dẫn viết báo cáo: đọc và góp ý chương Giới thiệu, Phương pháp, Đánh giá, giúp chỉnh slide và tập thuyết trình. Khoảng 2 giờ mỗi tuần trong 2–3 tuần, ưu tiên người viết tốt cả tiếng Việt và tiếng Anh (phần abstract).",
    skills: ["Documentation", "Báo cáo", "Thuyết trình", "Tiếng Anh học thuật"],
    apps: [
      { who: "mentorha", status: "ACCEPTED", daysAgo: 16.1, reviewDaysAgo: 15,
        message: "Chào cả nhóm, mình là Hà, giảng viên IELTS và thường hướng dẫn sinh viên viết báo cáo, tiểu luận bằng tiếng Anh. Mình có thể đọc báo cáo của nhóm, góp ý bố cục theo mạch vấn đề – giải pháp – kết quả, soát lỗi diễn đạt và giúp viết phần abstract bằng tiếng Anh. Mình cũng có thể nghe nhóm tập thuyết trình hai buổi cuối. Mỗi tuần khoảng 2 giờ.",
        engagement: { by: "quocbao", days: 17, endsInDays: 1.8, channels: ["Báo cáo & Slide"], endingSoon: true, chat: CHAT_REPORT } },
    ],
  },
  {
    key: "ielts-writing", ws: "ielts", by: "thu", ageDays: 13, expiresInDays: 40, hours: 3, needed: 1,
    title: "Cần giáo viên chấm Writing Task 2 và Speaking mock test",
    description:
      "Nhóm luyện IELTS mục tiêu 6.5+ đang viết Task 2 mỗi tuần nhưng thiếu người chấm theo band descriptor. Cần cố vấn chấm bài theo 4 tiêu chí (Task Response, Coherence, Lexical Resource, Grammar), nhận xét cụ thể từng đoạn, chỉ ra lỗi lặp lại; ngoài ra chấm một buổi Speaking mock test mỗi 2 tuần. Khoảng 3 giờ mỗi tuần, nhận bài qua kênh Writing Task 2. Ưu tiên người có IELTS từ 7.5 hoặc từng dạy/chấm bài.",
    skills: ["IELTS Writing", "IELTS Speaking", "Feedback bài viết"],
    apps: [
      { who: "duyhung", status: "PENDING", daysAgo: 11.4,
        message: "Chào nhóm, mình là Hưng. Mình đạt IELTS 7.0 (Writing 7.0) năm ngoái nên nắm khá chắc band descriptor. Mình có thể chấm Task 2 và nhận xét từng đoạn, nhưng chưa có kinh nghiệm chấm Speaking. Mỗi tuần mình chấm được 3–4 bài." },
      { who: "minhanh", status: "PENDING", daysAgo: 9.8,
        message: "Mình là Minh Anh, IELTS 7.5 (Writing 7.5) hồi tháng 6. Mình có thể chấm Task 2 theo 4 tiêu chí và chia sẻ cách mình lập dàn ý trong 5 phút đầu; chấm band chính thức thì mình không dám nhận, chỉ góp ý để nhóm sửa. Mỗi tuần mình dành được 3 giờ." },
      { who: "mentorson", status: "REJECTED", daysAgo: 12.5, reviewDaysAgo: 11.9,
        reason: "Cảm ơn anh Sơn. Nhóm ưu tiên người có chứng chỉ IELTS hoặc từng chấm bài nên xin phép chưa chọn lần này.",
        message: "Mình chưa có chứng chỉ IELTS nhưng làm việc với khách hàng nước ngoài hơn 6 năm, có thể luyện Speaking chủ đề công nghệ cho nhóm và góp ý về cách trình bày ý." },
    ],
  },
  {
    key: "ielts-speaking", ws: "ielts", by: "camtu", ageDays: 14, expiresInDays: 30, hours: 4, needed: 2,
    title: "Tìm cố vấn luyện Speaking Part 2 và Part 3 theo cặp",
    description:
      "Nhóm có lịch luyện nói theo cặp nhưng ai cũng cùng trình độ nên khó nhận ra lỗi phát âm và cách triển khai ý. Cần 1–2 anh chị nói tốt đứng cùng buổi luyện, nghe và nhận xét về phát âm, độ trôi chảy và cách mở rộng ý ở Part 3. Mỗi tuần 2 buổi tối (mỗi buổi 1 giờ), tham gia phòng Luyện nói của nhóm.",
    skills: ["IELTS Speaking", "Phát âm", "Giao tiếp"],
    apps: [
      { who: "vietdung", status: "ACCEPTED", daysAgo: 13.2, reviewDaysAgo: 12,
        message: "Chào cả nhóm, mình là Dũng. IELTS 7.5 (Speaking 8.0) của mình lấy năm ngoái, kỳ thực tập vừa rồi mình họp bằng tiếng Anh với team nước ngoài hằng tuần nên khá quen nói trước nhiều người. Mình sẽ vào buổi luyện tối thứ 3 và thứ 5, ghi lại lỗi phát âm và cách mở rộng ý ở Part 3 để gửi nhóm sau mỗi buổi.",
        engagement: { by: "camtu", days: 21, channels: ["Speaking Practice", "Phòng luyện nói"], chat: CHAT_SPEAKING } },
    ],
  },
  {
    key: "dsa-dp-graph", ws: "dsa", by: "haidang", ageDays: 18, expiresInDays: 40, hours: 5, needed: 2,
    title: "Cần anh chị chữa đề Quy hoạch động và Đồ thị trước kỳ thi",
    description:
      "Hai chủ đề nhóm làm sai nhiều nhất trong đề các năm là Quy hoạch động (cái túi, LIS, đổi tiền) và Đồ thị (BFS/DFS, Dijkstra, sắp xếp topo). Cần cố vấn hướng dẫn cách tìm công thức truy hồi, chứng minh độ phức tạp và trình bày lời giải; mỗi buổi chữa 2–3 đề tổng hợp. Khoảng 5 giờ mỗi tuần trong 3 tuần cuối trước thi, qua kênh Quy hoạch động, Cây & Đồ thị và phòng Giải thuật.",
    skills: ["Quy hoạch động", "Đồ thị", "Cấu trúc dữ liệu & giải thuật", "Giải đề thi"],
    apps: [
      { who: "gvhung", status: "ACCEPTED", daysAgo: 17.2, reviewDaysAgo: 16,
        message: "Chào các em, thầy là Hùng, giảng viên Toán cao cấp. Thầy có dạy học phần Toán rời rạc nên phần đồ thị và quan hệ truy hồi thầy làm khá chắc, từ chứng minh tính đúng của BFS/Dijkstra đến đánh giá độ phức tạp bằng định lý thợ. Thầy dành được khoảng 3 giờ mỗi tuần, có thể chữa đề cùng các em vào tối chủ nhật.",
        engagement: { by: "haidang", days: 30, channels: ["Quy hoạch động", "Cây & Đồ thị"] } },
      { who: "duyhung", status: "PENDING", daysAgo: 10.6,
        message: "Mình là Hưng, sinh viên năm 4, chuyển từ Java sang Node.js nên giải bài được bằng cả hai ngôn ngữ. Mình đã giải khoảng 300 bài LeetCode, mạnh quy hoạch động 1 chiều và 2 chiều. Mình có thể chữa các đề cái túi, LIS, đổi tiền và chỉ cách rút công thức truy hồi từ đề bài." },
      { who: "minhanh", status: "WITHDRAWN", daysAgo: 15.3, reviewDaysAgo: 14.6,
        message: "Mình là Minh Anh, có thể hỗ trợ phần quy hoạch động, nhưng tuần tới mình bận đồ án nên xin rút đơn để nhường chỗ cho người có nhiều thời gian hơn." },
    ],
  },
  {
    key: "dsa-mock-interview", ws: "dsa", by: "minhkhoi", ageDays: 6, expiresInDays: 30, hours: 2, needed: 1,
    title: "Tìm người luyện phỏng vấn kỹ thuật (mock interview) về giải thuật",
    description:
      "Một số bạn trong nhóm đang chuẩn bị xin thực tập nên cần luyện phỏng vấn: nói to suy nghĩ khi giải bài, phân tích độ phức tạp, xử lý khi bí ý. Cần một anh chị đã đi phỏng vấn hoặc từng là người phỏng vấn để làm mock interview 45 phút mỗi tuần, nhận xét cả cách giao tiếp lẫn cách tiếp cận bài. Cam kết khoảng 2 giờ mỗi tuần.",
    skills: ["Phỏng vấn kỹ thuật", "Giải thuật", "Giao tiếp"],
    apps: [
      { who: "mentortuan", status: "PENDING", daysAgo: 4.8,
        message: "Chào nhóm, mình là Tuấn, tech lead mobile/backend. Vài năm nay mình đứng ở phía phỏng vấn ứng viên thực tập và fresher. Mình sẽ đóng vai người phỏng vấn: đưa đề, để bạn nói to suy nghĩ, rồi nhận xét cách phân tích độ phức tạp, đặt câu hỏi làm rõ đề và xử lý khi bí. Mỗi tuần mình làm được một buổi 45 phút vào tối thứ 5." },
    ],
  },
  {
    key: "backend-security", ws: "backend", by: "quocbao", ageDays: 8, expiresInDays: 45, hours: 3, needed: 1,
    title: "Cố vấn review Node.js và bảo mật API (JWT, rate limit, OWASP)",
    description:
      "CLB đang làm API đặt sân thể thao (Express + Prisma + MongoDB). Trước khi deploy cần người có kinh nghiệm soi các lỗ hổng thường gặp: lưu refresh token, phân quyền theo vai trò, validate đầu vào, CORS, giới hạn tốc độ và lộ thông tin trong thông báo lỗi. Cố vấn sẽ review PR theo checklist OWASP API Top 10 và trao đổi qua kênh Xác thực & bảo mật. Khoảng 3 giờ mỗi tuần.",
    skills: ["Node.js", "Bảo mật API", "Database", "Testing"],
    apps: [
      { who: "mentorson", status: "PENDING", daysAgo: 6.2,
        message: "Chào anh Bảo, mình là Sơn, senior front-end nhưng 3 năm nay thường tự viết BFF bằng Node/Express cho team web nên đụng đủ bài toán bảo mật: lưu token trong cookie httpOnly, CSRF, CORS, rate limit. Mình có thể review PR theo checklist OWASP API Top 10 và gửi lại danh sách việc cần sửa theo mức độ rủi ro. Mỗi tuần khoảng 3 giờ." },
    ],
  },
  {
    key: "capstone-defense", ws: "capstone", by: "ngocdiep", ageDays: 7, expiresInDays: 30, hours: 3, needed: 1,
    title: "Tìm cố vấn bảo vệ đồ án (phản biện, câu hỏi hội đồng, cách thuyết trình)",
    description:
      "Nhóm đồ án Quản lý thư viện sẽ bảo vệ trong khoảng 3 tuần nữa. Cần cố vấn có kinh nghiệm ngồi hội đồng hoặc hướng dẫn đồ án để đóng vai phản biện: đặt câu hỏi khó về yêu cầu, thiết kế, kiểm thử và phạm vi; góp ý bố cục báo cáo, slide và thời gian trình bày 15 phút. Dự kiến 3 giờ mỗi tuần, gồm 2 buổi tập bảo vệ thử.",
    skills: ["Bảo vệ đồ án", "Thuyết trình", "Documentation"],
    apps: [
      { who: "gvhung", status: "PENDING", daysAgo: 5.5,
        message: "Chào các em, thầy là Hùng, giảng viên. Thầy từng tham gia hội đồng chấm đồ án cấp khoa nên sẽ đóng vai phản biện: hỏi về phạm vi, cách chọn dữ liệu kiểm thử, giới hạn của hệ thống và cách đo kết quả. Thầy có thể tập bảo vệ thử với các em vào tối thứ sáu." },
      { who: "mentorha", status: "PENDING", daysAgo: 4.1,
        message: "Chào nhóm, mình là Hà. Mình không chấm đồ án chuyên ngành, nhưng có thể giúp nhóm soát báo cáo, phần tóm tắt tiếng Anh và luyện nói 15 phút sao cho mạch lạc, đúng giờ. Nếu nhóm cần thêm một người nghe tập thuyết trình, mình sẵn sàng." },
    ],
  },
  {
    key: "capstone-database", ws: "capstone", by: "phuocloi", ageDays: 21, expiresInDays: 45, hours: 4, needed: 1,
    title: "Cần cố vấn thiết kế CSDL MongoDB cho hệ thống thư viện",
    description:
      "CSDL của đồ án có các thực thể sách, bản sao, độc giả, phiếu mượn, phạt trễ hạn. Nhóm đang phân vân giữa nhúng và tham chiếu, cách chọn index cho tìm kiếm sách và bảo đảm ràng buộc khi nhiều người cùng mượn một bản sao. Cần cố vấn xem lại ERD/schema, đề xuất index và kiểm tra các truy vấn chậm. Khoảng 4 giờ mỗi tuần trong 4–6 tuần.",
    skills: ["Database", "MongoDB", "Thiết kế CSDL", "Node.js"],
    apps: [
      { who: "quocbao", status: "ACCEPTED", daysAgo: 19.8, reviewDaysAgo: 18.5,
        message: "Chào anh chị, mình là Bảo, sinh viên năm 4 chuyên backend Node.js/MongoDB. Mình đã thiết kế schema cho hai dự án có luồng mượn – trả tương tự, hay cân nhắc nhúng hay tham chiếu theo tần suất đọc ghi. Mình có thể xem lại ERD và index của nhóm, chạy explain() trên các truy vấn tìm sách và đề xuất cách chống mượn trùng bản sao bằng giao dịch. Mỗi tuần mình dành 4 giờ.",
        engagement: { by: "phuocloi", days: 30, channels: ["Thiết kế CSDL", "Backend"], extend: { addDays: 15, daysAgo: 5.2 }, chat: CHAT_DATABASE } },
    ],
  },
  {
    key: "capstone-ui", ws: "capstone", by: "ngoclan", ageDays: 24, expiresInDays: 60, hours: 3, needed: 1,
    title: "Tìm cố vấn giao diện React cho độc giả và thủ thư",
    description:
      "Giao diện độc giả (tra cứu, mượn sách) và giao diện thủ thư (quản lý phiếu mượn) cần thống nhất component, bố cục responsive và xử lý lỗi form cho dễ dùng. Nhóm tìm cố vấn review giao diện React/TypeScript, góp ý luồng sử dụng và accessibility cho người dùng lớn tuổi. Khoảng 3 giờ mỗi tuần.",
    skills: ["ReactJS", "UI/UX", "Accessibility"],
    apps: [
      { who: "minhanh", status: "ACCEPTED", daysAgo: 23.2, reviewDaysAgo: 22.3,
        message: "Chào nhóm, mình là Minh Anh, sinh viên năm 3 chuyên React/TypeScript. Mình có thể review component, form và responsive của cả hai giao diện, góp ý về focus và độ tương phản cho người dùng lớn tuổi. Hai tuần đầu mình sẽ review PR hằng ngày để nhóm kịp tiến độ.",
        engagement: { by: "ngoclan", days: 14, channels: ["Giao diện"], end: { reason: "EXPIRED" }, chat: CHAT_LIBRARY_UI } },
      { who: "mentorson", status: "PENDING", daysAgo: 4.5,
        message: "Chào nhóm, mình là Sơn, senior front-end 6 năm. Mình thấy giao diện đã có người hỗ trợ ở đợt trước; nếu nhóm cần thêm cố vấn thứ hai về kiến trúc component và hiệu năng danh sách dài (phiếu mượn) thì mình có thể tham gia khoảng 3 giờ mỗi tuần." },
    ],
  },
  {
    key: "uiux-research", ws: "uiux", by: "thuytrang", ageDays: 4, expiresInDays: 30, hours: 3, needed: 1,
    title: "Cố vấn nghiên cứu người dùng cho đồ án app Học nhóm",
    description:
      "Nhóm cần phỏng vấn 8–10 sinh viên để dựng persona và user journey cho app Học nhóm nhưng chưa biết đặt câu hỏi mở, tránh dẫn dắt và tổng hợp ghi chú thành insight. Cần cố vấn có kinh nghiệm nghiên cứu người dùng hoặc khảo sát: hướng dẫn kịch bản phỏng vấn, xem lại bản câu hỏi usability test và góp ý cách trình bày kết quả. Khoảng 3 giờ mỗi tuần.",
    skills: ["UI/UX", "Nghiên cứu người dùng", "Usability Test"],
    apps: [
      { who: "mentorha", status: "PENDING", daysAgo: 3.2,
        message: "Chào nhóm, mình là Hà, giảng viên. Mình từng thiết kế và chạy khảo sát, phỏng vấn sâu với sinh viên cho đề tài giảng dạy nên rành kịch bản câu hỏi mở và cách tránh dẫn dắt. Mình có thể xem lại kịch bản phỏng vấn của nhóm, ngồi nghe thử một buổi và hướng dẫn tổng hợp thành insight. Mỗi tuần khoảng 3 giờ." },
      { who: "gvhung", status: "REJECTED", daysAgo: 3.8, reviewDaysAgo: 2.6,
        reason: "Cảm ơn thầy ạ. Nhóm đang cần người có kinh nghiệm nghiên cứu UX trực tiếp nên xin phép chưa chọn lần này, mong thầy thông cảm.",
        message: "Chào các em, thầy có kinh nghiệm xử lý số liệu khảo sát và kiểm định thống kê, có thể giúp các em tính cỡ mẫu và đọc kết quả. Phần thiết kế giao diện thầy không rành." },
    ],
  },
  {
    key: "uiux-design-system", ws: "uiux", by: "thaonguyen", ageDays: 12, expiresInDays: 45, hours: 4, needed: 2,
    title: "Tìm cố vấn xây Design System và bàn giao Figma sang code",
    description:
      "Prototype app Học nhóm đã khá hoàn chỉnh nhưng màu, cỡ chữ, khoảng cách còn mỗi màn một kiểu. Nhóm muốn xây design system nhỏ (token màu, typography, nút, form, thẻ) trên Figma và biết cách bàn giao cho lập trình viên: đặt tên layer, variants, ghi chú trạng thái. Cần cố vấn từng làm việc giữa design và front-end để góp ý. Khoảng 4 giờ mỗi tuần, 1–2 buổi review file Figma.",
    skills: ["Figma", "Design System", "UI/UX", "ReactJS"],
    apps: [
      { who: "mentorson", status: "ACCEPTED", daysAgo: 11.1, reviewDaysAgo: 10,
        message: "Chào nhóm, mình là Sơn, senior front-end. Việc mình làm hằng ngày là biến file Figma thành component: đặt tên token, tách variants, thống nhất khoảng cách 4/8px. Mình sẽ review file Figma của nhóm, đề xuất bộ token màu và typography, và chỉ cách ghi chú trạng thái hover, focus, disabled để dev khỏi hỏi lại. Mỗi tuần khoảng 4 giờ.",
        engagement: { by: "thaonguyen", days: 30, channels: ["Figma", "Nguyên lý thiết kế", "Bài tập: thiết kế app"], chat: CHAT_DESIGN_SYSTEM } },
      { who: "vietdung", status: "PENDING", daysAgo: 7.3,
        message: "Chào nhóm, mình là Dũng, sinh viên năm 4, vừa thực tập front-end xong. Trong kỳ thực tập mình ghép giao diện từ Figma nên biết những chỗ designer hay làm khó dev (thiếu trạng thái lỗi, khoảng cách không đồng nhất). Mình có thể làm cố vấn thứ hai, phản hồi dưới góc nhìn người nhận bàn giao." },
    ],
  },
];
