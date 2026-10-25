import type { UseFormReturn } from 'react-hook-form';

import type { MeetingFormValues } from '../../schemas/meeting-form.schema';

/** Kiểu form của lịch họp (`useZodForm` với schema Zod 4: kiểu vào = kiểu ra). Ở file riêng để các phần của form dùng chung mà không import vòng. */
export type MeetingFormApi = UseFormReturn<MeetingFormValues, unknown, MeetingFormValues>;
