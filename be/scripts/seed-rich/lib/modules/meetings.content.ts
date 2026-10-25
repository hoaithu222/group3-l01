/**
 * Nội dung lịch họp mẫu (phân hệ `meetings`) cho 8 nhóm làm việc. Chỉ khai báo dữ liệu — phần ghi DB ở `meetings.ts`.
 *
 * Quy ước:
 * - `day`: số ngày kể từ hôm nay theo lịch Việt Nam (âm = đã diễn ra, dương = sắp tới); `at`: [giờ, phút] giờ VN.
 * - `Att` = [người, RSVP, vào muộn (phút), ở lại (phút)]; hai số cuối chỉ có nghĩa với cuộc họp đã diễn ra, thiếu = vắng mặt.
 *   RSVP: A = ACCEPTED, D = DECLINED, T = TENTATIVE, P = PENDING (chưa trả lời). Chủ trì KHÔNG nằm trong `att`; đồng chủ trì (`co`) phải có trong `att`.
 * - Văn bản biên bản dùng markdown-lite của app; `{khoá}` = tên người (rút gọn), `{+N}` = ngày dd/MM sau ngày họp N ngày.
 */
import type { PersonKey } from "../../types";
import { RECAP_TEXT } from "./meetings.recaps";

export type RsvpCode = "A" | "D" | "T" | "P";
export type Att = [who: PersonKey, rsvp: RsvpCode, joinAfter?: number, stay?: number];

export interface RecapPlan {
  /** Người viết nháp đầu (tác giả); phải là chủ trì/đồng chủ trì hoặc người tham dự. */
  author: PersonKey;
  /** Người công bố (chủ trì/đồng chủ trì); mặc định chủ trì. */
  by?: PersonKey;
  text: string;
  /** `false` = mới có bản nháp, chưa công bố. */
  publish?: boolean;
  /** Số lần lưu nháp thêm sau lần đầu (mỗi lần `version + 1`). */
  edits?: number;
  /** Công bố sau khi họp kết thúc bao nhiêu phút. */
  delayMin?: number;
}

export type Where =
  | { format: "OFFLINE" | "HYBRID"; location: string }
  | { platform: "GOOGLE_MEET" | "ZOOM" | "TEAMS"; url: string };

export interface MeetingPlan {
  key: string;
  ws: string;
  host: PersonKey;
  co?: PersonKey[];
  title: string;
  agenda: string;
  day: number;
  at: [number, number];
  mins: number;
  where?: Where;
  remind?: number[];
  /** `true` = mọi thành viên nhóm thấy cuộc họp (visibility WORKSPACE). */
  open?: boolean;
  recapRequired?: boolean;
  att: Att[];
  ended?: { late?: number; over?: number; reason?: "HOST_ENDED" | "EMPTY" };
  cancel?: { by: PersonKey; reason: string; hoursAgo: number };
  recap?: RecapPlan;
}

/** Lịch lặp hằng tuần; các buổi được vật chất hoá (có `count`) như service lặp lịch sẽ sinh. */
export interface SeriesPlan {
  key: string;
  ws: string;
  host: PersonKey;
  co?: PersonKey[];
  title: string;
  agenda: string;
  /** Thứ trong tuần theo mã của quy tắc lặp: MO TU WE TH FR SA SU. */
  weekday: "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU";
  at: [number, number];
  mins: number;
  count: number;
  where?: Where;
  remind?: number[];
  recapRequired?: boolean;
  /** RSVP mặc định của từng người (áp cho các buổi sắp tới; buổi đã qua tự suy ra việc có mặt). */
  att: Array<[who: PersonKey, rsvp: RsvpCode]>;
  /** Biên bản đã công bố của các buổi đã diễn ra, theo `occurrenceIndex`. */
  recaps: Record<number, { author: PersonKey; text: string }>;
  /** Một buổi sắp tới được sửa riêng ("chỉ buổi này") → `isSeriesException`. */
  exception?: { index: number; title: string; shiftDays: number; at: [number, number] };
}

