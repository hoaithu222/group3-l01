/**
 * Danh sách người dùng mẫu (36 người, tên Việt) cho `npm run db:seed:rich-demo`. Email dạng `<khoá>@seed.superapp.local`
 * (miền giả — không gửi thư thật), mật khẩu chung `SEED_PASSWORD` để đăng nhập thử bất kỳ tài khoản nào.
 * `about` chỉ để người viết nội dung giữ đúng tính cách khi viết hội thoại — KHÔNG ghi vào DB.
 */
export interface Person {
  key: string;
  name: string;
  about: string;
}

export const THU_KEY = "thu";
export const THU_EMAIL = "thu601925@gmail.com";
export const SEED_PASSWORD = "123456aA@";
export const SEED_EMAIL_DOMAIN = "seed.superapp.local";

export function emailOf(key: string): string {
  return `${key}@${SEED_EMAIL_DOMAIN}`;
}

export const PEOPLE: readonly Person[] = [
  { key: "minhanh", name: "Nguyễn Minh Anh", about: "SV năm 3 CNTT, giỏi React/TypeScript, hay giúp bạn bè, nói lịch sự gọn gàng" },
  { key: "quocbao", name: "Trần Quốc Bảo", about: "SV năm 4, backend Node.js/MongoDB, trầm tính, hay gửi link docs, viết ngắn" },
  { key: "thuytrang", name: "Lê Thùy Trang", about: "Học thiết kế UI/UX, dùng Figma, thích màu pastel, nhiều emoji" },
  { key: "ducanh", name: "Phạm Đức Anh", about: "SV năm 2, mới học front-end, hay hỏi, nhiệt tình, hay xin ví dụ" },
  { key: "hoanglong", name: "Hoàng Long", about: "SV năm 3, làm mobile React Native, hài hước, hay dùng 'haha'" },
  { key: "ngocdiep", name: "Vũ Ngọc Diệp", about: "SV năm 4, trưởng nhóm đồ án tốt nghiệp, cẩn thận, hay nhắc deadline" },
  { key: "tuankiet", name: "Đặng Tuấn Kiệt", about: "SV năm 2, mê thuật toán, giải LeetCode mỗi ngày" },
  { key: "baochau", name: "Bùi Bảo Châu", about: "SV năm 1, hay hỏi bài cơ bản, lễ phép, hay cảm ơn" },
  { key: "giahuy", name: "Ngô Gia Huy", about: "SV năm 3, DevOps/Docker, hay đùa, hay chia sẻ meme kỹ thuật" },
  { key: "khanhlinh", name: "Đỗ Khánh Linh", about: "SV năm 2, chăm ghi chép, hay tổng hợp tài liệu cho cả nhóm" },
  { key: "thanhtung", name: "Dương Thanh Tùng", about: "SV năm 3, thích CSS animation và hiệu ứng" },
  { key: "myhanh", name: "Lý Mỹ Hạnh", about: "SV năm 1, đang học toán cao cấp, hay hỏi về giới hạn/đạo hàm" },
  { key: "vietdung", name: "Phan Việt Dũng", about: "SV năm 4, đã thực tập front-end, chia sẻ kinh nghiệm đi làm" },
  { key: "phuongthao", name: "Trịnh Phương Thảo", about: "SV năm 2, làm tester/QA, soi lỗi rất kỹ" },
  { key: "haidang", name: "Mai Hải Đăng", about: "SV năm 3, giỏi cấu trúc dữ liệu & giải thuật, lập kế hoạch ôn thi" },
  { key: "anhthu", name: "Cao Anh Thư", about: "SV năm 2, đang luyện IELTS, hiện 6.5, mục tiêu 7.0" },
  { key: "trungkien", name: "Đinh Trung Kiên", about: "SV năm 3, toán giỏi, hay giải bài từng bước cho mọi người" },
  { key: "thuhien", name: "Tạ Thu Hiền", about: "SV năm 2, làm slide/tài liệu đẹp, quản lý Resource Hub" },
  { key: "nhatminh", name: "Lương Nhật Minh", about: "SV năm 1, học toán cao cấp, hay làm thử đề" },
  { key: "quynhnhu", name: "Hồ Quỳnh Như", about: "SV năm 1, luyện IELTS Writing, hay nhờ chấm bài" },
  { key: "tanphat", name: "Võ Tấn Phát", about: "SV năm 3, khá về xác suất thống kê" },
  { key: "kimngan", name: "Châu Kim Ngân", about: "SV năm 2, thủ quỹ nhóm, ghi chi tiêu rất rõ ràng, hay nhắc đóng quỹ" },
  { key: "duyhung", name: "Nguyễn Duy Hưng", about: "SV năm 4, backend, chuyển từ Java sang Node.js" },
  { key: "baotram", name: "Lâm Bảo Trâm", about: "Lớp trưởng lớp toán, tổ chức, hay tạo poll chọn giờ học" },
  { key: "hieutrung", name: "Đoàn Hiếu Trung", about: "SV năm 2, sợ toán, hài hước, hay than thở" },
  { key: "camtu", name: "Từ Cẩm Tú", about: "SV năm 3, luyện IELTS Speaking, hay rủ nhau luyện nói" },
  { key: "minhkhoi", name: "Trương Minh Khôi", about: "SV năm 3, thích đồ thị và quy hoạch động" },
  { key: "thaonguyen", name: "Nguyễn Thanh Thảo", about: "SV năm 2, học UI/UX, thích làm wireframe" },
  { key: "phuocloi", name: "Lê Phước Lợi", about: "SV năm 4, đồ án quản lý thư viện, phụ trách CSDL" },
  { key: "ngoclan", name: "Huỳnh Ngọc Lan", about: "SV năm 4, đồ án quản lý thư viện, phụ trách báo cáo và slide" },
  { key: "giabao", name: "Kiều Gia Bảo", about: "SV năm 1, mới vào, hay hỏi cách dùng app" },
  { key: "yennhi", name: "Phùng Yến Nhi", about: "SV năm 2, luyện IELTS Reading, hay chia sẻ mẹo làm bài" },
  { key: "gvhung", name: "TS. Nguyễn Văn Hùng", about: "Giảng viên Toán cao cấp, cố vấn của nhóm; nói chuẩn mực, ngắn gọn, khuyến khích" },
  { key: "mentorson", name: "Phạm Thanh Sơn", about: "Senior front-end developer 6 năm kinh nghiệm, mentor; review code kỹ, đưa lời khuyên thực tế" },
  { key: "mentorha", name: "Nguyễn Thu Hà", about: "Giảng viên IELTS (8.0), mentor; chấm bài writing, nhận xét cụ thể" },
  { key: "mentortuan", name: "Lê Anh Tuấn", about: "Tech lead mobile/backend, mentor dự án; nhắc về kiến trúc và code review" },
];

export const PERSON_BY_KEY: ReadonlyMap<string, Person> = new Map(PEOPLE.map((p) => [p.key, p]));
