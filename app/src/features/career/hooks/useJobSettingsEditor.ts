import { useState } from 'react';

import { useConnectionState } from '@/core/socket';
import { useZodForm } from '@/shared/form/useZodForm';

import type { JobSettings, JobSettingsPayload } from '../api/recruiter.types';
import { useUpdateJobSettings } from '../queries/offers.mutations';
import { jobProfileSchema, type JobProfileValues } from '../schemas/career-settings.schemas';

/**
 * Trạng thái sửa của màn "Tìm việc" (app.md §3–§4). Mọi lượt ghi gửi ĐỦ hồ sơ đang hiện trên màn (`PUT /me/career` không phải PATCH) — bật/tắt
 * công tắc cũng lưu luôn phần đã gõ, để cái người dùng thấy là cái được lưu. BẬT cần đã đồng ý ĐÚNG phiên bản chính sách hiện hành
 * (`consentVersion === requiredConsentVersion`) — chưa (lần đầu) hoặc chính sách đã đổi ⇒ mở `CareerConsentSheet` trước, KHÔNG gửi gì.
 * TẮT không cần đồng ý và lạc quan (xem `useUpdateJobSettings`). Đổi dữ liệu từ server (lưu xong, máy khác đổi) ⇒ màn dựng lại bằng `key`.
 */
export function useJobSettingsEditor(settings: JobSettings) {
  const mutation = useUpdateJobSettings();
  const offline = useConnectionState() === 'offline';
  const form = useZodForm<JobProfileValues, JobProfileValues>(jobProfileSchema, {
    defaultValues: { headline: settings.headline ?? '', location: settings.location ?? '' },
  });
  const [roles, setRoles] = useState<string[]>(settings.preferredRoles);
  const [consentOpen, setConsentOpen] = useState(false);
  const values = form.watch();
  const consentCurrent = settings.consentVersion === settings.requiredConsentVersion;

  const dirty =
    values.headline.trim() !== (settings.headline ?? '') ||
    values.location.trim() !== (settings.location ?? '') ||
    roles.join('\n') !== settings.preferredRoles.join('\n');

  const write = (openToWork: boolean) => {
    const current = form.getValues();
    const payload: JobSettingsPayload = {
      consentVersion: openToWork ? settings.requiredConsentVersion : undefined,
      headline: current.headline.trim() || null,
      location: current.location.trim() || null,
      openToWork,
      preferredRoles: roles,
    };
    mutation.mutate(payload);
  };

  const turnOn = () => {
    if (consentCurrent) write(true);
    else setConsentOpen(true);
  };

  const toggle = (next: boolean) => {
    if (next) turnOn();
    else write(false);
  };

  const save = form.handleSubmit(() => {
    if (settings.openToWork) turnOn();
    else write(false);
  });

  return {
    confirmConsent: () => {
      setConsentOpen(false);
      write(true);
    },
    consentOpen,
    dirty,
    draft: { headline: values.headline.trim(), location: values.location.trim(), roles },
    form,
    offline,
    roles,
    save,
    saving: mutation.isPending,
    // BẬT không lạc quan nên công tắc phải hiện "đang xử lý" — TẮT đã đổi ngay nên không cần khoá.
    savingOn: mutation.isPending && mutation.variables?.openToWork === true,
    setConsentOpen,
    setRoles,
    toggle,
  };
}
