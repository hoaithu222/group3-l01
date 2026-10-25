import { registerBoardCardAction, registerBoardHeaderAction, registerBoardListAction } from '@/shared/board-extensions';

import { ContributionCardLink } from './components/ContributionCardLink';
import { ContributionHeaderButton } from './components/ContributionHeaderButton';
import { WorkspaceActivityLink } from './components/WorkspaceActivityLink';

/**
 * Đăng ký lối vào "Báo cáo đóng góp" (Kanban, thẻ bảng) và "Hoạt động của nhóm" (đầu danh sách bảng, p4-06) vào các khe của màn bảng (`@/shared/board-extensions`) — `boards` KHÔNG import feature này. Import module này một lần
 * (side-effect) ở nơi lắp ráp TRƯỚC khi màn Kanban / danh sách bảng vẽ lần đầu: `app/(app)/workspaces/[wsId]/boards/_layout.tsx`. Đăng ký lặp cùng `id`
 * chỉ ghi đè nên an toàn với Fast Refresh.
 */
const ID = 'contribution';

registerBoardHeaderAction(ID, (context) => <ContributionHeaderButton {...context} />);
registerBoardCardAction(ID, (context) => <ContributionCardLink {...context} />);
registerBoardListAction(ID, (context) => <WorkspaceActivityLink {...context} />);
