/**
 * Hồ sơ hoạt động giả lập cho phân hệ Burnout radar (sức khoẻ học tập). Mỗi hồ sơ mô tả một "câu chuyện" 14–21 ngày: cường độ dùng ứng dụng
 * (phút hoạt động, chuỗi làm liên tục dài nhất, hoạt động khuya) đổi dần từ đầu tới cuối. Số liệu từng ngày được sinh tất định từ hồ sơ rồi
 * ĐƯỢC CHẤM bằng chính bộ luật mặc định (`evaluateRules`) — nên điểm/mức luôn suy ra được từ dữ liệu ngày. Không có nhãn y khoa, không có lời khuyên.
 */
import type { PersonKey } from "../../types";

export type Shape = "linear" | "late" | "peak";

export interface Profile {
  key: PersonKey;
  /** Số ngày dữ liệu (14–21), kết thúc ở ngày wellbeing hôm qua. */
  days: number;
  /** Cài đặt cảnh báo của người dùng. */
  alerts: boolean;
  /** Giờ làm/nghỉ mong muốn (nút nghỉ). */
  breakPlan?: { workMinutes: number; breakMinutes: number };
  /** `linear`: đổi đều; `late`: tăng nhanh về cuối; `peak`: đỉnh ở `peakAt` (0–1) rồi hạ xuống. */
  shape: Shape;
  peakAt?: number;
  /** Phút hoạt động mỗi ngày [đầu, cuối/đỉnh]. */
  active: [number, number];
  /** Chuỗi liên tục dài nhất [đầu, cuối/đỉnh]. */
  cont: [number, number];
  /** Xác suất có phiên khuya trong ngày [đầu, cuối/đỉnh] và độ dài phiên khuya (phút) [thấp, cao]. */
  lateProb: [number, number];
  late: [number, number];
  /** Hệ số cuối tuần (mặc định 0,75). */
  weekend?: number;
  /** Các ngày (đếm lùi từ hôm qua, 0 = hôm qua) có buổi làm liền rất dài. */
  longDaysAgo?: number[];
  /** Cảnh báo mới nhất vẫn chưa được bấm "Đã hiểu"/"Nhắc lại sau". */
  pendingLatest?: boolean;
  /** Chia sẻ mức với nhóm này (khoá nhóm) — phải là thành viên. */
  shareWith?: string;
}

export const PROFILES: readonly Profile[] = [
  // thu: trưởng nhóm, nhịp ổn định rồi tăng dần vì gần cuối kỳ; cảnh báo gần nhất chưa bấm.
  { key: "thu", days: 18, alerts: true, breakPlan: { workMinutes: 50, breakMinutes: 10 }, shape: "late", active: [300, 480], cont: [85, 150], lateProb: [0, 0.65], late: [30, 90], longDaysAgo: [1], pendingLatest: true, shareWith: "capstone" },
  // ngoclan: phụ trách báo cáo + slide đồ án, chạy tiến độ nên tăng ca dần tới mức cao.
  { key: "ngoclan", days: 21, alerts: true, shape: "late", active: [330, 740], cont: [110, 240], lateProb: [0.2, 0.95], late: [75, 165], weekend: 0.95 },
  // thanhtung: mải chỉnh hiệu ứng nên hay thức khuya đều đặn.
  { key: "thanhtung", days: 16, alerts: true, shape: "linear", active: [300, 340], cont: [85, 100], lateProb: [0.92, 0.96], late: [75, 135], shareWith: "frontend" },
  // hoanglong: dồn sức làm demo giữa kỳ rồi nghỉ lại, hạ về mức thấp.
  { key: "hoanglong", days: 18, alerts: true, breakPlan: { workMinutes: 45, breakMinutes: 15 }, shape: "peak", peakAt: 0.4, active: [260, 640], cont: [80, 210], lateProb: [0.1, 0.85], late: [45, 135], shareWith: "appdev" },
  // thuhien: đều đặn, nhẹ nhàng.
  { key: "thuhien", days: 14, alerts: true, shape: "linear", active: [340, 380], cont: [90, 105], lateProb: [0.03, 0.05], late: [15, 30], shareWith: "ielts" },
  // quocbao: khối lượng backend tăng dần.
  { key: "quocbao", days: 19, alerts: true, shape: "late", active: [280, 540], cont: [90, 195], lateProb: [0.1, 0.5], late: [45, 100] },
  // haidang: ôn thi dồn dập nhưng đã tắt cảnh báo.
  { key: "haidang", days: 17, alerts: false, shape: "late", active: [300, 600], cont: [100, 215], lateProb: [0.15, 0.75], late: [45, 110] },
  // thuytrang: nhẹ nhàng.
  { key: "thuytrang", days: 15, alerts: true, shape: "linear", active: [180, 210], cont: [60, 70], lateProb: [0.02, 0.03], late: [15, 30] },
  // minhanh: ổn định, cuối tuần nghỉ nhiều.
  { key: "minhanh", days: 20, alerts: true, shape: "linear", active: [360, 380], cont: [110, 125], lateProb: [0.04, 0.06], late: [15, 45], weekend: 0.55 },
  // myhanh: mới học, ít dùng.
  { key: "myhanh", days: 14, alerts: true, shape: "linear", active: [140, 175], cont: [45, 60], lateProb: [0, 0.02], late: [15, 30], shareWith: "math" },
  // quynhnhu: luyện thi IELTS dồn đầu kỳ, sau thi hạ dần.
  { key: "quynhnhu", days: 16, alerts: true, shape: "peak", peakAt: 0.25, active: [240, 620], cont: [75, 205], lateProb: [0.1, 0.8], late: [45, 120] },
  // tuankiet: giải thuật toán nhiều giờ liền nhưng ít thức khuya.
  { key: "tuankiet", days: 15, alerts: true, shape: "linear", active: [400, 430], cont: [150, 205], lateProb: [0.05, 0.1], late: [15, 45], longDaysAgo: [2, 5, 8], shareWith: "dsa" },
];
