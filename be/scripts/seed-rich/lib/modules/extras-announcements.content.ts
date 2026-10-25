import type { PersonKey } from "../../types";
import type { DateKit } from "./ict";

/** Thông báo cần xác nhận đã đọc: tin gốc trong kênh "Thông báo" (chỉ OWNER/ADMIN đăng) + yêu cầu xác nhận (hạn, người đã bấm "Đã đọc"). */
export interface AnnouncementSpec {
  by: PersonKey;
  daysAgo: number;
  /** Giờ (VN) đăng tin. */
  hour: number;
  /** Hạn xác nhận = lúc đăng + N ngày; `null` = không hạn. */
  deadlineDays: number | null;
  /** Tỉ lệ người nhận đã bấm "Đã đọc" (0–1). */
  ratio: number;
  /** Ép trạng thái của `thu` khi thu là người nhận (bỏ trống = theo `ratio`). */
  thuConfirmed?: boolean;
  pin?: boolean;
  text: (d: DateKit) => string;
}

export const ANNOUNCEMENTS: Record<string, readonly AnnouncementSpec[]> = {
  frontend: [
    {
      by: "thu",
      daysAgo: 9,
      hour: 20,
      deadlineDays: 4,
      ratio: 0.9,
      pin: true,
      text: () =>
        "📢 Quy định nộp Bài tập tuần\n• Nộp link repo hoặc CodePen ở kênh Bài tập tuần, trước 21h Chủ nhật.\n• Nộp muộn tối đa 1 ngày (báo trước trong nhóm); quá hạn mentor sẽ nhận xét ở tuần sau.\n• Mỗi bạn xem và bình luận ít nhất 2 bài của bạn khác.\nBấm \"Đã đọc\" để xác nhận bạn đã nắm quy định nhé.",
    },
    {
      by: "thu",
      daysAgo: 2,
      hour: 19,
      deadlineDays: 3,
      ratio: 0.55,
      text: (d) =>
        `🗓️ Đổi lịch họp tuần này\nBuổi họp review chuyển từ tối Thứ 4 sang tối ${d.nextLabel(4)} lúc 20h30, vẫn ở kênh thoại Phòng học nhóm. Mỗi người chuẩn bị demo 3 phút bài tuần 5 (Todo app bằng React). Bạn nào không dự được vui lòng báo trong kênh Chung.`,
    },
  ],
  math: [
    {
      by: "gvhung",
      daysAgo: 10,
      hour: 9,
      deadlineDays: 12,
      ratio: 0.75,
      thuConfirmed: true,
      pin: true,
      text: (d) =>
        `📌 Lịch thi cuối kỳ Toán cao cấp (theo thông báo của khoa)\n• Giải tích 1: ${d.label(13)}, 07h30, phòng A2-301\n• Đại số tuyến tính: ${d.label(16)}, 13h30, phòng A2-305\n• Xác suất thống kê: ${d.label(19)}, 07h30, phòng B1-204\nMang theo thẻ sinh viên; môn Giải tích 1 được dùng một tờ A4 chép tay công thức. Các em bấm xác nhận để thầy biết cả lớp đã nhận thông tin.`,
    },
    {
      by: "baotram",
      daysAgo: 3,
      hour: 21,
      deadlineDays: 4,
      ratio: 0.5,
      thuConfirmed: false,
      text: (d) =>
        `🔔 Dời buổi ôn chung\nBuổi ôn Đại số tuyến tính tối Thứ 5 dời sang ${d.nextLabel(5)} lúc 20h vì lớp trùng lịch thực hành. Link vào phòng ở kênh Phòng giải bài. Bạn nào chưa làm bài ma trận nghịch đảo thì làm trước nhé.`,
    },
  ],
  appdev: [
    {
      by: "quocbao",
      daysAgo: 8,
      hour: 21,
      deadlineDays: 5,
      ratio: 0.9,
      pin: true,
      text: (d) =>
        `📌 Chốt phạm vi MVP và hạn nộp bản demo\n• MVP gồm: đăng nhập, ghi khoản thu/chi, phân loại, thống kê tuần, nhắc ghi chép mỗi tối.\n• Chia tiền nhóm và quét hoá đơn để vòng sau.\n• Hạn nộp bản demo cho cố vấn: ${d.label(4)} (cuối sprint 3).\nAi thấy phạm vi chưa ổn vui lòng phản hồi ở kênh Dự án.`,
    },
    {
      by: "thu",
      daysAgo: 1,
      hour: 20,
      deadlineDays: 3,
      ratio: 0.45,
      text: (d) =>
        `🗓️ Họp review sprint 3\nTối ${d.nextLabel(5)}, 20h00, họp trực tuyến ở kênh Kênh họp.\n• Mọi PR phải merge trước 18h cùng ngày.\n• Mỗi người chuẩn bị demo phần mình trong 3 phút.\n• Task nào chưa xong, cập nhật trạng thái trên bảng Đồ án 1 trước giờ họp.`,
    },
  ],
  ielts: [
    {
      by: "mentorha",
      daysAgo: 7,
      hour: 18,
      deadlineDays: 6,
      ratio: 0.85,
      pin: true,
      text: (d) =>
        `📌 Lịch thi thử IELTS cuối tuần\n• Listening + Reading: sáng ${d.nextLabel(0)}, 08h30 – 11h30 (làm đúng giờ như thi thật).\n• Writing: nộp ở kênh Chấm Writing với cô Hà trước 21h Chủ nhật.\n• Speaking: ghi âm Part 2 gửi cô trước Thứ 2.\nBạn nào không sắp xếp được giờ báo cô trước Thứ 7 nhé.`,
    },
    {
      by: "thu",
      daysAgo: 2,
      hour: 21,
      deadlineDays: 4,
      ratio: 0.5,
      text: () =>
        "🔔 Đổi giờ luyện Speaking\nBuổi luyện nói tối Thứ 7 chuyển từ 20h30 sang 20h00 vì phòng luyện nói đã có lịch khác. Mỗi cặp chuẩn bị sẵn 2 topic Part 2. Ai chưa có cặp nhắn Cẩm Tú để ghép nhé.",
    },
  ],
  dsa: [
    {
      by: "haidang",
      daysAgo: 9,
      hour: 20,
      deadlineDays: 7,
      ratio: 0.9,
      thuConfirmed: true,
      pin: true,
      text: (d) =>
        `📌 Lịch thi cuối kỳ CTDL&GT\nThi tự luận 90 phút, ${d.label(12)} lúc 13h30, phòng B2-102. Được mang 1 tờ A4 chép tay (cheat sheet). Cả nhóm hoàn thành mock test tuần 2 trước đó. Bấm xác nhận để mình biết bạn đã nhận thông tin.`,
    },
    {
      by: "thu",
      daysAgo: 2,
      hour: 20,
      deadlineDays: 4,
      ratio: 0.45,
      text: (d) =>
        `📝 Nộp bài chạy tay Dijkstra\nMỗi bạn chạy tay thuật toán Dijkstra trên đồ thị 6 đỉnh (xem bảng trắng \"Ví dụ chạy Dijkstra từ đỉnh A\"), chụp ảnh gửi vào kênh Cây & Đồ thị trước 22h ${d.nextLabel(6)}. Minh Khôi sẽ chữa chung vào Chủ nhật.`,
    },
  ],
  backend: [
    {
      by: "quocbao",
      daysAgo: 8,
      hour: 21,
      deadlineDays: 6,
      ratio: 0.85,
      thuConfirmed: true,
      pin: true,
      text: (d) =>
        `📌 Sprint 5: demo API đặt sân\n• Demo tối ${d.nextLabel(5)}, 20h30, mỗi người 5 phút.\n• Yêu cầu: auth JWT chạy được, đặt sân chống trùng giờ, có test Supertest.\n• PR phải được review xong trước 18h hôm đó.\nAi chưa kịp báo ngay để mình xếp lại thứ tự.`,
    },
    {
      by: "mentortuan",
      daysAgo: 2,
      hour: 19,
      deadlineDays: 4,
      ratio: 0.5,
      thuConfirmed: false,
      text: () =>
        "🔔 Đổi lịch họp CLB tuần này\nBuổi họp CLB chuyển sang Thứ 5, 20h30 (thay vì Thứ 4). Nội dung: retro Sprint 5 và chọn đề tài Sprint 6. Mọi người điền ý kiến vào tài liệu \"Biên bản Retrospective Sprint 5\" trước giờ họp.",
    },
  ],
  capstone: [
    {
      by: "ngocdiep",
      daysAgo: 10,
      hour: 20,
      deadlineDays: 9,
      ratio: 0.85,
      thuConfirmed: true,
      pin: true,
      text: () =>
        "📌 Mốc thời gian đồ án\n① Thứ 6 tuần sau: gửi bản nháp báo cáo chương 1–3 cho thầy hướng dẫn\n② 2 tuần nữa: nộp quyển báo cáo đóng bìa\n③ Khoảng 3 tuần nữa: bảo vệ trước hội đồng\nMỗi người nộp phần của mình sớm hơn hạn trên 3 ngày. Bấm xác nhận để mình biết cả nhóm đã nắm lịch.",
    },
    {
      by: "ngoclan",
      daysAgo: 2,
      hour: 21,
      deadlineDays: 4,
      ratio: 0.5,
      thuConfirmed: false,
      text: (d) =>
        `🎤 Lịch tập thuyết trình thử\nTập thử lần 1 tối ${d.nextLabel(6)} lúc 20h, có bấm giờ (15 phút trình bày + 10 phút hỏi đáp). Slide gửi Thu Hiền trước 17h cùng ngày để ghép bản chung. Ai vắng báo trước cho Lan.`,
    },
  ],
  uiux: [
    {
      by: "thuytrang",
      daysAgo: 9,
      hour: 20,
      deadlineDays: 7,
      ratio: 0.9,
      thuConfirmed: true,
      pin: true,
      text: () =>
        "📌 Nộp bài tập thiết kế app\nHạn nộp: 21h Chủ nhật. Nộp link Figma (chế độ chỉ xem) vào kênh Bài tập: thiết kế app, kèm 3 ảnh chụp màn hình chính (Đăng nhập, Home, Chat nhóm). Bài thiếu link xem được sẽ không được nhận xét ở buổi critique.",
    },
    {
      by: "thaonguyen",
      daysAgo: 2,
      hour: 19,
      deadlineDays: 4,
      ratio: 0.5,
      thuConfirmed: false,
      text: (d) =>
        `🗓️ Đổi giờ buổi critique tuần này\nBuổi critique chuyển sang tối ${d.nextLabel(4)} lúc 20h30 ở Phòng critique. Mỗi bạn có 5 phút trình bày màn hình Home và 5 phút nhận góp ý. Ai muốn đổi thứ tự trình bày nhắn Thanh Thảo.`,
    },
  ],
};
