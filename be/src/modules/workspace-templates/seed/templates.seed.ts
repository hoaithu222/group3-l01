import type { SeedTemplate } from "../workspace-templates.repo";
import type { TemplateChannelDef } from "../workspace-templates.validators";

const ch = (
  key: string,
  name: string,
  description: string,
  extra: Partial<Omit<TemplateChannelDef, "key" | "name" | "description">> = {}
): TemplateChannelDef => ({
  key,
  name,
  description,
  type: "TEXT",
  visibility: "PUBLIC",
  postingPolicy: "MEMBERS",
  defaultSelected: true,
  ...extra,
});

/**
 * 3 mẫu nền tảng (README p5-04 §1). Kênh "Chung" luôn tự tạo cùng nhóm nên KHÔNG khai ở đây. Kênh `VOICE`/`POMODORO` chỉ được tạo
 * khi cờ `voice`/`pomodoro` bật — nếu tắt, lúc áp mẫu chúng bị bỏ qua (`TYPE_UNAVAILABLE`) chứ không làm hỏng cả lô.
 */
export const TEMPLATE_SEEDS: readonly SeedTemplate[] = [
  {
    code: "course",
    name: "Nhóm môn học",
    description: "Lớp học phần: thông báo của giảng viên, thảo luận, bài tập, tài liệu và ôn thi.",
    order: 1,
    channels: [
      ch("thong-bao", "Thông báo", "Thông báo từ giảng viên/trợ giảng — chỉ quản trị được đăng.", { postingPolicy: "ADMINS_ONLY" }),
      ch("thao-luan", "Thảo luận", "Trao đổi bài giảng và câu hỏi chung của lớp."),
      ch("bai-tap", "Bài tập", "Đề bài, hạn nộp và trao đổi về bài tập."),
      ch("tai-lieu", "Tài liệu", "Slide, đề cương và tài liệu tham khảo."),
      ch("on-thi", "Ôn thi", "Ôn tập giữa kỳ, cuối kỳ.", { defaultSelected: false }),
      ch("hoi-dap", "Hỏi đáp", "Đặt câu hỏi cho bạn học và trợ giảng.", { defaultSelected: false }),
    ],
  },
  {
    code: "capstone",
    name: "Đồ án",
    description: "Nhóm đồ án/dự án: tiến độ, thiết kế, phát triển, kiểm thử và họp nhóm.",
    order: 2,
    channels: [
      ch("thong-bao", "Thông báo", "Mốc quan trọng, lịch bảo vệ — chỉ quản trị được đăng.", { postingPolicy: "ADMINS_ONLY" }),
      ch("tien-do", "Tiến độ", "Cập nhật tiến độ hằng tuần."),
      ch("thiet-ke", "Thiết kế", "Yêu cầu, thiết kế hệ thống và giao diện."),
      ch("phat-trien", "Phát triển", "Trao đổi kỹ thuật, review mã."),
      ch("kiem-thu", "Kiểm thử", "Lỗi, ca kiểm thử và kết quả.", { defaultSelected: false }),
      ch("hop-nhom", "Họp nhóm", "Phòng họp thoại của nhóm.", { type: "VOICE", defaultSelected: false }),
    ],
  },
  {
    code: "self-study",
    name: "Nhóm tự học",
    description: "Nhóm học cùng nhau: mục tiêu, chia sẻ tài liệu, hỏi đáp và phòng tập trung.",
    order: 3,
    channels: [
      ch("muc-tieu", "Mục tiêu", "Đặt mục tiêu và theo dõi tiến bộ."),
      ch("chia-se", "Chia sẻ tài liệu", "Tài liệu, bài viết hay."),
      ch("hoi-dap", "Hỏi đáp", "Hỏi đáp giữa các thành viên."),
      ch("pomodoro", "Phòng tập trung", "Học cùng nhau theo phiên Pomodoro.", { type: "POMODORO", defaultSelected: false }),
    ],
  },
];
