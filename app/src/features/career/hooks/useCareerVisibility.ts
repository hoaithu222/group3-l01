import { useMutation, useQueryClient } from '@tanstack/react-query';

import { showToast } from '@/shared/utils/toast.utils';

import { careerService } from '../api/career.service';
import type { CareerProfile, CareerVisibility } from '../api/career.types';
import { careerKeys } from '../queries/career.keys';
import { useMyCareer } from '../queries/career.queries';
import { offerKeys } from '../queries/offers.keys';
import { careerErrorMessage } from '../utils/career-errors';

/** Mặc định của BE khi chưa có bản ghi `UserCareer` (`be/src/modules/career/entities/career.interface.ts`). */
export const DEFAULT_VISIBILITY: CareerVisibility = {
  showSkills: true,
  proofTitles: false,
  showContribution: false,
  showQuiz: false,
  appearInOthersPortfolios: false,
};

/**
 * Quyền riêng tư nghề nghiệp (app.md p6-06 §4): đổi LẠC QUAN vào cache `['me','career']`, lỗi ⇒ trả về giá trị cũ + toast (bắt buộc — nếu không
 * công tắc hiện "đã tắt" trong khi server vẫn đang chia sẻ). PUT gửi ĐỦ bộ công tắc (BE thay cả khối).
 */
export function useCareerVisibility() {
  const queryClient = useQueryClient();
  const career = useMyCareer();
  const visibility = career.data?.visibility ?? DEFAULT_VISIBILITY;

  const mutation = useMutation({
    mutationFn: (next: CareerVisibility) => careerService.updateVisibility(next),
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: careerKeys.me() });
      const previous = queryClient.getQueryData<CareerProfile>(careerKeys.me());
      if (previous) queryClient.setQueryData<CareerProfile>(careerKeys.me(), { ...previous, visibility: next });
      return { previous };
    },
    onError: (error, _next, context) => {
      if (context?.previous) queryClient.setQueryData(careerKeys.me(), context.previous);
      showToast('error', careerErrorMessage(error, 'Chưa lưu được cài đặt riêng tư, thử lại'));
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(careerKeys.me(), saved);
      // "Nhà tuyển dụng thấy gì" ở màn Tìm việc đọc bản chép `visibility` RIÊNG trong `JobSettings` — cache đó luôn còn tươi (thẻ
      // lối vào ở Career home giữ nó active), không làm mới thì bản xem trước vẫn hiện huy hiệu/đóng góp vừa tắt.
      void queryClient.invalidateQueries({ queryKey: offerKeys.jobSettings() });
    },
  });

  const update = (patch: Partial<CareerVisibility>) => mutation.mutate({ ...visibility, ...patch });

  return { isLoading: career.isLoading, isPending: mutation.isPending, update, visibility };
}
