import { Text, View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { IconTile } from '@/shared/ui/icon-tile';

import type {
  IntegrationPublicView,
  IntegrationView,
  ProviderInfo,
} from '../api/integrations.types';
import {
  PROVIDER_ART,
  PROVIDER_DESCRIPTIONS,
  STATUS_ART,
  STATUS_META,
  targetLabel,
} from '../utils/integration-labels';

export interface ProviderCardProps {
  provider: ProviderInfo;
  /** Các kết nối của nhóm với nhà cung cấp này (bản đầy đủ khi quản lý được, bản rút gọn với MEMBER). */
  connections: (IntegrationView | IntegrationPublicView)[];
  /** OWNER/ADMIN — MEMBER chỉ xem, KHÔNG có nút. */
  canManage: boolean;
  /** Đang mất mạng hoặc đang mở trình duyệt kết nối → khoá nút. */
  busy: boolean;
  onConnect: (provider: ProviderInfo) => void;
  onOpen: (integrationId: string) => void;
}

const isFull = (i: IntegrationView | IntegrationPublicView): i is IntegrationView => 'status' in i;

/** Ô icon trạng thái của một kết nối; bản rút gọn của MEMBER (không có trạng thái) ⇒ mắt xích trung tính. */
function connectionArt(c: IntegrationView | IntegrationPublicView) {
  return isFull(c) ? STATUS_ART[c.status] : ({ icon: 'link', tone: 'neutral' } as const);
}

/**
 * Thẻ một nhà cung cấp (app.md §3 "Marketplace"): ô icon nhà cung cấp (khe `media` của `Card`, đứng trước tiêu đề), mô tả, các
 * kết nối (ô icon + trạng thái bằng CHỮ + kênh nhận), nút Kết nối/Quản lý CHỈ cho OWNER/ADMIN. Ô icon là trang trí: trạng thái
 * vẫn nói bằng chữ ("Lỗi · #chung"), màu không phải dấu hiệu duy nhất.
 */
export function ProviderCard({
  provider,
  connections,
  canManage,
  busy,
  onConnect,
  onOpen,
}: ProviderCardProps) {
  const canConnect = canManage && provider.available;
  const art = PROVIDER_ART[provider.provider];
  return (
    <Card media={<IconTile name={art.icon} tone={art.tone} />} title={provider.label}>
      <View className="gap-xs">
        <Text className="text-body-md text-fg-2">{PROVIDER_DESCRIPTIONS[provider.provider]}</Text>
        {connections.map((c) => (
          <View key={c.id} className="flex-row items-center gap-sm">
            <IconTile name={connectionArt(c).icon} size="sm" tone={connectionArt(c).tone} />
            <View className="flex-1 gap-3xs">
              <Text className="text-label-md text-fg-1">{c.externalName}</Text>
              <Text className="text-caption-sm text-fg-2">
                {isFull(c) ? `${STATUS_META[c.status].label} · ` : ''}
                {targetLabel(c.target)}
              </Text>
            </View>
            {canManage ? (
              <Button label="Quản lý" size="sm" variant="secondary" onPress={() => onOpen(c.id)} />
            ) : null}
          </View>
        ))}
        {canConnect ? (
          <View className="flex-row">
            <Button
              disabled={busy}
              label={connections.length > 0 ? 'Kết nối thêm' : 'Kết nối'}
              size="sm"
              onPress={() => onConnect(provider)}
            />
          </View>
        ) : null}
        {canManage && !provider.available ? (
          <Text className="text-caption-sm text-fg-2">
            Nhà cung cấp chưa được bật trên hệ thống.
          </Text>
        ) : null}
      </View>
    </Card>
  );
}
