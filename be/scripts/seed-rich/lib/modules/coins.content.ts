/**
 * Nội dung kinh tế xu (phân hệ `coins`): các đợt thưởng của quản trị viên, mua vật phẩm cửa hàng, tin niêm yết ở chợ tài liệu và lượt mua.
 * Xu kiếm từ sự kiện XP / nhiệm vụ ngày KHÔNG nằm ở đây — chúng được dựng từ chính `XpEvent` đã có trong DB (xem `coins.ts`).
 */
import type { PersonKey } from "../../types";

export interface GrantSpec {
  to: PersonKey;
  amount: number;
  note: string;
  /** Cách đây bao nhiêu ngày (bị chặn dưới bởi ngày tạo tài khoản người nhận). */
  daysAgo: number;
}

const KHOI_DONG = "Thưởng tham gia tuần học khởi động";
const DONG_GOP = "Thưởng thành viên đóng góp nổi bật tuần 1";
const CHAO_MUNG = "Tặng xu chào mừng thành viên mới";

/** Điều chỉnh của quản trị viên (`ADJUST_ADMIN`, có lý do) — nguồn xu ban đầu đủ để mua vật phẩm/tài liệu. */
export const GRANTS: readonly GrantSpec[] = [
  { to: "thu", amount: 350, note: KHOI_DONG, daysAgo: 14 },
  { to: "thu", amount: 250, note: DONG_GOP, daysAgo: 8 },
  { to: "minhanh", amount: 300, note: KHOI_DONG, daysAgo: 14 },
  { to: "minhanh", amount: 300, note: DONG_GOP, daysAgo: 7 },
  { to: "thuytrang", amount: 300, note: KHOI_DONG, daysAgo: 14 },
  { to: "thuytrang", amount: 250, note: DONG_GOP, daysAgo: 7 },
  { to: "ngocdiep", amount: 250, note: KHOI_DONG, daysAgo: 13 },
  { to: "ngocdiep", amount: 100, note: DONG_GOP, daysAgo: 6 },
  { to: "hoanglong", amount: 300, note: KHOI_DONG, daysAgo: 14 },
  { to: "hoanglong", amount: 350, note: DONG_GOP, daysAgo: 7 },
  { to: "khanhlinh", amount: 300, note: KHOI_DONG, daysAgo: 14 },
  { to: "khanhlinh", amount: 300, note: DONG_GOP, daysAgo: 7 },
  { to: "quocbao", amount: 250, note: KHOI_DONG, daysAgo: 13 },
  { to: "quocbao", amount: 100, note: DONG_GOP, daysAgo: 6 },
  { to: "giahuy", amount: 400, note: KHOI_DONG, daysAgo: 13 },
  { to: "haidang", amount: 250, note: KHOI_DONG, daysAgo: 12 },
  { to: "thaonguyen", amount: 200, note: KHOI_DONG, daysAgo: 12 },
  { to: "duyhung", amount: 150, note: KHOI_DONG, daysAgo: 12 },
  { to: "tuankiet", amount: 100, note: CHAO_MUNG, daysAgo: 11 },
  { to: "ducanh", amount: 100, note: CHAO_MUNG, daysAgo: 11 },
  { to: "baochau", amount: 100, note: CHAO_MUNG, daysAgo: 10 },
  { to: "myhanh", amount: 100, note: CHAO_MUNG, daysAgo: 10 },
  { to: "hieutrung", amount: 100, note: CHAO_MUNG, daysAgo: 10 },
  { to: "anhthu", amount: 150, note: CHAO_MUNG, daysAgo: 9 },
  { to: "yennhi", amount: 150, note: CHAO_MUNG, daysAgo: 9 },
  { to: "giabao", amount: 50, note: CHAO_MUNG, daysAgo: 8 },
];

export interface ShopBuySpec {
  who: PersonKey;
  /** `ShopItem.code` đã có sẵn trong DB. */
  item: "frame-gold" | "frame-emerald" | "theme-ocean" | "theme-sunset" | "emoji-study";
  /** Cách đây bao nhiêu ngày. */
  daysAgo: number;
  /** Đang trang bị (tối đa một vật phẩm mỗi loại; vật phẩm mua SAU thắng nếu cùng loại cùng được đánh dấu). */
  equip: boolean;
}

