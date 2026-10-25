/**
 * Public API của phân hệ `wellbeing` (theo dõi sức khoẻ học tập / burnout radar, admin p7-03) cho code NGOÀI phân hệ: tab "Sức khoẻ học tập" của trang Gamification
 * (`features/gamification/pages/GamificationPage.tsx`) và cờ tính năng của nó. Không có module registry riêng (tránh menu phình) và CỐ Ý không có route/trang theo người dùng —
 * admin chỉ thấy số liệu ẩn danh tổng hợp và cấu hình luật.
 */
export { default as WellbeingTab } from './pages/WellbeingTab';
export { WELLBEING_FEATURE_FLAG } from './constants/wellbeing.constants';
