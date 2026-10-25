import type { AxiosResponse } from 'axios';

/**
 * Bóc lớp bọc `{ data: ... }` mà backend .NET hay dùng.
 *
 * Backend nội bộ không nhất quán: có endpoint trả thẳng đối tượng, có endpoint
 * bọc trong `{ status, data }`. Nếu để mỗi service tự đoán thì sẽ có chỗ viết
 * `res.data.data`, chỗ viết `res.data`, và một lần backend đổi kiểu bọc là hỏng
 * rải rác khắp nơi.
 *
 * Hàm này nhận cả hai dạng: có `data` bên trong thì bóc, không thì trả nguyên.
 *
 * ⚠️ Có một ca nhập nhằng KHÔNG tự giải quyết được: khi chính dữ liệu nghiệp vụ
 * cũng có trường tên `data` (vd `{ id, data: '...' }` của một bản ghi cấu hình).
 * Lúc đó hàm sẽ bóc nhầm. Endpoint như vậy thì đọc `response.data` trực tiếp và
 * ghi chú lý do ngay tại chỗ.
 */
export function unwrapData<T>(response: AxiosResponse<unknown>): T {
  const body = response.data;
  if (body !== null && typeof body === 'object' && 'data' in body) {
    return (body as { data: T }).data;
  }
  return body as T;
}