export const SHOP_BUYS: readonly ShopBuySpec[] = [
  { who: "thu", item: "frame-emerald", daysAgo: 10, equip: true },
  { who: "thu", item: "emoji-study", daysAgo: 6, equip: true },
  { who: "minhanh", item: "theme-ocean", daysAgo: 9, equip: true },
  { who: "minhanh", item: "frame-gold", daysAgo: 5, equip: true },
  { who: "thuytrang", item: "theme-sunset", daysAgo: 9, equip: true },
  { who: "thuytrang", item: "emoji-study", daysAgo: 4, equip: false },
  { who: "ngocdiep", item: "frame-gold", daysAgo: 8, equip: true },
  { who: "hoanglong", item: "frame-emerald", daysAgo: 8, equip: true },
  { who: "hoanglong", item: "theme-sunset", daysAgo: 3, equip: false },
  { who: "khanhlinh", item: "emoji-study", daysAgo: 7, equip: true },
  { who: "khanhlinh", item: "frame-gold", daysAgo: 2, equip: false },
  { who: "quocbao", item: "emoji-study", daysAgo: 6, equip: false },
  { who: "giahuy", item: "theme-ocean", daysAgo: 7, equip: true },
  { who: "haidang", item: "frame-gold", daysAgo: 5, equip: true },
  { who: "thaonguyen", item: "frame-emerald", daysAgo: 4, equip: true },
];

export interface ListingSpec {
  seller: PersonKey;
  /** Tiêu đề CHÍNH XÁC của bộ học PUBLIC (đã có trong DB) mà tin này bán. */
  setTitle: string;
  title: string;
  description: string;
  tags: string[];
  price: number;
  /** Mặc định ACTIVE (đã được quản trị duyệt). */
  status?: "ACTIVE" | "PENDING_REVIEW";
  /** Số lượt báo cáo đang có. */
  reports?: number;
  /** Đăng cách đây bao nhiêu ngày (bị chặn dưới bởi ngày tạo bộ học). */
  daysAgo: number;
}

export const LISTINGS: readonly ListingSpec[] = [
  { seller: "minhanh", setTitle: "React & Hooks: useState, useEffect, key, props", title: "Bộ ôn React Hooks — 15 thẻ có giải thích", description: "Tổng hợp những chỗ hay nhầm khi mới học React: useState cập nhật bất đồng bộ, mảng phụ thuộc của useEffect, vì sao cần key khi render danh sách, props là chỉ-đọc. Mỗi thẻ có ví dụ ngắn và lời giải thích.", tags: ["react", "hooks", "frontend"], price: 60, daysAgo: 9 },
  { seller: "tanphat", setTitle: "Ma trận & xác suất cơ bản", title: "Ma trận và xác suất cơ bản — thẻ ôn thi giữa kỳ", description: "Các phép toán ma trận, định thức, ma trận nghịch đảo và những công thức xác suất hay vào đề: xác suất có điều kiện, công thức Bayes, biến cố độc lập. Có thẻ trắc nghiệm và điền khuyết để tự kiểm tra.", tags: ["toán", "xác suất", "ma trận"], price: 40, daysAgo: 8 },
  { seller: "mentortuan", setTitle: "Git workflow & code review", title: "Git workflow và code review cho nhóm nhỏ", description: "Quy trình nhánh feature/develop/main, cách đặt tên nhánh và commit, giải quyết xung đột, rebase hay merge, và checklist khi review pull request. Rút ra từ các dự án nhóm sinh viên đã làm cùng mentor.", tags: ["git", "teamwork", "review"], price: 80, daysAgo: 12 },
  { seller: "mentortuan", setTitle: "Node.js/Express, xác thực & bảo mật", title: "Node.js/Express: xác thực JWT và bảo mật cơ bản", description: "Luồng đăng nhập bằng access/refresh token, băm mật khẩu, middleware xác thực, giới hạn tần suất gọi API, chống các lỗi thường gặp như NoSQL injection và lộ thông tin trong thông báo lỗi.", tags: ["nodejs", "express", "bảo mật"], price: 100, daysAgo: 11 },
  { seller: "mentorha", setTitle: "IELTS Writing Task 2: cấu trúc & lỗi thường gặp", title: "IELTS Writing Task 2 — cấu trúc bài và lỗi hay gặp", description: "Khung mở bài – thân bài – kết bài cho các dạng đề opinion, discussion, problem–solution; danh sách lỗi ngữ pháp và dùng từ thường bị trừ điểm kèm cách sửa. Biên soạn từ các bài chấm thật của học viên.", tags: ["ielts", "writing", "tiếng anh"], price: 120, daysAgo: 10 },
  { seller: "trungkien", setTitle: "Quy hoạch động & chiến lược thuật toán", title: "Quy hoạch động từ cơ bản — dãy con, cái túi, đường đi", description: "Nhận diện bài toán quy hoạch động, cách đặt trạng thái và công thức truy hồi cho các dạng kinh điển: dãy con tăng dài nhất, cái túi 0/1, đường đi trên lưới. Có bài tập đi kèm lời giải từng bước.", tags: ["thuật toán", "quy hoạch động"], price: 70, reports: 1, daysAgo: 9 },
  { seller: "thaonguyen", setTitle: "Nghiên cứu người dùng & UX", title: "Nghiên cứu người dùng và UX — thuật ngữ cần nhớ", description: "Persona, user journey, phỏng vấn người dùng, usability test, heuristic của Nielsen — mỗi khái niệm một thẻ ngắn gọn kèm tình huống ví dụ trong thiết kế ứng dụng.", tags: ["ux", "thiết kế", "nghiên cứu"], price: 45, daysAgo: 6 },
  { seller: "ngoclan", setTitle: "Kỹ năng thuyết trình & bảo vệ đồ án", title: "Thuyết trình và bảo vệ đồ án — câu hỏi hội đồng hay hỏi", description: "Cách dựng slide, phân chia thời gian cho từng phần và những câu hỏi phản biện thường gặp khi bảo vệ đồ án, kèm gợi ý cách trả lời gọn và trung thực.", tags: ["thuyết trình", "đồ án"], price: 50, status: "PENDING_REVIEW", daysAgo: 2 },
];

