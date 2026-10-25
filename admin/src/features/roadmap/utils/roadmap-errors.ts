import type { AxiosError } from 'axios';

import { extractErrorCode } from '@/core/api/error.handler';

/** Mã lỗi BE (`be.md §8` `RMAP_*` + `RES_003` CAS chung) mà giao diện phân biệt. */
export const errorCodeOf = (err: unknown): string => extractErrorCode(err as AxiosError);

/** `RES_003` — bản ghi (môn/tháng/buổi) vừa bị sửa ở nơi khác (CAS `expectedVersion` lệch) → phải tải lại. */
export const isVersionConflict = (err: unknown): boolean => errorCodeOf(err) === 'RES_003';