export const MEETINGS: readonly MeetingPlan[] = [
  // ── frontend ──
  {
    key: "frontend:wk1", ws: "frontend", host: "thu",
    title: "Họp nhóm tuần 1: tổng kết HTML/CSS và chốt bài tập",
    agenda: "1. Mỗi bạn demo nhanh landing page đã làm (2–3 phút)\n2. Chốt cách review code chéo bằng Pull Request\n3. Phân công bài Flexbox & Grid cho tuần 2\n4. Hỏi đáp: responsive và a11y",
    day: -3, at: [20, 0], mins: 90, open: true, remind: [1440, 30],
    att: [
      ["minhanh", "A", 0, 88], ["thuytrang", "A", 4, 80], ["ducanh", "A", 0, 86], ["hoanglong", "A", 12, 70], ["baochau", "A", 0, 85],
      ["khanhlinh", "A", 1, 88], ["myhanh", "T", 20, 55], ["thanhtung", "D"], ["vietdung", "A", 0, 60], ["phuongthao", "A", 6, 76],
      ["mentorson", "A", 15, 40], ["giahuy", "A"], ["haidang", "P"],
    ],
    ended: { late: 1, over: 4 },
    recap: { author: "khanhlinh", edits: 1, delayMin: 55, text: RECAP_TEXT["frontend:wk1"] },
  },
  {
    key: "frontend:wk2", ws: "frontend", host: "thu",
    title: "Họp nhóm tuần 2: Flexbox, Grid và review landing page",
    agenda: "1. Review landing page theo checklist responsive & a11y\n2. Flexbox hay Grid: khi nào dùng cái nào (anh Sơn góp ý)\n3. Chia cặp làm bài tập 10 layout\n4. Hỏi đáp tự do",
    day: 4, at: [20, 0], mins: 90, open: true, remind: [1440, 30],
    att: [
      ["minhanh", "A"], ["thuytrang", "A"], ["ducanh", "T"], ["hoanglong", "A"], ["baochau", "P"], ["khanhlinh", "A"], ["myhanh", "D"], ["thanhtung", "P"],
      ["vietdung", "A"], ["phuongthao", "T"], ["mentorson", "P"], ["giahuy", "A"], ["tuankiet", "A"],
    ],
  },
  {
    key: "frontend:review-mentor", ws: "frontend", host: "minhanh", co: ["thuytrang"],
    title: "Review code cùng anh Sơn: todo app và gọi API thời tiết",
    agenda: "Anh Sơn (mentor) review trực tiếp hai bài: todo app bằng JavaScript thuần và bài gọi API thời tiết bằng fetch. Mỗi bạn chuẩn bị link repo hoặc CodeSandbox; mang laptop nếu đến họp trực tiếp.",
    day: 8, at: [9, 30], mins: 90, remind: [60, 15],
    where: {format: "HYBRID", location: "Phòng tự học tầng 3, thư viện trường"},
    att: [
      ["thuytrang", "A"], ["thu", "P"], ["mentorson", "A"], ["hoanglong", "T"], ["tuankiet", "A"], ["ducanh", "P"], ["khanhlinh", "A"], ["giahuy", "D"],
    ],
  },
  // ── math ──
  {
    key: "math:de-giua-ky", ws: "math", host: "thu",
    title: "Giải đề giữa kỳ Giải tích 1 (năm 2024) — chữa theo nhóm",
    agenda: "Làm lại câu 3–5 của đề 2024, so lời giải theo từng bước, rút ra các lỗi hay mắc ở giới hạn và tích phân từng phần.",
    day: -2, at: [19, 0], mins: 90, recapRequired: true,
    att: [
      ["baotram", "A", 0, 88], ["gvhung", "A", 10, 60], ["myhanh", "A", 0, 86], ["nhatminh", "A", 0, 90], ["quynhnhu", "T", 8, 70], ["tanphat", "A", 0, 85],
      ["trungkien", "A", 0, 88], ["hieutrung", "A", 5, 75], ["minhkhoi", "D"], ["camtu", "P"], ["giabao", "A", 15, 50], ["yennhi", "A", 0, 80],
    ],
    ended: { late: 2, over: 3 },
    recap: { author: "baotram", delayMin: 70, text: RECAP_TEXT["math:de-giua-ky"] },
  },
  {
    key: "math:dai-so-online", ws: "math", host: "baotram",
    title: "Ôn Đại số tuyến tính: định thức và ma trận nghịch đảo",
    agenda: "Ôn nhanh định thức, hạng ma trận, ma trận nghịch đảo bằng biến đổi sơ cấp; làm 5 bài trắc nghiệm bấm giờ.",
    day: 3, at: [19, 0], mins: 90, remind: [1440, 15],
    att: [
      ["thu", "A"], ["gvhung", "A"], ["myhanh", "A"], ["nhatminh", "T"], ["hieutrung", "A"], ["giabao", "P"], ["thaonguyen", "A"], ["tanphat", "D"],
    ],
    cancel: { by: "baotram", reason: "Thầy Hùng bận họp khoa, dời sang buổi học trực tiếp ở thư viện trong tuần này.", hoursAgo: 20 },
  },
  {
    key: "math:dai-so-offline", ws: "math", host: "baotram", co: ["thu"],
    title: "Học nhóm trực tiếp: chữa đề Đại số tuyến tính cùng thầy Hùng",
    agenda: "Gặp trực tiếp ở thư viện. Thầy Hùng chữa bài chéo hoá ma trận 3×3 có trị riêng bội và hệ phương trình biện luận theo tham số m. Mang theo đề đã làm và giấy nháp.",
    day: 6, at: [18, 30], mins: 90, remind: [1440, 60],
    where: {format: "OFFLINE", location: "Phòng tự học P.204, thư viện trường"},
    att: [
      ["thu", "A"], ["gvhung", "A"], ["myhanh", "A"], ["nhatminh", "A"], ["hieutrung", "T"], ["tanphat", "A"], ["minhkhoi", "A"], ["giabao", "P"],
      ["quynhnhu", "D"], ["camtu", "T"],
    ],
  },
  {
    key: "math:xstk", ws: "math", host: "thu",
    title: "Họp nhóm: Xác suất thống kê — biến ngẫu nhiên và phân phối chuẩn",
    agenda: "Ôn biến ngẫu nhiên rời rạc/liên tục, kỳ vọng, phương sai và cách tra bảng Z; làm đề Xác suất thống kê 2024 và chấm chéo.",
    day: 12, at: [20, 0], mins: 75, open: true,
    att: [
      ["baotram", "A"], ["tanphat", "A"], ["camtu", "P"], ["giabao", "P"], ["minhkhoi", "T"], ["yennhi", "A"], ["quynhnhu", "P"], ["trungkien", "A"],
    ],
  },
  // ── appdev ──
  {
    key: "appdev:demo-ui", ws: "appdev", host: "quocbao", co: ["thu"],
    title: "Demo bản Figma v1 và chốt UI màn hình Thêm khoản chi",
    agenda: "1. Chị Trang demo Figma v1 (4 màn hình chính)\n2. Chốt layout màn Thêm khoản chi: bàn phím số, chọn danh mục, ghi chú\n3. Thống nhất token màu để Dark mode dùng chung",
    day: -2, at: [21, 0], mins: 60, recapRequired: true,
    att: [
      ["thu", "A", 0, 58], ["thuytrang", "A", 2, 55], ["minhanh", "A", 0, 57], ["hoanglong", "A", 5, 52], ["mentortuan", "A", 8, 40], ["giahuy", "T"],
      ["phuongthao", "A", 3, 54], ["duyhung", "A", 0, 58],
    ],
    ended: { late: 1, over: 2 },
    recap: { author: "hoanglong", publish: false, text: RECAP_TEXT["appdev:demo-ui"] },
  },
  {
    key: "appdev:kien-truc-api", ws: "appdev", host: "mentortuan",
    title: "Review kiến trúc API và đồng bộ offline",
    agenda: "Anh Tuấn review thiết kế API /transactions (phân trang cursor, clientId chống tạo trùng) và hàng đợi đồng bộ offline của app. Chuẩn bị sơ đồ luồng dữ liệu và các trường hợp lỗi mạng.",
    day: 7, at: [20, 30], mins: 75, remind: [1440, 30],
    att: [
      ["thu", "A"], ["quocbao", "A"], ["duyhung", "A"], ["minhanh", "T"], ["hoanglong", "A"], ["giahuy", "P"], ["phuongthao", "P"], ["vietdung", "D"],
    ],
  },
  // ── ielts ──
  {
    key: "ielts:tuan3", ws: "ielts", host: "thu",
    title: "Tổng kết tuần 3: lỗi Writing Task 2 hay gặp",
    agenda: "Điểm lại bài Task 2 đề Early education, các lỗi mạo từ/thì/mạch lạc, và cách viết đoạn mở bài – thân bài – kết bài gọn.",
    day: -9, at: [20, 0], mins: 75,
    att: [
      ["mentorha", "A", 0, 70], ["camtu", "A", 2, 68], ["anhthu", "A", 0, 72], ["quynhnhu", "A", 5, 65], ["yennhi", "A", 0, 70], ["khanhlinh", "A", 0, 71],
      ["thuhien", "T", 10, 55], ["baochau", "D"], ["giabao", "A", 0, 66], ["myhanh", "P"], ["kimngan", "A", 12, 50], ["hieutrung", "A", 0, 73],
      ["ducanh", "T"],
    ],
    ended: { late: 0, over: 2 },
    recap: { author: "yennhi", by: "thu", delayMin: 120, text: RECAP_TEXT["ielts:tuan3"] },
  },
  {
    key: "ielts:speaking", ws: "ielts", host: "camtu",
    title: "Luyện nói nhóm: Speaking Part 2 và Part 3",
    agenda: "Luyện theo cặp: mỗi người nói Part 2 khoảng 2 phút (chủ đề “A place you visited”), bạn cùng cặp hỏi Part 3. Có phản hồi chéo ngay sau mỗi lượt.",
    day: -4, at: [15, 30], mins: 60,
    att: [
      ["thu", "A", 0, 58], ["anhthu", "A", 0, 60], ["hieutrung", "A", 3, 55], ["baochau", "A", 0, 57], ["myhanh", "T", 12, 40], ["ducanh", "A", 0, 58],
      ["quynhnhu", "D"], ["yennhi", "P"],
    ],
    ended: { late: 0, over: 1 },
    recap: { author: "camtu", delayMin: 40, text: RECAP_TEXT["ielts:speaking"] },
  },
  {
    key: "ielts:mock6", ws: "ielts", host: "thu",
    title: "Mock test tuần 6: phân phòng thi thử và lịch chấm",
    agenda: "Chốt lịch thi thử đủ 4 kỹ năng (Listening 40', Reading 60', Writing 60'), chia người coi thi/chấm chéo, thống nhất thang chấm band.",
    day: 5, at: [19, 0], mins: 90, open: true, remind: [1440, 30],
    att: [
      ["mentorha", "A"], ["camtu", "A"], ["anhthu", "A"], ["quynhnhu", "T"], ["yennhi", "A"], ["khanhlinh", "P"], ["thuhien", "A"], ["hieutrung", "P"],
      ["baochau", "D"], ["giabao", "T"],
    ],
  },
  {
    key: "ielts:chua-writing", ws: "ielts", host: "mentorha",
    title: "Cô Hà chữa Writing Task 2 trực tiếp",
    agenda: "Cô Hà chấm và chữa 3 bài Task 2 được chọn trước (đề Technology). Các bạn nộp bài lên kênh Chấm Writing với cô Hà trước buổi họp 1 ngày.",
    day: 11, at: [20, 0], mins: 90, remind: [1440, 15],
    where: {platform: "GOOGLE_MEET", url: "https://meet.google.com/vkd-qmzt-pnr"},
    att: [
      ["thu", "A"], ["camtu", "A"], ["anhthu", "P"], ["quynhnhu", "A"], ["yennhi", "T"], ["hieutrung", "P"], ["giabao", "P"],
    ],
  },
  // ── dsa ──
  {
    key: "dsa:tuan2", ws: "dsa", host: "haidang",
    title: "Họp tuần 2: chốt đề cương Stack/Queue và mock test cuối tuần",
    agenda: "Rà tiến độ chủ đề tuần 2, thống nhất cách cài đặt queue vòng và hai stack, phân công ra đề mock test cuối tuần.",
    day: -6, at: [20, 0], mins: 60,
    att: [
      ["thu", "A", 0, 58], ["minhkhoi", "A", 2, 56], ["tuankiet", "A", 0, 58], ["trungkien", "A", 0, 57], ["giahuy", "T", 15, 35], ["ducanh", "A", 0, 55],
      ["baochau", "A", 4, 52], ["khanhlinh", "A", 0, 58], ["nhatminh", "D"], ["phuongthao", "A", 0, 57],
    ],
    ended: { late: 1, over: 0 },
    recap: { author: "khanhlinh", by: "haidang", delayMin: 90, text: RECAP_TEXT["dsa:tuan2"] },
  },
  {
    key: "dsa:chua-de", ws: "dsa", host: "thu",
    title: "Chữa đề thi 3 năm gần nhất",
    agenda: "Chữa đề thi các năm 2022–2024 theo nhóm câu: độ phức tạp, cây nhị phân/BST, đồ thị. Mỗi câu một người trình bày lời giải.",
    day: -1, at: [21, 0], mins: 90,
    att: [
      ["haidang", "A", 0, 88], ["minhkhoi", "A", 0, 90], ["tuankiet", "A", 5, 82], ["trungkien", "A", 0, 88], ["phuongthao", "A", 0, 86],
      ["nhatminh", "T", 20, 60], ["hoanglong", "A", 0, 85], ["vietdung", "A", 10, 70], ["quocbao", "D"], ["ducanh", "P"], ["khanhlinh", "A", 0, 89],
    ],
    ended: { late: 1, over: 4 },
    recap: { author: "phuongthao", by: "thu", delayMin: 45, text: RECAP_TEXT["dsa:chua-de"] },
  },
  {
    key: "dsa:mock3", ws: "dsa", host: "haidang",
    title: "Mock test cuối tuần 3 và rút kinh nghiệm",
    agenda: "Làm mock test 60 phút (cây, heap, hash table), chấm chéo và rút kinh nghiệm ngay sau khi làm.",
    day: 7, at: [9, 0], mins: 75, open: true, remind: [1440, 30],
    att: [
      ["thu", "A"], ["minhkhoi", "A"], ["tuankiet", "A"], ["trungkien", "T"], ["giahuy", "P"], ["ducanh", "A"], ["baochau", "P"], ["khanhlinh", "A"],
      ["phuongthao", "T"], ["nhatminh", "D"],
    ],
  },
  {
    key: "dsa:on-tong-luc", ws: "dsa", host: "minhkhoi",
    title: "Ôn tổng lực trước thi: đồ thị và quy hoạch động",
    agenda: "Họp trực tiếp cả buổi chiều: đồ thị (BFS/DFS, Dijkstra) và quy hoạch động (knapsack, LIS, đổi tiền), xen kẽ làm bài và giải đáp.",
    day: 8, at: [14, 0], mins: 120, remind: [1440, 60],
    where: {format: "OFFLINE", location: "Phòng học nhóm tầng 2, khu giảng đường B"},
    att: [
      ["thu", "A"], ["haidang", "A"], ["tuankiet", "A"], ["trungkien", "T"], ["hoanglong", "P"], ["khanhlinh", "A"], ["phuongthao", "D"], ["ducanh", "P"],
    ],
  },
  // ── backend ──
  {
    key: "backend:retro4", ws: "backend", host: "quocbao",
    title: "Retro Sprint 4 và lập kế hoạch Sprint 5",
    agenda: "1. Retro: điều làm tốt, điều cần cải thiện, hành động tiếp theo\n2. Chốt phạm vi Sprint 5: API đặt sân thể thao\n3. Phân công và ước lượng story points",
    day: -10, at: [20, 30], mins: 90,
    att: [
      ["thu", "A", 0, 88], ["mentortuan", "A", 3, 80], ["duyhung", "A", 0, 90], ["giahuy", "A", 0, 88], ["minhanh", "A", 0, 85], ["hoanglong", "T", 15, 60],
      ["phuongthao", "A", 5, 82], ["tuankiet", "A", 0, 87], ["vietdung", "D"], ["haidang", "A", 0, 86], ["phuocloi", "A", 2, 84], ["ducanh", "P"],
    ],
    ended: { late: 2, over: 1 },
    recap: { author: "quocbao", edits: 2, delayMin: 30, text: RECAP_TEXT["backend:retro4"] },
  },
  {
    key: "backend:review-booking", ws: "backend", host: "mentortuan",
    title: "Code review trực tiếp: API đặt sân chống trùng giờ",
    agenda: "Cả nhóm cùng đọc PR của API đặt sân: kiểm tra overlap thời gian, unique slot, xử lý đua (race condition) khi hai người đặt cùng lúc.",
    day: -7, at: [14, 0], mins: 60,
    att: [
      ["thu", "A", 0, 58], ["quocbao", "A", 0, 57], ["tuankiet", "A", 0, 59], ["haidang", "A", 4, 52], ["duyhung", "A", 0, 58], ["minhanh", "A", 0, 55],
      ["giahuy", "T", 20, 38], ["phuongthao", "A", 0, 58], ["ducanh", "D"],
    ],
    ended: { late: 0, over: 2 },
    recap: { author: "tuankiet", by: "mentortuan", delayMin: 60, text: RECAP_TEXT["backend:review-booking"] },
  },
  {
    key: "backend:giua-sprint", ws: "backend", host: "thu",
    title: "Họp giữa Sprint 5: demo API và chốt kế hoạch deploy Railway",
    agenda: "1. Demo nhanh các endpoint đã xong (auth, court, booking)\n2. Rà các việc đang chậm: rate limit, seed dữ liệu, test API\n3. Kế hoạch deploy lên Railway và cấu hình biến môi trường",
    day: 1, at: [20, 0], mins: 60, remind: [1440, 30],
    att: [
      ["quocbao", "A"], ["mentortuan", "A"], ["duyhung", "A"], ["giahuy", "A"], ["minhanh", "T"], ["hoanglong", "P"], ["phuongthao", "A"], ["tuankiet", "A"],
      ["haidang", "P"], ["phuocloi", "D"], ["ducanh", "P"],
    ],
  },
  {
    key: "backend:workshop-docker", ws: "backend", host: "duyhung",
    title: "Workshop Docker multi-stage và GitHub Actions CI",
    agenda: "Thực hành viết Dockerfile multi-stage cho API Express/Prisma, cấu hình .dockerignore và workflow CI chạy lint + typecheck + test.",
    day: 7, at: [15, 30], mins: 90, open: true, remind: [1440, 30],
    att: [
      ["thu", "A"], ["giahuy", "A"], ["quocbao", "A"], ["mentortuan", "T"], ["minhanh", "P"], ["hoanglong", "A"], ["tuankiet", "P"], ["ducanh", "A"],
      ["vietdung", "T"],
    ],
  },
  // ── capstone ──
  {
    key: "capstone:erd", ws: "capstone", host: "phuocloi",
    title: "Chốt ERD v2 và phân công Chương 3",
    agenda: "Rà lại ERD v2 (Sach, BanSao, DocGia, PhieuMuon, ChiTietMuon, Phat), thống nhất ràng buộc dữ liệu, phân công viết Chương 3 — Phân tích & thiết kế hệ thống.",
    day: -4, at: [20, 0], mins: 75,
    att: [
      ["ngocdiep", "A", 0, 74], ["ngoclan", "A", 0, 75], ["thu", "A", 3, 70], ["thuhien", "A", 0, 72], ["duyhung", "A", 5, 66], ["vietdung", "T", 15, 50],
      ["phuongthao", "A", 0, 73], ["mentortuan", "A", 10, 55],
    ],
    ended: { late: 1, over: 2 },
    recap: { author: "ngoclan", delayMin: 80, text: RECAP_TEXT["capstone:erd"] },
  },
  {
    key: "capstone:dry-run", ws: "capstone", host: "ngocdiep",
    title: "Tập thuyết trình thử (dry-run) trước buổi bảo vệ",
    agenda: "Thuyết trình thử toàn bộ ~12 slide, có bấm giờ 15 phút, sau đó cả nhóm đóng vai hội đồng đặt câu hỏi phản biện.",
    day: 6, at: [14, 0], mins: 90, remind: [1440, 60],
    where: {format: "OFFLINE", location: "Phòng họp B.105, khoa Công nghệ thông tin"},
    att: [
      ["thu", "A"], ["ngoclan", "A"], ["phuocloi", "A"], ["thuhien", "A"], ["duyhung", "T"], ["vietdung", "P"], ["phuongthao", "A"], ["mentortuan", "T"],
    ],
  },
  // ── uiux ──
  {
    key: "uiux:workshop-figma", ws: "uiux", host: "thaonguyen",
    title: "Workshop Figma: Auto layout, Component và Variant",
    agenda: "Thực hành tạo nút bấm có variant (kích thước, trạng thái), dùng Auto layout cho thẻ danh sách, và tổ chức Component để dùng lại trong đồ án.",
    day: -12, at: [20, 0], mins: 90,
    att: [
      ["thuytrang", "A", 0, 88], ["thu", "A", 2, 85], ["minhanh", "A", 0, 90], ["thuhien", "A", 0, 89], ["ducanh", "A", 6, 80], ["baochau", "A", 0, 88],
      ["giabao", "T", 20, 60], ["khanhlinh", "A", 0, 90], ["thanhtung", "A", 0, 87], ["myhanh", "D"], ["hoanglong", "P"],
    ],
    ended: { late: 1, over: 3 },
    recap: { author: "thuhien", by: "thaonguyen", delayMin: 100, text: RECAP_TEXT["uiux:workshop-figma"] },
  },
  {
    key: "uiux:critique1", ws: "uiux", host: "thuytrang",
    title: "Critique buổi 1: wireframe Đăng nhập và Home",
    agenda: "Mỗi người trình bày wireframe trong 3 phút, cả nhóm góp ý theo khung “điều tốt – điều chưa rõ – gợi ý”. Không bàn màu sắc ở buổi này.",
    day: -5, at: [19, 30], mins: 90,
    att: [
      ["thaonguyen", "A", 0, 88], ["thu", "A", 0, 86], ["minhanh", "A", 2, 84], ["thuhien", "A", 0, 88], ["ducanh", "A", 5, 80], ["baochau", "T", 12, 60],
      ["giabao", "A", 0, 85], ["khanhlinh", "A", 0, 88], ["thanhtung", "T"], ["myhanh", "A", 8, 70], ["hoanglong", "A", 0, 86],
    ],
    ended: { late: 1, over: 3 },
    recap: { author: "thaonguyen", by: "thuytrang", delayMin: 90, text: RECAP_TEXT["uiux:critique1"] },
  },
  {
    key: "uiux:critique2", ws: "uiux", host: "thuytrang",
    title: "Critique buổi 2: bảng màu pastel và design system",
    agenda: "Xem bảng màu pastel v1 trên các màn hình mẫu, kiểm tra độ tương phản chữ/nền (WCAG AA 4.5:1) và thống nhất cấu trúc design system.",
    day: 3, at: [19, 30], mins: 90, open: true, remind: [1440, 30],
    att: [
      ["thaonguyen", "A"], ["thu", "A"], ["minhanh", "A"], ["thuhien", "T"], ["ducanh", "P"], ["baochau", "P"], ["giabao", "T"], ["khanhlinh", "A"],
      ["thanhtung", "A"], ["myhanh", "D"], ["hoanglong", "P"],
    ],
  },
  {
    key: "uiux:usability", ws: "uiux", host: "thaonguyen",
    title: "Lên kế hoạch usability test 5 người cho prototype",
    agenda: "Chọn 5 người tham gia, viết kịch bản nhiệm vụ (đăng nhập → vào nhóm → nhận việc), phân vai người điều phối và người ghi chép.",
    day: 10, at: [20, 30], mins: 60,
    att: [
      ["thuytrang", "A"], ["thu", "T"], ["thuhien", "A"], ["khanhlinh", "P"], ["giabao", "P"], ["ducanh", "T"], ["minhanh", "P"],
    ],
  },
];

