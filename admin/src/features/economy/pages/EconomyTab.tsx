import { memo, useCallback } from 'react';

import { useQueryParams } from '@/shared/hooks';
import { Callout, SegmentToggle } from '@/shared/ui';

import CoinRuleTable from '../components/CoinRuleTable';
import EconomyOverview from '../components/EconomyOverview';
import MarketplaceSection from '../components/MarketplaceSection';
import QuestTable from '../components/QuestTable';
import ShopItemTable from '../components/ShopItemTable';
import WalletLookup from '../components/WalletLookup';
import {
  CLEAR_SECTION_PARAMS,
  DEFAULT_ECONOMY_SECTION,
  ECONOMY_SECTION_PARAM,
  ECONOMY_SECTIONS,
} from '../constants/economy.constants';

/**
 * Tab "Kinh tế xu" của trang Gamification (admin.md p7-02 §1–§2): tổng quan, ví người dùng, cửa hàng, quy tắc thưởng, nhiệm vụ ngày. Nhóm đang xem sống trên URL
 * (`?tab=economy&section=`; sai/thiếu → Tổng quan). Cờ `coins` do trang cha kiểm (tab ẩn khi cờ tắt); quyền xem `gamification:view` do registry chặn, quyền GHI
 * (`gamification:update`) kiểm ở từng nhóm. Xu là số ảo — tách hoàn toàn khỏi tiền thật (chi tiêu nhóm).
 */
const EconomyTab = memo(function EconomyTab() {
  const { getParam, updateParams } = useQueryParams();
  const requested = getParam(ECONOMY_SECTION_PARAM);
  const section = ECONOMY_SECTIONS.find((s) => s.key === requested)?.key ?? DEFAULT_ECONOMY_SECTION;

  const handleSection = useCallback(
    (next: string) =>
      updateParams({
        ...CLEAR_SECTION_PARAMS,
        [ECONOMY_SECTION_PARAM]: next === DEFAULT_ECONOMY_SECTION ? null : next,
      }),
    [updateParams],
  );

  return (
    <div className="flex flex-col gap-3">
      <Callout
        description="Xu là đơn vị ảo trong app — không quy đổi ra tiền thật và không liên quan chi tiêu nhóm. Mọi thay đổi đều bắt buộc lý do và được ghi nhật ký quản trị."
        intent="info"
        variant="ghost"
      />
      <div>
        <SegmentToggle
          aria-label="Nhóm chức năng kinh tế xu"
          options={[...ECONOMY_SECTIONS]}
          size="sm"
          value={section}
          variant="subtle"
          onValueChange={handleSection}
        />
      </div>
      {section === 'overview' && <EconomyOverview />}
      {section === 'wallet' && <WalletLookup />}
      {section === 'shop' && <ShopItemTable />}
      {section === 'rules' && <CoinRuleTable />}
      {section === 'quests' && <QuestTable />}
      {section === 'marketplace' && <MarketplaceSection />}
    </div>
  );
});

export default EconomyTab;
