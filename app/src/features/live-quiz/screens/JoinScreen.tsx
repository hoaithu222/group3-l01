import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';

import { useConnectionState } from '@/core/socket';
import { Alert } from '@/shared/ui/alert';
import { ModuleBanner } from '@/shared/ui/banner';
import { Button } from '@/shared/ui/button';
import { AppBar, BottomActionBar } from '@/shared/ui/navigation';
import { Screen, useScreenFooterKeyboardOffset } from '@/shared/ui/screen';
import { isNetworkError } from '@/shared/utils/errors';
import { hapticTap, hapticWarning } from '@/shared/utils/haptics';

import { JoinPinCard } from '../components/JoinPinCard';
import { MotionView } from '../components/MotionView';
import { LIVE_QUIZ_ICON, LIVE_QUIZ_TONE } from '../constants/live-quiz-visuals';
import { useJoinLiveQuiz } from '../queries/live-quiz.queries';
import { cleanPin, PIN_LENGTH } from '../utils/live-quiz-links';
import { HISTORY_HREF, sessionHref } from '../utils/live-quiz-routes';
import { quizErrorMessage } from '../utils/quiz-errors';

/**
 * Nhập PIN để vào phòng (app.md p5-01 §3 `Join`). Lỗi `QUIZ_*` hiện TẠI trường PIN, không toast. `?pin=` (deep link
 * `superapp://live/{pin}`) điền sẵn mã. Hành động chính duy nhất là "Vào phòng" (thanh đáy, tông cam của chế độ); "Lịch sử thi
 * của tôi" là icon trên thanh tiêu đề. Mất kết nối ⇒ nút khoá KÈM một dòng giải thích (trước đây khoá im lặng). Các khối hiện
 * lần lượt (rise) khi mở màn — tắt khi "Giảm chuyển động".
 */
export function JoinScreen() {
  const params = useLocalSearchParams<{ pin?: string }>();
  const paramPin = cleanPin(params.pin);
  const [pin, setPin] = useState(paramPin);
  const [seenParam, setSeenParam] = useState(paramPin);
  const [nickname, setNickname] = useState('');
  const join = useJoinLiveQuiz();
  const connection = useConnectionState();
  const offline = connection === 'offline';

  // Deep link `superapp://live/{pin}` đến KHI màn đã mở (mở link thứ hai, mã khác): điền lại theo mã mới. Chỉnh state ngay
  // lúc vẽ (mẫu của React cho "state phụ thuộc prop") thay vì effect — effect vẽ hai lần và chớp mã cũ một nhịp.
  if (paramPin !== seenParam) {
    setSeenParam(paramPin);
    if (paramPin) setPin(paramPin);
  }

  function submit(): void {
    if (pin.length !== PIN_LENGTH || join.isPending) return;
    const name = nickname.trim();
    // Rung nhẹ lúc bấm (xác nhận cú chạm, trước khi chờ mạng); mã bị TỪ CHỐI (sai PIN, phòng đầy…) rung cảnh báo cùng lúc dòng lỗi
    // hiện tại ô PIN. ⛔ Lỗi mạng không rung cảnh báo: không phải người dùng nhập sai.
    hapticTap();
    join.mutate(
      { nickname: name ? name : undefined, pin },
      {
        onError: (error) => {
          if (!isNetworkError(error)) hapticWarning();
        },
        onSuccess: (result) => router.replace(sessionHref(result.sessionId)),
      },
    );
  }

  // ⚠️ `KeyboardStickyView`: ô PIN tự mở bàn phím, mà thanh đáy "Vào phòng" nằm ở khe `footer` (không tự né bàn phím) —
  // thiếu lớp bọc này nút chính bị bàn phím che kín ngay lúc mở màn (đã đo trên máy).
  // Bù chiều cao thanh tab dưới — xem `useScreenFooterKeyboardOffset`.
  const footerKeyboardOffset = useScreenFooterKeyboardOffset();
  const footer = (
    <KeyboardStickyView offset={footerKeyboardOffset}>
      <BottomActionBar>
        <Button
          disabled={pin.length !== PIN_LENGTH || offline}
          fullWidth
          iconRight="arrow-right"
          label="Vào phòng"
          loading={join.isPending}
          size="lg"
          variant="warning"
          onPress={submit}
        />
      </BottomActionBar>
    </KeyboardStickyView>
  );

  return (
    <Screen
      footer={footer}
      header={
        <AppBar
          actions={
            <Button
              accessibilityLabel="Lịch sử thi của tôi"
              iconLeft="history"
              iconOnly
              size="sm"
              variant="tertiary"
              onPress={() => router.push(HISTORY_HREF)}
            />
          }
          title="Thi đấu trực tiếp"
          onBack={router.back}
        />
      }
      keyboardAware
    >
      <View className="gap-md py-md">
        <MotionView>
          <ModuleBanner
            description="Nhập mã PIN 6 số hiển thị trên màn hình của chủ phòng."
            icon={LIVE_QUIZ_ICON}
            title="Vào phòng thi"
            tone={LIVE_QUIZ_TONE}
          />
        </MotionView>
        <MotionView index={1}>
          <JoinPinCard
            autoFocus={!params.pin}
            error={join.isError ? quizErrorMessage(join.error) : undefined}
            nickname={nickname}
            pin={pin}
            onNicknameChange={setNickname}
            onPinChange={(value) => {
              setPin(value);
              if (join.isError) join.reset();
            }}
          />
        </MotionView>
        {offline ? (
          <Alert
            description="Đang mất kết nối — chưa thể vào phòng. Kiểm tra mạng rồi thử lại."
            tone="warning"
          />
        ) : null}
      </View>
    </Screen>
  );
}
