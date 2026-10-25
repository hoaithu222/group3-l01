import type { Line, PersonKey } from "../../types";

/**
 * Nhóm chat "Cố vấn · <tiêu đề bài>" — do job `mentor.accepted-effects` tạo sau khi nhận cố vấn: chủ nhóm chat = người chấp nhận,
 * thành viên = người đăng bài + `include` (các thành viên nhóm được thêm), cố vấn vào với tư cách khách. Chỉ gồm tin chat thường;
 * tin hệ thống (tạo nhóm, thêm người, cố vấn vào/rời) do mã seed tự thêm. Không dùng `{@khoá}` để khỏi phát sinh đếm nhắc tên.
 */
export interface ChatSpec {
  /** Những thành viên (không phải khách) được thêm ngoài người đăng bài — phải là thành viên ACTIVE của nhóm làm việc. */
  include: PersonKey[];
  lines: Line[];
  /** Số tin cuối chưa đọc của `thu` (nếu `thu` ở trong nhóm chat và nhóm chat chưa kết thúc). */
  unreadForThu?: number;
}

export const CHAT_REPORT: ChatSpec = {
  include: ["thuhien"],
  unreadForThu: 1,
  lines: [
    ["quocbao", "Chào cô Hà ạ, cảm ơn cô đã nhận làm cố vấn cho nhóm. Đây là nhóm chat riêng để tụi em gửi báo cáo và hỏi cô nhanh."],
    ["mentorha", "Chào cả nhóm. Trước hết cô cần bản báo cáo hiện tại và dàn ý slide để đọc. Cô sẽ góp ý theo thứ tự: bố cục, nội dung từng chương, rồi mới tới câu chữ."],
    ["thu", "Dạ em đã gửi bản nháp báo cáo 24 trang trong kênh Báo cáo & Slide. Chương 3 (Phương pháp) tụi em thấy còn rối nhất ạ."],
    ["thuhien", "Em phụ trách slide. Hiện có 18 slide, phần demo hơi dài, cô góp ý giúp tụi em nên cắt phần nào ạ?"],
    ["mentorha", "Cô đã đọc xong chương 1–3. Chương 3 đang kể công cụ trước, vấn đề sau; các em đảo lại: vấn đề của sinh viên → yêu cầu → giải pháp. Phần abstract cô đã sửa vài câu, các em xem lại trong tệp chia sẻ nhé."],
    ["thu", "Dạ tối nay tụi em sửa lại thứ tự chương 3 ngay. Cảm ơn cô nhiều ạ!"],
    ["mentorha", "Slide demo nên giới hạn 3 phút và chỉ giữ ba luồng chính: ghi khoản chi, xem thống kê tuần, đặt hạn mức. Thứ năm tuần sau cả nhóm tập thuyết trình thử, cô sẽ nghe và bấm giờ."],
  ],
};

export const CHAT_SPEAKING: ChatSpec = {
  include: ["thu", "anhthu", "quynhnhu"],
  unreadForThu: 1,
  lines: [
    ["camtu", "Chào anh Dũng, cảm ơn anh đã nhận làm cố vấn Speaking cho nhóm. Tối thứ 3 và thứ 5 tụi em họp ở phòng Luyện nói lúc 20h, anh vào được không ạ?"],
    ["vietdung", "Được em, anh sẽ vào từ 20h. Buổi đầu mỗi bạn nói một câu Part 2 trong 2 phút, anh ghi lại lỗi phát âm và chỗ hết ý, cuối buổi gửi lại cho nhóm."],
    ["anhthu", "Em chưa tự tin phần mở rộng ý ở Part 3 anh ơi, hay trả lời cụt kiểu Yes/No rồi im ạ."],
    ["vietdung", "Em thử khung PEEL: Point – Explain – Example – Link back. Mỗi câu Part 3 chỉ cần 3–4 câu nối nhau là đã đủ 20–30 giây. Tối nay anh đưa 3 câu hỏi để em tập thử."],
    ["thu", "Mình sẽ gửi lịch cố định vào kênh Speaking Practice để mọi người nhớ nhé. Cảm ơn anh Dũng!"],
    ["quynhnhu", "Em xin lỗi anh, em đọc ghi chú rồi mà âm /θ/ và /ð/ em vẫn đọc thành /t/, /d/ ạ 😅"],
    ["vietdung", "Không sao, đặt đầu lưỡi giữa hai hàm răng rồi thổi nhẹ. Mỗi ngày đọc 5 phút các cặp think – sink, this – dis, tuần sau mình nghe lại nhé."],
  ],
};

export const CHAT_DESIGN_SYSTEM: ChatSpec = {
  include: ["thuytrang", "thuhien", "thu"],
  lines: [
    ["thaonguyen", "Em chào anh Sơn, cảm ơn anh đã nhận hỗ trợ nhóm. File Figma của tụi em ở kênh Figma, anh xem giúp em phần màu và typography trước ạ."],
    ["mentorson", "Chào cả nhóm. Mình đã xem qua file: đang có 14 mã màu gần giống nhau, chỉ nên giữ khoảng 6 (primary, neutral 3 bậc, success, danger). Typography nên giới hạn 5 cỡ chữ theo thang 12-14-16-20-28."],
    ["thuytrang", "Dạ em gom lại ngay anh ơi. Em hay chọn màu theo cảm giác nên bị lệch 😅 Anh nhắc cách đặt tên token giúp em với ạ."],
    ["mentorson", "Đặt theo vai trò, không đặt theo màu: color/primary, color/surface, color/text-muted. Khi đổi theme chỉ sửa một chỗ. Tối nay mình gửi ví dụ bảng token."],
    ["thuhien", "Bên em làm slide nên em hỏi thêm: component nào cần có đủ trạng thái hover, focus, disabled để bàn giao ạ?"],
    ["mentorson", "Nút, ô nhập, thẻ, tab. Mỗi component nên có variant Default / Hover / Focus / Disabled / Error và một dòng ghi chú khoảng cách. Dev nhận file là dựng được luôn, không phải hỏi lại."],
    ["thu", "Tụi em sẽ gom lại trong tuần này rồi nhờ anh duyệt ở buổi review thứ sáu ạ. Cảm ơn anh Sơn!"],
  ],
};

