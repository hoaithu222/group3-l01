import { memo } from 'react';

import CapabilitiesPreview from '../components/CapabilitiesPreview';
import ConfigGroupList from '../components/ConfigGroupList';
import RecordingSupportNotice from '../components/RecordingSupportNotice';

/**
 * Tab "Giới hạn" — một `ConfigGroupCard` cho mỗi khoá registry thuộc tab
 * `limits` (admin.md p0-07 §2.2) + xem trước `/capabilities` hiện hành.
 */
const LimitsTab = memo(function LimitsTab() {
  return (
    <div className="flex flex-col gap-3">
      <RecordingSupportNotice />
      <ConfigGroupList tab="limits" tabLabel="giới hạn" />
      <CapabilitiesPreview />
    </div>
  );
});

export default LimitsTab;
