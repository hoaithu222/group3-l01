import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { AppBar } from '@/shared/ui/navigation';
import { ProgressRing } from '@/shared/ui/progress-ring';
import { Screen } from '@/shared/ui/screen';
import { hapticSuccess } from '@/shared/utils/haptics';

import { BreathingAnimation } from '../components/BreathingAnimation';
import { useTakeBreak } from '../queries/wellbeing.mutations';

/** 1 phút (README §1 P1 "TakeABreakWidget 1 phút"). */
const DURATION_SECONDS = 60;

/**
 * Nghỉ 1 phút toàn màn (`TakeABreakWidget`, p7-03 P1; route `me/wellbeing/break` mở dạng modal — app.md §1). Vòng tròn hít thở
 * (`BreathingAnimation`) + đếm ngược 60 giây; nút Dừng (hoặc nút quay lại) kết thúc sớm.
 *
 * Hết giờ HOẶC bấm Dừng đều báo BE MỘT lần (`POST /me/wellbeing/break` — chỉ đếm qua giới hạn tần suất, không lưu bản ghi, không ảnh
 * hưởng điểm rủi ro) rồi đóng màn. Lỗi báo BE KHÔNG chặn đóng màn: đây là trải nghiệm thư giãn, không phải một lệnh bắt buộc phải thành
 * công — `useTakeBreak` không cần `await`/bắt lỗi ở đây.
 *
 * ⚠️ Chưa có: nhạc nền cục bộ (`expo-audio`, app.md §6) — file `assets/audio/breathing.m4a` chưa được cấp, cố tình KHÔNG `require()` một
 * đường dẫn không tồn tại (sẽ vỡ bundle). Vòng tròn + chữ đã đủ dùng được ngay; nhạc là việc thêm khi có asset thật.
 */
export function TakeABreakScreen() {
  // `mutate` ổn định qua các lần vẽ (khác object kết quả của `useMutation`, đổi MỖI lần vẽ) — đưa vào deps không làm effect chạy lại.
  const { mutate: reportBreak } = useTakeBreak();
  const [remaining, setRemaining] = useState(DURATION_SECONDS);
  const [stopped, setStopped] = useState(false);
  // ✅ SUY RA, không phải state riêng: hết giờ tự nhiên cũng là "đã dừng" — không cần effect `setRunning(false)` khi chạm 0.
  const running = !stopped && remaining > 0;
  /** Chốt "đã báo BE + đóng màn" — hết giờ và bấm Dừng cùng dẫn tới đây, nhưng chỉ được xảy ra MỘT lần. */
  const finishedRef = useRef(false);

  // Đếm ngược từng giây trong lúc còn chạy.
  useEffect(() => {
    if (!running) return;
    const id = setTimeout(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => clearTimeout(id);
  }, [running, remaining]);

  // "Đã dừng" (hết giờ hoặc bấm Dừng) → báo BE + đóng màn, đúng MỘT lần (chốt `finishedRef`; ref ghi trong effect, không trong lúc vẽ).
  useEffect(() => {
    if (running || finishedRef.current) return;
    finishedRef.current = true;
    // Rung "xong" chỉ khi nghỉ TRỌN phút — bấm Dừng sớm là người dùng tự chọn, không phải một việc vừa hoàn thành.
    if (remaining === 0) hapticSuccess();
    reportBreak({ durationSeconds: Math.max(1, DURATION_SECONDS - remaining) });
    router.back();
  }, [running, remaining, reportBreak]);

  const stop = (): void => setStopped(true);

  return (
    <Screen header={<AppBar title="Nghỉ một chút" onBack={stop} />} scrollable={false}>
      {/* ⛔ Không thêm `px-*`: `Screen padded` (mặc định) đã cho lề 16 — cộng thêm là lề đúp. */}
      <View className="flex-1 items-center justify-center gap-xl">
        <BreathingAnimation running={running} />
        <Text className="text-center text-body-md text-fg-2">
          Thả lỏng vai, hít thở chậm theo vòng tròn.
        </Text>
        {/* Vòng đếm ngược tô dần theo thời gian đã nghỉ — nhìn lướt là biết còn bao lâu, không phải đọc số. Nhãn trợ năng
            nói bằng chữ ("Còn 42 giây") thay cho con số trần ở tâm vòng. */}
        <ProgressRing
          label={`Còn ${String(remaining)} giây`}
          progress={(DURATION_SECONDS - remaining) / DURATION_SECONDS}
          size={88}
          strokeWidth={6}
        >
          <Text className="text-header-sm font-bold text-fg-1">{remaining}s</Text>
        </ProgressRing>
        <Button label="Dừng" variant="tertiary" onPress={stop} />
      </View>
    </Screen>
  );
}
