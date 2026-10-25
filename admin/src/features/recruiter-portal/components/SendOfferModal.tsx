import type { AxiosError } from 'axios';
import { memo, useState } from 'react';

import { extractErrorMessage } from '@/core/api/error.handler';
import { EMPLOYMENT_TYPE_LABEL } from '@/features/recruiter';
import type { EmploymentType } from '@/features/recruiter';
import {
  Callout,
  FileField,
  FormModal,
  SelectField,
  TextareaField,
  TextField,
  useZodForm,
} from '@/shared/ui';
import { showToast } from '@/shared/utils/toast.utils';

import { OFFER_LIMITS, PORTAL_ERROR } from '../constants/portal.constants';
import { useCompanyAssetUpload } from '../hooks/useCompanyAssetUpload';
import { useIdempotencyKey } from '../hooks/useIdempotencyKey';
import { sendOfferFormSchema, type SendOfferFormValues } from '../schemas/offer.schema';
import { useCompanyUsage } from '../service/company.queries';
import { useSendOffer } from '../service/offer.queries';
import type { QuotaExceededDetails } from '../types/offer.types';
import { toSendOfferPayload } from '../utils/offer-payload';
import { errorCodeOf, errorStatusOf, quotaDetailsOf } from '../utils/portal-errors';

const TYPE_OPTIONS = (Object.keys(EMPLOYMENT_TYPE_LABEL) as EmploymentType[]).map((value) => ({
  value,
  label: EMPLOYMENT_TYPE_LABEL[value],
}));
const EMPTY: SendOfferFormValues = {
  title: '',
  employmentType: 'INTERNSHIP',
  location: '',
  message: '',
  jd: null,
};
/** Thông điệp cố ý CHUNG cho mọi lý do "không gửi được" (chưa bật Open to work / bị chặn / tài khoản không hợp lệ) — không lộ vì sao (BE cũng vậy, RECR_007). */
const MSG_CANNOT = 'Không thể gửi lời mời cho ứng viên này.';
const MSG_OPEN_EXISTS = 'Đã có lời mời đang mở với ứng viên này. Xem trong tab Lời mời.';
const MSG_NOT_APPROVED = 'Doanh nghiệp chưa được duyệt hoặc đang tạm ngưng nên chưa gửi được lời mời.';

export interface SendOfferModalProps {
  /** Nơi dùng chỉ dựng modal KHI ĐANG MỞ (`{sendTo && <SendOfferModal open … />}`) — mỗi lần mở là một lần mount mới nên form, khoá idempotency và cảnh báo hạn mức luôn sạch. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  student: { userId: string; displayName: string };
  /** Gọi khi BE báo `RECR_002` (doanh nghiệp không còn được duyệt) — trang làm mới trạng thái để banner hiện. */
  onCompanyStatusChanged: () => void;
}

/**
 * Modal "Gửi lời mời" (admin.md p6-08 §2.5): tiêu đề 3–120 · loại việc · khu vực ≤ 60 · nội dung 20–2000 (đếm ký tự) · JD PDF ≤ 5 MB (upload `/assets` scope `COMPANY`) + "Còn N/M lượt
 * trong tháng". Gửi kèm `Idempotency-Key` (`useIdempotencyKey`: giữ khi thử lại sau lỗi mạng, ĐỔI sau kết luận 4xx của BE vì BE lưu phản hồi 4xx theo khoá).
 *  - `RECR_005` (hết lượt tháng): hiện hạn mức + đề xuất nâng gói (liên hệ, thanh toán ngoài phạm vi) TRONG modal, giữ nội dung đang soạn;
 *  - `RECR_006`/`RECR_007`/`RECR_002`: thông điệp tiếng Việt rồi ĐÓNG modal (không còn gì để thử lại với ứng viên này);
 *  - lỗi khác (JD sai, mất mạng…): toast + giữ modal để sửa/gửi lại.
 */
