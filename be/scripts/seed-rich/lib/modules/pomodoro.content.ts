/**
 * Kế hoạch các phiên Pomodoro đã kết thúc trong tuần qua (phân hệ `pomodoro`). Chỉ khai báo — phần tính đồng hồ/ghi DB ở `pomodoro.ts`.
 *
 * - `day`: số ngày TRƯỚC hôm nay (0 = hôm nay), `at`: [giờ, phút] giờ Việt Nam.
 * - `cycles`: số vòng tập trung HOÀN THÀNH TỰ NHIÊN; `tail`: số phút sau khi vòng cuối kết thúc thì chủ phòng kết thúc phiên (hoặc người cuối cùng rời, với `end: "EMPTY"`).
 * - `cfg`: [tập trung, nghỉ ngắn, nghỉ dài, số vòng trước nghỉ dài]; mặc định 25/5/15/4.
 * - `skip`: chủ phòng bấm "bỏ qua" ở vòng tập trung thứ hai (không tính vòng hoàn thành).
 */
import type { PersonKey } from "../../types";

export interface PomoPerson {
  who: PersonKey;
  /** Vào phòng sau khi phiên bắt đầu bao nhiêu phút. */
  join: number;
  /** Ở lại bao nhiêu phút; `null` = tới hết phiên. */
  stay: number | null;
  goal?: string;
  /** `true` = mục tiêu chỉ mình mình thấy (goalShared = false). */
  private?: boolean;
  /** Rời giữa chừng `gap` phút rồi quay lại (1 lần gián đoạn). */
  gap?: number;
}

export interface PomoPlan {
  key: string;
  ws: string;
  day: number;
  at: [number, number];
  host: PersonKey;
  cycles: number;
  tail?: number;
  end?: "HOST" | "EMPTY";
  cfg?: [focus: number, short: number, long: number, every: number];
  skip?: boolean;
  people: PomoPerson[];
}

const p = (who: PersonKey, join = 0, stay: number | null = null, goal?: string, o: { private?: boolean; gap?: number } = {}): PomoPerson => ({ who, join, stay, goal, ...o });

