/** Đường dẫn endpoint chặn người dùng (be `modules/blocks`) — mount tại `/me/blocks`. */
export const BLOCKS_API = {
  /** `GET` danh sách (cursor + `meta.allIds`) · `POST { userId }` chặn (idempotent). */
  root: '/me/blocks',
  /** `DELETE` bỏ chặn (idempotent — chưa chặn vẫn 200, `data: null`). */
  one: (userId: string) => `/me/blocks/${userId}`,
} as const;
