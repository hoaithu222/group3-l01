import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useConnectionState } from '@/core/socket';
import { useBreakpoint } from '@/shared/theme';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';

import { CalendarAgendaPane } from '../components/calendar/CalendarAgendaPane';
import { CalendarFilterSheet } from '../components/calendar/CalendarFilterSheet';
import { CalendarHeaderActions } from '../components/calendar/CalendarHeaderActions';
import { MonthGrid } from '../components/calendar/MonthGrid';
import { WeekStrip } from '../components/calendar/WeekStrip';
import { isFiltered } from '../hooks/useCalendarFilters';
import { useMeetingsCalendar } from '../hooks/useMeetingsCalendar';
import { useMyWorkspacesForMeetings } from '../queries/meetings.queries';
import { shiftMonth } from '../utils/meeting-month.utils';
import { joinFromCard, openMeetingDetail, openNewMeeting } from '../utils/meeting-navigation';
import { addDays, toDayKey } from '../utils/meeting-time.utils';

/**
 * "Lịch họp" (app.md p2-04 §3). ĐIỆN THOẠI: dải tuần + agenda theo ngày (cuộn tới ngày chọn). MÁY TÍNH BẢNG (`useBreakpoint().isTablet`,
 * ≥ 600dp): hai cột — lưới THÁNG bên trái, agenda của NGÀY CHỌN bên phải. Hai bố cục dựng CÂY KHÁC nhau (không chỉ đổi số cột) nên
 * rẽ nhánh bằng hook; cửa sổ dữ liệu theo `view` (35 ngày quanh tuần / đúng các ô của tháng). Socket `meeting:*` đồng bộ ở
 * `(app)/_layout.tsx`. Nút "+" ẩn khi ngoại tuyến. Tấm lọc: phạm vi/nhóm/trạng thái, lưu theo tài khoản, nhóm chỉ tải khi mở tấm.
 */
export function MeetingsCalendarScreen() {
  const { isTablet } = useBreakpoint();
  const calendar = useMeetingsCalendar(isTablet ? 'month' : 'week');
  const { filters, meetings, range, selectedKey } = calendar;
  const [filterOpen, setFilterOpen] = useState(false);
  const workspaces = useMyWorkspacesForMeetings(filterOpen);
  const offline = useConnectionState() === 'offline';

  const workspaceId = filters.workspaceId || undefined;
  // Lưới tháng: "+" và nút ở ngày trống gắn sẵn NGÀY đang chọn — trừ ngày ĐÃ QUA (form không cho đặt lịch quá khứ, MEET_004).
  const pastDay = isTablet && selectedKey < toDayKey(new Date());
  const create = () => openNewMeeting(workspaceId, isTablet && !pastDay ? selectedKey : undefined);
  const agenda = (
    <CalendarAgendaPane
      emptyForDay={isTablet}
      groups={calendar.paneGroups}
      refreshing={meetings.isRefetching}
      scrollToDayKey={selectedKey}
      state={calendar.state}
      onCreate={offline || pastDay ? undefined : create}
      onJoin={joinFromCard}
      onPress={(item) => openMeetingDetail(item.id)}
      onRefresh={() => void meetings.refetch()}
    />
  );

  return (
    <Screen
      constrained={false}
      header={
        <AppBar
          actions={
            <CalendarHeaderActions
              filtered={isFiltered(filters)}
              offline={offline}
              onCreate={create}
              onFilter={() => setFilterOpen(true)}
            />
          }
          title="Lịch họp"
          onBack={router.canGoBack() ? router.back : undefined}
        />
      }
      padded={false}
      scrollable={false}
    >
      {isTablet ? (
        <View className="flex-1 flex-row gap-md px-md">
          <View className="flex-1">
            <MonthGrid
              counts={calendar.counts}
              selected={range.selected}
              onSelect={range.setSelected}
              onShiftMonth={(delta) => range.setSelected(shiftMonth(range.selected, delta))}
              onToday={() => range.setSelected(new Date())}
            />
          </View>
          <View className="flex-1">{agenda}</View>
        </View>
      ) : (
        <>
          <WeekStrip
            busyDays={calendar.busyDays}
            selected={range.selected}
            weekStart={range.weekStart}
            onSelect={range.setSelected}
            onShiftWeek={(delta) => range.setSelected(addDays(range.selected, delta * 7))}
          />
          <View className="flex-1">{agenda}</View>
        </>
      )}
      <CalendarFilterSheet
        filters={filters}
        visible={filterOpen}
        workspaces={workspaces.data ?? []}
        onApply={calendar.setFilters}
        onClose={() => setFilterOpen(false)}
      />
    </Screen>
  );
}
