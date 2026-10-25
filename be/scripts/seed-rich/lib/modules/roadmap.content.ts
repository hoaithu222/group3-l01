/**
 * Kế hoạch ghi danh lộ trình của 14 người (16 lượt ghi danh): môn `fullstack` (Lập trình Fullstack — 56 buổi) cho nhóm front-end/backend/dự án ứng dụng,
 * môn `english` (Tiếng Anh giao tiếp & IT — 25 ngày) cho nhóm IELTS. Mỗi kế hoạch chỉ mô tả NHỊP HỌC; trạng thái từng buổi được mô phỏng trong `roadmap.ts`
 * theo đúng lịch `scheduleMap` mà dịch vụ dùng. Ghi chú buổi học (note) chỉ là câu chung, không nêu nội dung bài cụ thể.
 */
export type LearnerStyle =
  /** Học đều theo lịch, thỉnh thoảng trễ một buổi. */
  | "steady"
  /** Học vượt lịch: đã xong vài buổi sắp tới. */
  | "ahead"
  /** Bắt đầu tốt rồi chậm dần — còn nợ nhiều buổi quá hạn ("trễ N buổi"). */
  | "behind"
  /** Đang tạm dừng lộ trình (status PAUSED). */
  | "paused"
  /** Hay chủ động bỏ qua buổi (SKIPPED), nhất là buổi tự chọn. */
  | "skipper"
  /** Từng trễ rồi bấm "Dời lịch": mốc lịch được đặt lại từ buổi chưa xong kế tiếp. */
  | "rescheduled"
  /** Mới ghi danh hôm qua/hôm nay. */
  | "fresh";

export interface LearnerPlan {
  key: string;
  subject: "fullstack" | "english";
  /** Ghi danh cách đây bao nhiêu ngày (kẹp theo ngày tạo tài khoản). */
  startDaysAgo: number;
  /** Thứ học ISO: 1 = Thứ 2 … 7 = Chủ nhật. */
  studyDays: number[];
  style: LearnerStyle;
  /** Chỉ với `rescheduled`: bấm "Dời lịch" cách đây bao nhiêu ngày. */
  rescheduleDaysAgo?: number;
  /** Chỉ với `paused`: tạm dừng cách đây bao nhiêu ngày. */
  pausedDaysAgo?: number;
}

export const LEARNERS: readonly LearnerPlan[] = [
  { key: "thu", subject: "fullstack", startDaysAgo: 18, studyDays: [1, 2, 3, 4, 5], style: "steady" },
  { key: "thu", subject: "english", startDaysAgo: 14, studyDays: [1, 3, 5], style: "steady" },
  { key: "ducanh", subject: "fullstack", startDaysAgo: 16, studyDays: [2, 5], style: "ahead" },
  { key: "baochau", subject: "fullstack", startDaysAgo: 15, studyDays: [1, 3, 5], style: "behind" },
  { key: "giabao", subject: "fullstack", startDaysAgo: 2, studyDays: [2, 4, 6], style: "fresh" },
  { key: "hoanglong", subject: "fullstack", startDaysAgo: 17, studyDays: [1, 2, 3, 4, 5], style: "ahead" },
  { key: "quocbao", subject: "fullstack", startDaysAgo: 17, studyDays: [1, 2, 3, 4, 5], style: "steady" },
  { key: "giahuy", subject: "fullstack", startDaysAgo: 16, studyDays: [2, 4, 6], style: "skipper" },
  { key: "khanhlinh", subject: "fullstack", startDaysAgo: 18, studyDays: [1, 2, 3, 4, 5], style: "ahead" },
  { key: "khanhlinh", subject: "english", startDaysAgo: 12, studyDays: [1, 3, 5], style: "steady" },
  { key: "phuongthao", subject: "fullstack", startDaysAgo: 15, studyDays: [2, 5], style: "paused", pausedDaysAgo: 5 },
  { key: "thanhtung", subject: "fullstack", startDaysAgo: 17, studyDays: [1, 3, 5], style: "rescheduled", rescheduleDaysAgo: 4 },
  { key: "anhthu", subject: "english", startDaysAgo: 14, studyDays: [1, 2, 3, 4, 5, 6], style: "ahead" },
  { key: "quynhnhu", subject: "english", startDaysAgo: 13, studyDays: [1, 3, 5], style: "behind" },
  { key: "camtu", subject: "english", startDaysAgo: 14, studyDays: [2, 4, 6], style: "steady" },
  { key: "yennhi", subject: "english", startDaysAgo: 11, studyDays: [1, 3, 5], style: "skipper" },
];

/** Ghi chú ngắn người học tự viết sau buổi (chung, không nêu nội dung bài). */
export const NOTES_FULLSTACK: readonly string[] = [
  "Đã làm xong bài về nhà, còn một chỗ chưa chắc nên sẽ xem lại cuối tuần.",
  "Phần này khó hơn mình nghĩ, cần làm thêm ví dụ.",
  "Hiểu ý chính rồi, mai thử áp dụng vào dự án nhóm.",
  "Làm theo video xong nhưng chưa tự làm lại được, tuần sau làm lại.",
  "Buổi này nhẹ nhàng, làm xong sớm hơn dự kiến.",
];

export const NOTES_ENGLISH: readonly string[] = [
  "Ôn lại từ vựng bằng thẻ ghi nhớ trước khi ngủ.",
  "Phần ngữ pháp hôm nay dễ nhầm, cần luyện thêm bài tập.",
  "Đã làm bộ luyện tập đi kèm, được khoảng 7/10 câu.",
  "Nghe phát âm nhiều lần rồi nhưng vẫn còn vấp, mai đọc to lại.",
];
