import type { ReactNode } from 'react';
import { View } from 'react-native';

import type { CallVideoStyle } from '@/core/media/call-media.types';
import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { AppBar, BottomActionBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { hapticTap } from '@/shared/utils/haptics';

import { CameraPreview } from './CameraPreview';
import { DeviceToggleRow } from './DeviceToggleRow';
import { MicLevelMeter } from './MicLevelMeter';
import { PreJoinSummary } from './PreJoinSummary';

export interface PreJoinViewProps {
  /** Đường ra âm thanh hiện tại để hiện ở hàng "Âm thanh ra". */
  audioRouteLabel?: string;
  camDenied: boolean;
  camOn: boolean;
  /** Tên hiển thị ban đầu (mặc định là tên tài khoản) — ô nhập UNCONTROLLED nên chỉ đọc lúc dựng. */
  defaultDisplayName: string;
  endAt: string;
  /** Lỗi mạng/máy chủ khi vào phòng (không phải mã nghiệp vụ — mã đó là `JoinBlockedView`). `null` = không lỗi. */
  error: string | null;
  facing: 'back' | 'front';
  /** Cuộc họp đang diễn ra — hiện nhãn "Đang diễn ra". */
  live: boolean;
  micDenied: boolean;
  /** Mức âm thanh mic thử, 0..100. */
  micLevel: number;
  micOn: boolean;
  previewRef: unknown;
  primaryLabel: string;
  primaryLoading: boolean;
  renderVideo: (ref: unknown, style?: CallVideoStyle) => ReactNode;
  startAt: string;
  title: string;
  onChangeName: (name: string) => void;
  onClose: () => void;
  onFlipCamera: () => void;
  /** Có handler thì hiện nút phụ "Tham gia chỉ để nghe" (vào ngay, mic + camera tắt, không xin quyền). */
  onListenOnly?: () => void;
  onOpenAudioRoute: () => void;
  /** Có handler + quyền mic/camera bị từ chối ⇒ khối nhắc "Mở Cài đặt" (đường cấp lại quyền rõ ràng, không phải đoán "chạm lại công tắc"). */
  onOpenSettings?: () => void;
  onPrimary: () => void;
  /** Có handler thì `error` có nút "Thử lại". */
  onRetry?: () => void;
  onToggleCam: () => void;
  onToggleMic: () => void;
}

/**
 * Màn pre-join (app.md p2-05 §3.2): tiêu đề + giờ họp, xem trước camera, mức micro, công tắc thiết bị (MẶC ĐỊNH TẮT), tên hiển thị, nút
 * chính theo `myActions` ("Bắt đầu cuộc họp" / "Tham gia" / "Xin vào") và nút phụ "Tham gia chỉ để nghe". Đây là MỘT MÀN ĐẦY ĐỦ (tự có
 * `Screen` + `AppBar` + thanh nút đáy) — nơi gọi đừng bọc thêm `Screen`.
 *
 * Lỗi mạng hiện bằng `Alert` + "Thử lại" ngay trên màn (không toast tự tắt: người dùng đang nhìn nút vào phòng). Component KHÔNG đọc
 * store/socket/media — mọi thứ qua props (test không cần SDK native).
 *
 * ✅ Bố cục kiểu "phòng chờ" Google Meet: KHỐI XEM TRƯỚC (khung camera + mức mic) trước, rồi KHỐI THÔNG TIN (tiêu đề + giờ, lỗi, thiết bị,
 * tên). Dọc: xếp chồng. Ngang (`landscape:`): hai cột — xem trước bên trái, thông tin bên phải — khung 16:9 tràn bề ngang ~800dp sẽ cao hơn
 * cả màn và đẩy mọi thứ khác xuống dưới nếp gập.
 */
export function PreJoinView({
  audioRouteLabel,
  camDenied,
  camOn,
  defaultDisplayName,
  endAt,
  error,
  facing,
  live,
  micDenied,
  micLevel,
  micOn,
  previewRef,
  primaryLabel,
  primaryLoading,
  renderVideo,
  startAt,
  title,
  onChangeName,
  onClose,
  onFlipCamera,
  onListenOnly,
  onOpenAudioRoute,
  onOpenSettings,
  onPrimary,
  onRetry,
  onToggleCam,
  onToggleMic,
}: PreJoinViewProps) {
  const denied = micDenied || camDenied;
  return (
    <Screen
      footer={
        <BottomActionBar>
          {/* Rung "chạm" TRƯỚC khi gọi vào phòng: bước kết nối mất vài giây, cú rung là phản hồi tức thì (chỉ phía giao diện). */}
          <Button
            fullWidth
            iconLeft="video-camera"
            label={primaryLabel}
            loading={primaryLoading}
            onPress={() => {
              hapticTap();
              onPrimary();
            }}
          />
          {onListenOnly ? (
            <Button
              disabled={primaryLoading}
              fullWidth
              iconLeft="audio"
              label="Tham gia chỉ để nghe"
              variant="secondary"
              onPress={onListenOnly}
            />
          ) : null}
        </BottomActionBar>
      }
      header={<AppBar title="Tham gia cuộc họp" onBack={onClose} />}
      keyboardAware
    >
      <View className="gap-md py-xs landscape:flex-row landscape:items-start">
        <View className="gap-sm landscape:flex-1">
          <CameraPreview
            camOn={camOn}
            displayName={defaultDisplayName}
            facing={facing}
            previewRef={previewRef}
            renderVideo={renderVideo}
            onFlipCamera={onFlipCamera}
          />
          <MicLevelMeter level={micLevel} micOn={micOn} />
        </View>
        <View className="gap-md landscape:flex-1">
          <PreJoinSummary endAt={endAt} live={live} startAt={startAt} title={title} />
          {error ? (
            <Alert
              actions={onRetry ? <Button label="Thử lại" size="xs" variant="secondary" onPress={onRetry} /> : undefined}
              description={error}
              title="Chưa vào được cuộc họp"
              tone="error"
            />
          ) : null}
          {denied && onOpenSettings ? (
            <Alert
              actions={<Button label="Mở Cài đặt" size="xs" variant="secondary" onPress={onOpenSettings} />}
              description="Cấp quyền micro/camera cho ứng dụng trong Cài đặt rồi quay lại bật. Bạn vẫn vào họp được ngay bây giờ."
              title="Chưa có quyền thiết bị"
              tone="warning"
            />
          ) : null}
          <DeviceToggleRow
            audioRouteLabel={audioRouteLabel}
            camDenied={camDenied}
            camOn={camOn}
            micDenied={micDenied}
            micOn={micOn}
            onOpenAudioRoute={onOpenAudioRoute}
            onToggleCam={onToggleCam}
            onToggleMic={onToggleMic}
          />
          <Input
            autoCapitalize="words"
            autoComplete="name"
            defaultValue={defaultDisplayName}
            hint="Tối đa 80 ký tự"
            label="Tên hiển thị"
            maxLength={80}
            placeholder="Ví dụ: Nguyễn Văn A"
            returnKeyType="done"
            textContentType="name"
            onChangeText={onChangeName}
          />
        </View>
      </View>
    </Screen>
  );
}