export interface MarketBuySpec {
  buyer: PersonKey;
  /** `ListingSpec.setTitle` của tin được mua. */
  listing: string;
  /** Vị trí trong khoảng từ lúc đăng tin tới hiện tại, 0–1 (rải đều các lượt mua). */
  at: number;
}

const GIT = "Git workflow & code review";
const NODE = "Node.js/Express, xác thực & bảo mật";
const REACT = "React & Hooks: useState, useEffect, key, props";
const IELTS = "IELTS Writing Task 2: cấu trúc & lỗi thường gặp";
const DP = "Quy hoạch động & chiến lược thuật toán";
const MATRIX = "Ma trận & xác suất cơ bản";
const UX = "Nghiên cứu người dùng & UX";

export const MARKET_BUYS: readonly MarketBuySpec[] = [
  { buyer: "thu", listing: GIT, at: 0.35 },
  { buyer: "thu", listing: IELTS, at: 0.6 },
  { buyer: "quocbao", listing: GIT, at: 0.5 },
  { buyer: "giahuy", listing: GIT, at: 0.7 },
  { buyer: "khanhlinh", listing: REACT, at: 0.3 },
  { buyer: "hoanglong", listing: REACT, at: 0.55 },
  { buyer: "ducanh", listing: REACT, at: 0.8 },
  { buyer: "hoanglong", listing: NODE, at: 0.6 },
  { buyer: "duyhung", listing: NODE, at: 0.75 },
  { buyer: "khanhlinh", listing: IELTS, at: 0.45 },
  { buyer: "anhthu", listing: IELTS, at: 0.7 },
  { buyer: "yennhi", listing: IELTS, at: 0.88 },
  { buyer: "minhanh", listing: DP, at: 0.4 },
  { buyer: "tuankiet", listing: DP, at: 0.8 },
  { buyer: "minhanh", listing: MATRIX, at: 0.65 },
  { buyer: "hieutrung", listing: MATRIX, at: 0.82 },
  { buyer: "myhanh", listing: MATRIX, at: 0.92 },
  { buyer: "baochau", listing: UX, at: 0.7 },
];