const SendOfferModal = memo(function SendOfferModal({
  open,
  onOpenChange,
  companyId,
  student,
  onCompanyStatusChanged,
}: SendOfferModalProps) {
  const send = useSendOffer();
  const { key, rotate } = useIdempotencyKey();
  const jdUpload = useCompanyAssetUpload('FILE');
  const usage = useCompanyUsage(companyId, open);
  const [quotaError, setQuotaError] = useState<QuotaExceededDetails | null>(null);
  const form = useZodForm<SendOfferFormValues>(sendOfferFormSchema, { defaultValues: EMPTY });

  const handleConfirm = async (data?: SendOfferFormValues) => {
    if (!data) return;
    setQuotaError(null);
    try {
      await send.mutateAsync(
        toSendOfferPayload(data, { companyId, studentId: student.userId, idempotencyKey: key }),
      );
      rotate();
    } catch (err) {
      // BE lưu mọi phản hồi 4xx (trừ 429) theo khoá: đã có kết luận thì lần gửi sau (nội dung có thể đã sửa) PHẢI dùng khoá mới.
      const status = errorStatusOf(err);
      if (status !== undefined && status < 500) rotate();
      const code = errorCodeOf(err);
      if (code === PORTAL_ERROR.quotaExceeded) {
        setQuotaError(quotaDetailsOf(err) ?? { period: '', used: 0, quota: 0 });
        throw err;
      }
      if (code === PORTAL_ERROR.openOfferExists) {
        showToast('warning', MSG_OPEN_EXISTS);
        return;
      }
      if (code === PORTAL_ERROR.cannotOffer) {
        showToast('error', MSG_CANNOT);
        return;
      }
      if (code === PORTAL_ERROR.notApproved) {
        showToast('error', MSG_NOT_APPROVED);
        onCompanyStatusChanged();
        return;
      }
      showToast('error', extractErrorMessage(err as AxiosError));
      throw err;
    }
  };

  const remaining = usage.data ? `Còn ${usage.data.remaining}/${usage.data.quota} lượt gửi lời mời trong tháng này.` : null;

  return (
    <FormModal<SendOfferFormValues>
      confirmDisabled={jdUpload.uploading}
      confirmLabel="Gửi lời mời"
      form={form}
      open={open}
      size="md"
      title={`Gửi lời mời — ${student.displayName}`}
      onConfirm={handleConfirm}
      onOpenChange={onOpenChange}
    >
      {quotaError ? (
        <Callout
          description={
            quotaError.quota > 0
              ? `Doanh nghiệp đã dùng ${quotaError.used}/${quotaError.quota} lượt trong tháng ${quotaError.period}. Liên hệ đội hỗ trợ để nâng gói hoặc đợi sang tháng mới.`
              : 'Doanh nghiệp đã dùng hết lượt gửi lời mời trong tháng. Liên hệ đội hỗ trợ để nâng gói hoặc đợi sang tháng mới.'
          }
          intent="warning"
          title="Đã hết lượt gửi lời mời"
        />
      ) : null}
      <Callout
        description={`${remaining ?? ''} Ứng viên chỉ trao đổi được với bạn sau khi bấm Quan tâm. Lời mời tự hết hạn sau ${OFFER_LIMITS.expiresDays} ngày nếu chưa có phản hồi; thu hồi hay hết hạn đều không hoàn lại lượt.`.trim()}
        icon="paper-plane-top-bold"
        intent="info"
        variant="ghost"
      />
      <TextField label="Tiêu đề" maxLength={OFFER_LIMITS.titleMax} name="title" required />
      <SelectField label="Loại việc" name="employmentType" options={TYPE_OPTIONS} required />
      <TextField label="Khu vực" maxLength={OFFER_LIMITS.locationMax} name="location" />
      <TextareaField
        label="Nội dung lời mời"
        maxLength={OFFER_LIMITS.messageMax}
        name="message"
        required
        rows={6}
        showCount
      />
      <FileField
        accept="application/pdf"
        description={`Tuỳ chọn — tệp PDF tối đa ${OFFER_LIMITS.jdMaxBytes / (1024 * 1024)} MB.`}
        fileCardVariant="simple"
        label="Mô tả công việc (JD)"
        maxSize={OFFER_LIMITS.jdMaxBytes / (1024 * 1024)}
        name="jd"
        variant="button"
        onUpload={jdUpload.onUpload}
      />
    </FormModal>
  );
});

export default SendOfferModal;
