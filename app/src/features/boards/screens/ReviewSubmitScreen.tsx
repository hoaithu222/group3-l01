import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';

import { useCapabilities } from '@/shell/capabilities';
import { Button } from '@/shared/ui/button';
import { AppBar, BottomActionBar } from '@/shared/ui/navigation';
import { Screen, useScreenFooterKeyboardOffset } from '@/shared/ui/screen';

import { ReviewSubmitForm } from '../components/review/ReviewSubmitForm';
import { ReviewSubmitState } from '../components/review/ReviewSubmitState';
import { ReviewTaskContext } from '../components/review/ReviewTaskContext';
import { useReviewSubmitForm } from '../hooks/useReviewSubmitForm';
import { readReviewLimits } from '../schemas/review.schemas';

/**
 * Màn chấm thẻ (p4-05 app.md §3 `ReviewSubmit`, route `tasks/[taskId]/review`, trình bày `modal` khai ở `[boardId]/_layout.tsx`).
 *
 * Điện thoại: MỘT cột — thẻ (tiêu đề + mở chi tiết) → quyết định → điểm → nhận xét, nút Gửi dính đáy. Tablet: HAI cột — trái là nội dung thẻ
 * chỉ đọc, phải là form chấm. Đường vào: nút "Chấm thẻ này" ở khối Chấm chéo của chi tiết thẻ, hoặc thông báo `review.requested|reminder`.
 *
 * Trạng thái: khung xương · `REVIEW_001`/lượt đã đóng "Lượt chấm đã đóng" (KHÔNG mất nháp còn trong bộ nhớ nếu thử lại) · 404 "Thẻ không
 * còn khả dụng" · không được giao · đã chấm rồi. Offline: nút Gửi khoá, nháp giữ nguyên.
 */
export function ReviewSubmitScreen() {
  const { boardId, taskId, wsId } = useLocalSearchParams<{ boardId: string; taskId: string; wsId: string }>();
  const { data: capabilities } = useCapabilities();
  const limits = readReviewLimits(capabilities?.limits);
  const form = useReviewSubmitForm({ boardId, onSubmitted: router.back, taskId });
  // Bù chiều cao thanh tab dưới cho `KeyboardStickyView` của `footer` — xem `useScreenFooterKeyboardOffset`. Gọi TRƯỚC
  // return sớm bên dưới để không phá thứ tự hook.
  const footerKeyboardOffset = useScreenFooterKeyboardOffset();

  const header = <AppBar title="Chấm thẻ" onBack={router.back} />;
  // `dismissTo`: lùi về chi tiết thẻ ĐÃ CÓ trong ngăn xếp (vào từ chi tiết), còn không (mở từ thông báo) thì mở mới — không chồng hai màn chi tiết.
  const openDetail = () =>
    router.dismissTo({
      params: { boardId, taskId, wsId },
      pathname: '/workspaces/[wsId]/boards/[boardId]/tasks/[taskId]',
    });

  if (form.state !== 'ready') {
    return (
      <Screen header={header} scrollable={false}>
        <ReviewSubmitState state={form.state} onBack={form.state === 'notFound' ? router.back : openDetail} onRetry={form.refetch} />
      </Screen>
    );
  }

  const footer = (
    <KeyboardStickyView offset={footerKeyboardOffset}>
      <BottomActionBar contentClassName="tablet:max-w-none">
        {/* Không khoá theo `canSubmit`: bấm khi còn thiếu là cách người dùng thấy MỌI lỗi hiện ra ở đúng ô. Chỉ khoá lúc offline. */}
        <Button
          disabled={form.offline}
          fullWidth
          label="Gửi kết quả chấm"
          loading={form.isSubmitting}
          onPress={form.onSubmit}
        />
      </BottomActionBar>
    </KeyboardStickyView>
  );

  return (
    <Screen constrained={false} footer={footer} header={header} keyboardAware>
      {/* Điện thoại một cột, từ `tablet:` hai cột (trái: thẻ chỉ đọc, phải: form). Lề 16 do `Screen padded` giữ — khối con không thêm `px-md`. */}
      <View className="gap-xl py-xs tablet:flex-row tablet:items-start">
        <View className="tablet:flex-1">
          <ReviewTaskContext boardId={boardId} taskId={taskId} onOpenDetail={openDetail} />
        </View>
        <View className="tablet:flex-1">
          <ReviewSubmitForm feedbackMax={limits.feedbackMax} form={form} />
        </View>
      </View>
    </Screen>
  );
}
