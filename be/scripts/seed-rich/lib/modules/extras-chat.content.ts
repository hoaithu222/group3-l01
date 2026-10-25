import type { DateKit } from "./ict";

export const TIMEZONE = "Asia/Ho_Chi_Minh";

/** Tin hẹn giờ của `thu` gửi vào kênh chung của nhóm (thu là chủ/quản trị nhóm): nhắc việc đúng ngày, khớp thông báo đã đăng. */
export interface ScheduledSpec {
  ws: string;
  /** Số ngày kể từ hôm nay (giờ VN) tới ngày gửi. */
  days: (d: DateKit) => number;
  hour: number;
  minute: number;
  text: (d: DateKit) => string;
}

export const SCHEDULED: readonly ScheduledSpec[] = [
  {
    ws: "appdev",
    days: (d) => d.next(5),
    hour: 17,
    minute: 30,
    text: () => "⏰ Nhắc cả nhà: 20h tối nay họp review sprint 3 ở kênh Kênh họp nhé! Ai còn PR chưa merge thì xong trước 18h, và cập nhật trạng thái task trên bảng Đồ án 1 giúp mình 🙏",
  },
  {
    ws: "ielts",
    days: (d) => d.next(6),
    hour: 19,
    minute: 15,
    text: () => "⏰ Nhắc nhẹ: 20h tối nay luyện Speaking theo cặp ở Phòng luyện nói nhé cả nhà! Mỗi cặp chuẩn bị sẵn 2 topic Part 2 💪",
  },
  {
    ws: "frontend",
    days: (d) => d.next(0),
    hour: 8,
    minute: 0,
    text: () => "⏰ Nhắc nộp Bài tập tuần: hạn là 21h tối nay. Nộp link repo hoặc CodePen ở kênh Bài tập tuần giúp mình nhé, trễ quá 1 ngày thì mentor sẽ nhận xét ở tuần sau!",
  },
  {
    ws: "math",
    days: () => 12,
    hour: 20,
    minute: 0,
    text: () => "🌙 Mai thi Giải tích 1 lúc 07h30, phòng A2-301. Mang thẻ sinh viên và 1 tờ A4 công thức chép tay nhé cả nhà, tối nay ngủ sớm cho tỉnh táo!",
  },
];
