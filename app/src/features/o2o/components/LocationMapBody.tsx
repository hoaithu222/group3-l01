import { useState } from 'react';
import { View } from 'react-native';

import { useBreakpoint } from '@/shared/theme';
import { Alert } from '@/shared/ui/alert';
import { Tabs } from '@/shared/ui/tab';

import type { NearLocation } from '../api/o2o.types';
import type { useLocationMap } from '../hooks/useLocationMap';
import type { MapSupport } from '../hooks/useMapSupport';
import { InteractiveMap } from './map/InteractiveMap';
import { LocationListPanel } from './LocationListPanel';
import { LocationRow } from './LocationRow';

export interface LocationMapBodyProps {
  map: ReturnType<typeof useLocationMap>;
  support: MapSupport;
  filtered: boolean;
  onClearFilters: () => void;
  onOpen: (item: NearLocation) => void;
}

const SUPPORT_NOTICE: Record<Exclude<MapSupport, 'ready'>, string> = {
  'no-token': 'Bản đồ chưa được cấu hình nên đang hiện dạng danh sách.',
  unsupported:
    'Bản cài đặt này chưa hỗ trợ bản đồ nên đang hiện dạng danh sách. Hãy cập nhật ứng dụng để xem bản đồ.',
};

const VIEW_TABS = [
  { key: 'map', label: 'Bản đồ', icon: 'navigation-map' as const },
  { key: 'list', label: 'Danh sách', icon: 'document-2' as const },
];

/**
 * Thân màn "Địa điểm": bản đồ + danh sách.
 *  · Điện thoại — MỘT trong hai (tab Bản đồ | Danh sách): bản đồ tràn bề ngang, ghim đang chọn hiện thẻ tóm tắt ngay dưới; danh sách cuộn riêng.
 *    Tab "Danh sách" cũng là lối cho người dùng trình đọc màn hình (bản đồ không đọc được) — app.md §7 "Xem dạng danh sách".
 *  · Máy tính bảng — bản đồ TRÁI, danh sách PHẢI cùng lúc (app.md §7).
 *  · Không có bản đồ (`support !== 'ready'`) — chỉ danh sách + một dòng nói rõ vì sao. Màn KHÔNG sập, không có nền trắng vô nghĩa.
 */
export function LocationMapBody({
  map,
  support,
  filtered,
  onClearFilters,
  onOpen,
}: LocationMapBodyProps) {
  const { isTablet } = useBreakpoint();
  const [view, setView] = useState<'map' | 'list'>('map');
  const [mapProblem, setMapProblem] = useState(false);
  const selected = map.selected;

  const list = (
    <LocationListPanel
      canExpand={map.canExpand}
      filtered={filtered}
      items={map.items}
      query={map.query}
      radiusM={map.radiusM}
      selectedId={map.selected?.id ?? null}
      onClearFilters={onClearFilters}
      onExpand={map.expandRadius}
      onOpen={onOpen}
    />
  );

  if (support !== 'ready') {
    return (
      <View className="flex-1 gap-xs">
        <View className="px-md">
          <Alert description={SUPPORT_NOTICE[support]} tone="info" />
        </View>
        {list}
      </View>
    );
  }

  const mapView = (
    <View className="flex-1 gap-xs px-md">
      {mapProblem ? (
        <Alert
          description="Bản đồ chưa tải được nền. Danh sách địa điểm vẫn dùng bình thường."
          tone="warning"
        />
      ) : null}
      <InteractiveMap
        camera={map.camera}
        pins={map.items.map((item) => ({
          id: item.id,
          name: item.name,
          type: item.type,
          coordinate: { lat: item.lat, lng: item.lng },
        }))}
        selectedId={map.selected?.id ?? null}
        userCoords={map.userCoords}
        onIdle={map.onIdle}
        onLoadError={() => setMapProblem(true)}
        onPinPress={(id) => map.select(map.items.find((item) => item.id === id) ?? null)}
      />
      {selected ? <LocationRow item={selected} selected onPress={() => onOpen(selected)} /> : null}
    </View>
  );

  if (isTablet) {
    return (
      <View className="flex-1 flex-row gap-sm">
        <View className="flex-1">{mapView}</View>
        <View className="flex-1">{list}</View>
      </View>
    );
  }

  return (
    <View className="flex-1 gap-xs">
      <View className="px-md">
        <Tabs
          items={VIEW_TABS}
          value={view}
          variant="pill"
          onChange={(key) => setView(key as 'map' | 'list')}
        />
      </View>
      {view === 'map' ? mapView : list}
    </View>
  );
}