export const POMODORO_PLANS: readonly PomoPlan[] = [
  // ── Luyện thi IELTS 6.5+ ──
  { key: "ielts-d6", ws: "ielts", day: 6, at: [15, 0], host: "camtu", cycles: 2, tail: 2, people: [p("camtu", 0, null, "Luyện Speaking Part 2: 3 chủ đề"), p("thu", 2, null, "Làm full test Listening số 1"), p("anhthu", 0, null, "Học 50 từ Academic của tuần 4"), p("yennhi", 6, 45, "Review 10 lỗi hay mắc ở Reading", { private: true })] },
  { key: "ielts-d4", ws: "ielts", day: 4, at: [14, 0], host: "yennhi", cycles: 2, tail: 1, end: "EMPTY", people: [p("yennhi", 0, null, "Làm 3 passage Reading Cambridge có bấm giờ"), p("myhanh", 0, 40, "Học từ vựng chủ đề Environment"), p("kimngan", 3, null)] },
  { key: "ielts-d3", ws: "ielts", day: 3, at: [8, 30], host: "thu", cycles: 3, tail: 3, people: [p("thu", 0, null, "Viết dàn ý Task 2 đề Technology"), p("quynhnhu", 0, null, "Sửa bài Task 2 đề 1 theo nhận xét của cô Hà"), p("khanhlinh", 8, 55, "Soạn bảng collocations Environment & Technology"), p("baochau", 0, null, "Học 30 từ Academic Vocabulary", { gap: 7 })] },
  { key: "ielts-d1", ws: "ielts", day: 1, at: [16, 30], host: "anhthu", cycles: 3, tail: 4, people: [p("anhthu", 0), p("thu", 0, null, "Làm 3 passage Reading có bấm giờ"), p("hieutrung", 4, null, "Ghi âm Speaking Part 2 'A place you visited'", { gap: 6 }), p("yennhi", 0, null, "Chép lại 10 lỗi Reading hay mắc"), p("baochau", 10, 55)] },

  // ── Ôn thi Cấu trúc dữ liệu & Giải thuật ──
  { key: "dsa-d5", ws: "dsa", day: 5, at: [17, 30], host: "tuankiet", cycles: 3, tail: 2, people: [p("tuankiet", 0, null, "Giải 3 bài LeetCode Easy: hai con trỏ"), p("thu", 0, null, "Cài đặt Stack/Queue bằng mảng"), p("khanhlinh", 5, null, "Tổng hợp cheat sheet A4 phần danh sách liên kết"), p("phuongthao", 0, 60)] },
  { key: "dsa-d2", ws: "dsa", day: 2, at: [14, 0], host: "thu", cycles: 4, tail: 6, people: [p("thu", 0, null, "Chữa đề thi 2023: câu cây nhị phân"), p("haidang", 0, null, "Ôn Big-O và các thuật toán sắp xếp"), p("minhkhoi", 10, null, "Xem lại BFS/DFS và Dijkstra"), p("trungkien", 0, null, "Cài BST: thêm, xoá, duyệt", { gap: 5 }), p("nhatminh", 30, 62, undefined)] },
  { key: "dsa-d0", ws: "dsa", day: 0, at: [9, 30], host: "minhkhoi", cycles: 2, tail: 2, skip: true, people: [p("minhkhoi", 0, null, "Quy hoạch động: knapsack và LIS"), p("tuankiet", 0, null, "Heap & Priority Queue"), p("ducanh", 4, null, "Làm lại bài danh sách liên kết đảo ngược", { private: true })] },

  // ── Thiết kế UI/UX cơ bản ──
  { key: "uiux-d6", ws: "uiux", day: 6, at: [19, 0], host: "thaonguyen", cycles: 3, tail: 2, people: [p("thaonguyen", 0, null, "Vẽ user flow: mở app → vào nhóm → nhận việc"), p("khanhlinh", 2, null, "Kiểm tra tương phản màu 4.5:1 cho bảng màu"), p("giabao", 0, null, "Vẽ wireframe màn Chat nhóm"), p("baochau", 7, 55, "Đọc tài liệu về lưới 8pt"), p("myhanh", 0, null)] },
  { key: "uiux-d4", ws: "uiux", day: 4, at: [17, 0], host: "thuytrang", cycles: 2, tail: 3, people: [p("thuytrang", 0, null, "Dựng Color Styles từ bảng màu pastel"), p("thu", 3, null, "Chỉnh wireframe Home theo góp ý"), p("thuhien", 0, null, "Dựng component Button có variant"), p("khanhlinh", 0, 50, "UI màn Đăng nhập")] },
  { key: "uiux-d2", ws: "uiux", day: 2, at: [10, 0], host: "thuhien", cycles: 2, tail: 1, people: [p("thuhien", 0, null, "Thiết kế dark mode cho bảng màu"), p("minhanh", 0, null, "Wireframe màn Bảng công việc (Kanban)")] },
  { key: "uiux-d1", ws: "uiux", day: 1, at: [14, 0], host: "thu", cycles: 2, tail: 5, cfg: [50, 10, 20, 3], people: [p("thu", 0, null, "Hoàn thiện UI Home và thẻ nhóm"), p("thaonguyen", 0, null, "Viết kịch bản usability test 5 người"), p("thanhtung", 7, null, "Làm animation cho thẻ nhóm")] },

  // ── Nhóm học toán cao cấp ──
  { key: "math-d4", ws: "math", day: 4, at: [20, 0], host: "baotram", cycles: 2, tail: 2, people: [p("baotram", 0, null, "Lên lịch ôn nhóm và đặt phòng tự học ở thư viện"), p("trungkien", 0, null, "Giải bài chuỗi số: tiêu chuẩn D'Alembert"), p("tanphat", 0, null, "Làm đề Xác suất thống kê 2024"), p("hieutrung", 4, null, "Chéo hoá ma trận 3×3", { gap: 5 })] },
  { key: "math-d3", ws: "math", day: 3, at: [17, 0], host: "baotram", cycles: 3, tail: 3, people: [p("baotram", 0, null, "Làm đề giữa kỳ Giải tích 1 năm 2024"), p("thu", 0, null, "Ôn đạo hàm: cực trị và khảo sát hàm số"), p("nhatminh", 0, null, "Làm lại câu 3 của đề 2024"), p("myhanh", 5, 60, "Giới hạn dạng vô định 0/0")] },
  { key: "math-d2", ws: "math", day: 2, at: [16, 0], host: "nhatminh", cycles: 2, tail: 1, end: "EMPTY", people: [p("nhatminh", 0, null, "Tích phân từng phần: 5 bài"), p("minhkhoi", 0, null, "Hệ phương trình biện luận theo tham số m")] },
  { key: "math-d0", ws: "math", day: 0, at: [9, 15], host: "thu", cycles: 2, tail: 2, people: [p("thu", 0, null, "Tích phân từng phần: 6 bài"), p("baotram", 5, null, "Gom đề thi 2023 và 2025"), p("giabao", 0, 45, "Ma trận và định thức: nghịch đảo", { private: true })] },

  // ── Nhóm xây dựng dự án ứng dụng (kênh "Kênh 1") ──
  { key: "appdev-d3", ws: "appdev", day: 3, at: [11, 0], host: "thu", cycles: 2, tail: 2, people: [p("thu", 0, null, "Viết README và hướng dẫn chạy dự án"), p("hoanglong", 0, null, "Màn hình Thêm khoản chi"), p("minhanh", 10, null, "Đồng bộ offline: hàng đợi thao tác")] },
  { key: "appdev-d1", ws: "appdev", day: 1, at: [18, 15], host: "hoanglong", cycles: 3, tail: 2, people: [p("hoanglong", 0, null, "Sửa lỗi crash khi nhập số tiền có dấu chấm"), p("duyhung", 0, null, "API /transactions phân trang cursor"), p("thu", 5, null, "Test e2e luồng đăng ký → thêm khoản chi"), p("thanhtung", 0, 60, "Biểu đồ cột thống kê theo tuần")] },

  // ── Nhóm học front-end (kênh Pomodoro "chat trao đổi") ──
  { key: "fe-d5", ws: "frontend", day: 5, at: [10, 30], host: "thu", cycles: 2, tail: 2, people: [p("thu", 0, null, "Flexbox & Grid: bài tập 10 layout"), p("ducanh", 0, null, "Landing page: sửa lỗi tràn ngang trên điện thoại"), p("baochau", 5, 45, "Cài môi trường VS Code, Git, Live Server")] },
  { key: "fe-d2", ws: "frontend", day: 2, at: [10, 30], host: "minhanh", cycles: 3, tail: 3, people: [p("minhanh", 0, null, "Bài React: component và props"), p("thu", 0, null, "Todo app bằng JavaScript thuần"), p("khanhlinh", 0, null, "Ôn ES6: destructuring, spread/rest", { gap: 6 })] },
];
