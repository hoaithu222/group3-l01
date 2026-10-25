import { MyReviewsMeRow } from './components/review/MyReviewsMeRow';
import { registerProfileRow } from '@/shared/profile';

// p4-05: lối vào "Cần chấm" ở màn Tôi đi qua khe chung `@/shared/profile` — `features/me` không import `boards` (`feature-structure.md`). Module này chỉ có
// tác dụng phụ (đăng ký); import ở `app/(app)/me/_layout.tsx`. Đăng ký lại cùng `id` chỉ ghi đè nên an toàn với Fast Refresh.
registerProfileRow('boards.my-reviews', () => <MyReviewsMeRow />);
