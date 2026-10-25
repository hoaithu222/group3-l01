import { memo } from 'react';

import { useFeature } from '@/app/capabilities';
import { MODULE_BY_ID } from '@/app/router/modules/module-registry';
import { CompactKpiCard } from '@/shared/ui';

import type { AdminOverview } from '@/core/api/admin';

import { NO_DATA } from '../constants/dashboard.constants';

export interface OverviewKpiStripProps {
  data: AdminOverview | undefined;
  loading: boolean;
}

/**
 * KPI của trang tổng quan (`docs/plan/admin-plan.md §3.1`) — ẩn khối của
 * phân hệ có cờ tắt, KHÔNG hiện ô rỗng/khoá thay chỗ.
 *
 * `activeWorkspaces`/`openReports` thuộc phân hệ `workspace`/`moderation`,
 * cả hai đi chung cờ BE `communication`. `failedAiJobs24h` ẩn khi: (1) cờ
 * `ai` tắt, HOẶC (2) module `ai-job` bị khoá cứng ở registry (⏸ D-13) — kiểm
 * cả hai vì cờ vận hành và cờ build là hai lớp độc lập.
 *
 * Nhóm KPI gọi & họp (p2-07, `OverviewMediaKpis`) KHÔNG nằm ở dải này nữa: nó là cột phải của
 * `DashboardHero`, cạnh biểu đồ — hai hàng KPI chồng nhau với số cột khác nhau (6 ↔ 5) làm lệch lưới.
 *
 * ⛔ MỘT HÀNG ở `xl` (`grid-flow-col auto-cols-fr`): số thẻ đổi theo cờ phân hệ (4–6), lưới cột cố
 *    định sẽ để hở ô cuối. Chảy theo cột thì N thẻ luôn chia đều đúng N phần. Thẻ `layout="stack"`
 *    (nhãn trên, số dưới) để nhãn dài ("Người dùng mới (7 ngày)") không bị cắt cụt.
 *
 * "Kết nối realtime" + "Người dùng trực tuyến" (p0-03) LUÔN hiện — hạ tầng
 * realtime là nền tảng Phase 0, không đi kèm cờ phân hệ nào. `data.realtime`
 * cập nhật qua Socket.IO `ops:stats` (`useOpsStatsSocket`, gắn trong `useOverview()`);
 * chỉ poll lại REST khi chưa vào được phòng `admin:ops` — xem `overview.queries.ts`.
 * CHỈ hiển thị SỐ ĐẾM — KHÔNG danh sách/tên người dùng trực tuyến (quyền
 * riêng tư, `admin.md` §2 nhấn mạnh điều này).
 */
const OverviewKpiStrip = memo(function OverviewKpiStrip({ data, loading }: OverviewKpiStripProps) {
  const communicationEnabled = useFeature('communication');
  const aiFlagEnabled = useFeature('ai');

  const showWorkspaceReports = communicationEnabled !== false;
  const aiJobModuleEnabled = MODULE_BY_ID['ai-job']?.enabled !== false;
  const showAiJobs = aiJobModuleEnabled && aiFlagEnabled !== false;

  return (
    <div className="grid shrink-0 grid-cols-2 gap-2 md:grid-cols-3 xl:grid-flow-col xl:grid-cols-none xl:auto-cols-fr">
      <CompactKpiCard
        animate={!loading}
        color="blue"
        icon="user-bold"
        label="Người dùng mới (7 ngày)"
        layout="stack"
        value={data ? data.newUsers7d : NO_DATA}
      />
      {showWorkspaceReports && (
        <CompactKpiCard
          animate={!loading}
          color="green"
          icon="users-bold"
          label="Workspace hoạt động"
          layout="stack"
          value={data ? data.activeWorkspaces : NO_DATA}
        />
      )}
      {showWorkspaceReports && (
        <CompactKpiCard
          animate={!loading}
          color="yellow"
          icon="shield-check-bold"
          label="Báo cáo chờ xử lý"
          layout="stack"
          value={data ? data.openReports : NO_DATA}
        />
      )}
      {showAiJobs && (
        <CompactKpiCard
          animate={!loading}
          color="red"
          icon="triangle-exclamation-bold"
          label="Job AI lỗi (24 giờ)"
          layout="stack"
          value={data ? data.failedAiJobs24h : NO_DATA}
        />
      )}
      <CompactKpiCard
        animate={!loading}
        color="green"
        icon="user-check-bold"
        label="Người dùng trực tuyến"
        layout="stack"
        value={data ? data.realtime.onlineUsers : NO_DATA}
      />
      <CompactKpiCard
        animate={!loading}
        color="gray"
        icon="bolt-bold"
        label="Kết nối realtime"
        layout="stack"
        value={data ? data.realtime.socketConnections : NO_DATA}
      />
    </div>
  );
});

export default OverviewKpiStrip;
