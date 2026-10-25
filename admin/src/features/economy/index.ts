/**
 * Public API của phân hệ `economy` (kinh tế xu, admin p7-02) cho code NGOÀI phân hệ: tab "Kinh tế xu" của trang Gamification
 * (`features/gamification/pages/GamificationPage.tsx`) và cờ tính năng của nó. Không có module registry riêng (tránh menu phình).
 */
export { default as EconomyTab } from './pages/EconomyTab';
export { ECONOMY_FEATURE_FLAG } from './constants/economy.constants';
