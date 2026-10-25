const OBJECT_ID = /^[a-f0-9]{24}$/i;

/** Giá trị từ URL chỉ được dùng khi nằm trong danh sách cho phép — giá trị lạ bị bỏ, không gửi BE (BE trả 400 cho enum lạ). */
export function oneOf<T extends string>(raw: string, allowed: readonly T[]): T | undefined {
  return (allowed as readonly string[]).includes(raw) ? (raw as T) : undefined;
}

/** Id Mongo hợp lệ từ URL (ngăn kéo, ô lọc tiệm); sai định dạng → `undefined` để không gọi BE với rác. */
export function validId(raw: string): string | undefined {
  return OBJECT_ID.test(raw) ? raw : undefined;
}
