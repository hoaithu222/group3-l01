import { memo, useCallback } from 'react';

import { useQueryParams } from '@/shared/hooks';
import { Callout, SegmentToggle } from '@/shared/ui';

import BurnoutRulesPanel from '../components/BurnoutRulesPanel';
import WellbeingOverview from '../components/WellbeingOverview';
import {
  CLEAR_SECTION_PARAMS,
  DEFAULT_WELLBEING_SECTION,
  WELLBEING_SECTION_PARAM,
  WELLBEING_SECTIONS,
} from '../constants/wellbeing.constants';

/**
 * Tab "Sức khoẻ học tập" của trang Gamification (admin.md p7-03 §1–§2): tổng quan ẨN DANH + bộ luật đánh giá. Nhóm đang xem sống trên URL (`?tab=wellbeing&section=`; sai/thiếu → Tổng quan).
 * Cờ `burnout` do trang cha kiểm (tab ẩn khi cờ tắt); quyền xem `gamification:view` do registry chặn, quyền SỬA luật (`gamification:update`) kiểm ở nhóm Bộ luật.
 *
 * RIÊNG TƯ: admin KHÔNG BAO GIỜ thấy dữ liệu sức khoẻ của một người — tab này chỉ có số đếm tổng hợp đã ẩn danh và cấu hình luật; không có ô tìm kiếm, danh sách hay trang chi tiết theo người dùng.
 */
const WellbeingTab = memo(function WellbeingTab() {
  const { getParam, updateParams } = useQueryParams();
  const requested = getParam(WELLBEING_SECTION_PARAM);
  const section =
    WELLBEING_SECTIONS.find((s) => s.key === requested)?.key ?? DEFAULT_WELLBEING_SECTION;

  const handleSection = useCallback(
    (next: string) =>
      updateParams({
        ...CLEAR_SECTION_PARAMS,
        [WELLBEING_SECTION_PARAM]: next === DEFAULT_WELLBEING_SECTION ? null : next,
      }),
    [updateParams],
  );

  return (
    <div className="flex flex-col gap-3">
      <Callout
        description="Chỉ số tổng hợp ẨN DANH, tính từ những người tự bật theo dõi. Quản trị viên không xem được dữ liệu của từng người và không thể tra cứu ai đang ở mức nào."
        intent="info"
        variant="ghost"
      />
      <div>
        <SegmentToggle
          aria-label="Nhóm chức năng sức khoẻ học tập"
          options={[...WELLBEING_SECTIONS]}
          size="sm"
          value={section}
          variant="subtle"
          onValueChange={handleSection}
        />
      </div>
      {section === 'overview' && <WellbeingOverview />}
      {section === 'rules' && <BurnoutRulesPanel />}
    </div>
  );
});

export default WellbeingTab;