export const CHAT_DATABASE: ChatSpec = {
  include: ["ngocdiep", "duyhung"],
  lines: [
    ["phuocloi", "Chào anh Bảo, tụi em gửi anh sơ đồ ERD và schema Prisma trong kênh Thiết kế CSDL. Phiếu mượn đang nhúng danh sách bản sao, em lo khi cập nhật trả sách."],
    ["quocbao", "Chào cả nhóm. Mình xem rồi. Phiếu mượn nên tách riêng, tham chiếu bản sao qua copyId; chỉ nhúng những gì không đổi như tên sách tại thời điểm mượn."],
    ["ngocdiep", "Vậy khi hai thủ thư cùng cho mượn một bản sao thì xử lý thế nào anh? Tuần trước tụi em từng bị trùng."],
    ["quocbao", "Dùng cập nhật có điều kiện: updateMany({ id, status: 'AVAILABLE' }) rồi kiểm count === 1; ghi nhiều bảng thì bọc trong transaction. Nhớ thêm unique index cho phiếu đang mượn của mỗi bản sao."],
    ["duyhung", "Em chạy explain() cho truy vấn tìm sách theo tên thì thấy quét toàn bộ collection. Em thêm index văn bản được không anh?"],
    ["quocbao", "Với tiếng Việt có dấu nên lưu thêm trường normalizedTitle không dấu rồi đánh index thường — đơn giản và dễ test hơn. Em gửi lại kết quả explain sau khi thêm index nhé."],
  ],
};

/** Đợt kết thúc sớm do cố vấn bận (LEFT_BY_MENTOR). */
export const CHAT_PERFORMANCE: ChatSpec = {
  include: ["ducanh", "tuankiet"],
  lines: [
    ["minhanh", "Chào anh Hưng, đây là nhóm chat riêng để mình tối ưu trang portfolio. Điểm Performance hiện tại là 55, LCP khoảng 4,8 giây."],
    ["duyhung", "Chào cả nhóm. Mình chạy Lighthouse thấy hai thủ phạm chính: ảnh bìa 2,4 MB và một bundle JS 600 KB tải ngay lần đầu. Làm theo thứ tự: nén ảnh sang WebP, lazy-load ảnh dưới màn hình đầu, rồi mới tách bundle."],
    ["ducanh", "Em đã đổi ảnh bìa sang WebP còn 180 KB, chạy lại thì LCP giảm còn 3,1 giây ạ!"],
    ["duyhung", "Tốt đấy. Tiếp theo tách route bằng React.lazy và thêm font-display: swap. Chạy Lighthouse ở chế độ ẩn danh và ghi điểm vào bảng để so sánh."],
    ["tuankiet", "Sau khi tách route điểm lên 84, LCP 2,2 giây. Còn CLS 0,18 do ảnh chưa đặt width/height."],
    ["duyhung", "Đặt width/height cho ảnh là hết CLS. Mình báo trước: từ tuần sau mình bận ôn thi nên xin rút khỏi vai trò cố vấn. Các bạn làm tiếp theo checklist mình ghim trong kênh React nhé, chúc nhóm đạt trên 90!"],
  ],
};

/** Đợt hết hạn tự nhiên (EXPIRED). */
export const CHAT_LIBRARY_UI: ChatSpec = {
  include: ["ngocdiep", "phuongthao"],
  lines: [
    ["ngoclan", "Chào anh Minh Anh. Đây là nhóm chat riêng cho giao diện độc giả và thủ thư. Em đã đẩy PR đầu vào nhánh ui/reader ạ."],
    ["minhanh", "Chào cả nhóm. Mình xem rồi: form tìm sách chưa có nhãn cho ô nhập và nút tìm chỉ nhận chuột. Thêm label, aria-live cho kết quả và bắt phím Enter."],
    ["phuongthao", "Em test bằng bàn phím thì Tab bị nhảy ra ngoài modal mượn sách, focus không được giữ lại trong modal ạ."],
    ["minhanh", "Đúng rồi, modal cần focus trap và trả focus về nút gọi modal khi đóng. Mình viết sẵn hook useFocusTrap, các bạn dùng thử."],
    ["ngocdiep", "Em gộp hook vào rồi anh ơi, phuongthao test lại pass. Danh sách phiếu mượn hơn 200 dòng cuộn hơi giật anh ạ."],
    ["minhanh", "Dùng phân trang phía server trước, nếu vẫn cần cuộn vô hạn thì mới tới ảo hóa danh sách. Hai tuần cố vấn của mình sắp hết, mình để lại checklist review trong kênh Giao diện. Chúc nhóm bảo vệ tốt!"],
  ],
};