export const SERIES: readonly SeriesPlan[] = [
  {
    key: "appdev:sprint-weekly", ws: "appdev", host: "thu", co: ["quocbao"],
    title: "Họp sprint hằng tuần — dự án Tiêu Gọn",
    agenda: "Cập nhật tiến độ theo bảng Đồ án 1: việc đã xong, việc đang bị chặn, kế hoạch tuần tới. Mỗi người nói tối đa 2 phút.",
    weekday: "MO", at: [20, 0], mins: 60, count: 6, remind: [1440, 30],
    att: [
      ["quocbao", "A"], ["mentortuan", "A"], ["minhanh", "A"], ["hoanglong", "A"], ["thuytrang", "T"], ["giahuy", "A"], ["phuongthao", "T"],
      ["duyhung", "A"], ["thuhien", "P"], ["kimngan", "P"], ["vietdung", "T"], ["thanhtung", "A"],
    ],
    recaps: {
      0: { author: "quocbao", text: RECAP_TEXT["appdev:sprint-weekly#0"] },
      1: { author: "hoanglong", text: RECAP_TEXT["appdev:sprint-weekly#1"] },
    },
  },
  {
    key: "capstone:tien-do-weekly", ws: "capstone", host: "ngocdiep", co: ["phuocloi"],
    title: "Họp tiến độ đồ án hằng tuần với giảng viên hướng dẫn",
    agenda: "Báo cáo tiến độ báo cáo/backend/giao diện, nêu vướng mắc cần giảng viên hướng dẫn tháo gỡ, chốt mục tiêu tuần tới.",
    weekday: "MO", at: [15, 30], mins: 60, count: 6, remind: [1440, 30],
    where: {platform: "GOOGLE_MEET", url: "https://meet.google.com/pzq-wdcn-rhk"},
    att: [
      ["thu", "A"], ["ngoclan", "A"], ["phuocloi", "A"], ["thuhien", "A"], ["duyhung", "T"], ["vietdung", "A"], ["phuongthao", "T"], ["mentortuan", "P"],
    ],
    recaps: {
      0: { author: "ngoclan", text: RECAP_TEXT["capstone:tien-do-weekly#0"] },
      1: { author: "phuocloi", text: RECAP_TEXT["capstone:tien-do-weekly#1"] },
    },
    exception: { index: 3, title: "Họp tiến độ đồ án — dời sang tối thứ Ba để chốt Chương 3", shiftDays: 1, at: [19, 0] },
  },
];
