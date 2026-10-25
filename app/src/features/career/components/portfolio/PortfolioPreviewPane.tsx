import { useState } from 'react';
import { Linking, View } from 'react-native';

import { useConnectionState } from '@/core/socket';
import { Dialog } from '@/shared/ui/modal';
import { ScreenState } from '@/shared/ui/screen-state';
import { Tabs } from '@/shared/ui/tab';

import type { PortfolioAccent, PortfolioTemplate } from '../../api/portfolio.types';
import { usePreviewSource } from '../../hooks/usePreviewSource';
import { useWebViewModule } from '../../hooks/useWebViewModule';
import { previewUrlOf } from '../../utils/portfolio-url';
import { PreviewFrame, type PreviewDevice } from './PreviewFrame';

const DEVICE_TABS = [
  { key: 'phone', label: 'Điện thoại' },
  { key: 'tablet', label: 'Máy tính bảng' },
];

export interface PortfolioPreviewPaneProps {
  /** Thử mẫu + màu CHƯA lưu (`?template=&accent=`); bỏ trống = xem bản đã lưu. */
  trial?: { template: PortfolioTemplate; accent: PortfolioAccent };
  /** Đổi giá trị này ⇒ nạp lại (hồ sơ/dự án vừa được lưu). Màn "Xem trước" riêng không cần: mỗi lần mở là một lượt nạp mới. */
  revision?: string;
}

/**
 * Khung xem trước dùng chung: công tắc Điện thoại / Máy tính bảng + WebView + các trạng thái (app.md p6-07 §3 "Xem trước"). Đặt ở HAI nơi: màn "Xem trước" toàn màn (điện thoại) và cột PHẢI của
 * Tổng quan trên máy tính bảng rộng (§7 "danh sách trái, preview phải") — nên là component riêng, không nằm trong màn.
 * Trạng thái: spinner trong khung · lỗi + Thử lại (404 = chưa có hồ sơ, không có Thử lại) · offline "Cần kết nối để xem trước" · dev client chưa có module native ⇒ "chưa hỗ trợ". WebView nạp LƯỜI
 * (`load-webview-module.ts`); bấm liên kết https trong trang ⇒ hỏi rồi mở bằng `Linking`, không nạp trang lạ vào khung đang mang token.
 */
export function PortfolioPreviewPane({ revision = '', trial }: PortfolioPreviewPaneProps) {
  const [attempt, setAttempt] = useState(0);
  const [device, setDevice] = useState<PreviewDevice>('phone');
  const [failure, setFailure] = useState<{ attempt: number; status: number | undefined } | null>(
    null,
  );
  const [pendingLink, setPendingLink] = useState<string | null>(null);
  const offline = useConnectionState() === 'offline';
  const webview = useWebViewModule();
  const source = usePreviewSource(previewUrlOf(trial), attempt, revision);
  // Lỗi gắn với LƯỢT nạp đã gây ra nó: bấm "Thử lại" (attempt + 1) là lỗi cũ hết hiệu lực ngay, không cần xoá state.
  const failed = failure?.attempt === attempt ? failure : null;
  const retry = { label: 'Thử lại', onPress: () => setAttempt((value) => value + 1) };

  const body = (() => {
    if (offline) {
      return (
        <ScreenState
          action={retry}
          description="Cần kết nối mạng để xem trước trang của bạn."
          state="offline"
          title="Cần kết nối để xem trước"
        />
      );
    }
    if (webview.status === 'unavailable') {
      return (
        <ScreenState
          description="Phiên bản cài đặt này chưa hỗ trợ xem trước trong ứng dụng. Cập nhật ứng dụng rồi thử lại."
          state="forbidden"
          title="Chưa hỗ trợ xem trước"
        />
      );
    }
    if (failed?.status === 404) {
      return (
        <ScreenState
          description="Hãy nhập thông tin hồ sơ hoặc thêm dự án đầu tiên rồi xem trước."
          icon="view"
          state="empty"
          title="Chưa có hồ sơ để xem trước"
        />
      );
    }
    if (failed || source.status === 'error') {
      return (
        <ScreenState action={retry} description="Không tải được bản xem trước." state="error" />
      );
    }
    if (webview.status === 'loading' || source.status === 'loading') {
      return <ScreenState state="loading" title="Đang chuẩn bị bản xem trước" />;
    }
    return (
      <PreviewFrame
        device={device}
        module={webview.module}
        source={source.source}
        onFailed={(status) => setFailure({ attempt, status })}
        onLink={setPendingLink}
      />
    );
  })();

  return (
    <View className="flex-1 gap-sm">
      <Tabs
        items={DEVICE_TABS}
        value={device}
        variant="pill"
        onChange={(key) => setDevice(key === 'tablet' ? 'tablet' : 'phone')}
      />
      <View className="flex-1">{body}</View>

      <Dialog
        description={pendingLink ?? ''}
        primaryAction={{
          label: 'Mở',
          onPress: () => {
            const url = pendingLink;
            setPendingLink(null);
            if (url) void Linking.openURL(url);
          },
        }}
        secondaryAction={{ label: 'Huỷ', onPress: () => setPendingLink(null) }}
        title="Mở liên kết bên ngoài?"
        visible={pendingLink !== null}
        onClose={() => setPendingLink(null)}
      />
    </View>
  );
}
