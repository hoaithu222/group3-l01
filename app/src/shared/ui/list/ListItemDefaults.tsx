import { createContext, useContext, useMemo, type ReactNode } from 'react';

import type { ListItemVariants } from './list-item.styles';

/** Giá trị mặc định mà một nhóm `ListItem` thừa hưởng — hiện chỉ có `emphasis`. */
export interface ListItemDefaults {
  emphasis?: ListItemVariants['emphasis'];
}

const ListItemDefaultsContext = createContext<ListItemDefaults>({});

/**
 * Đặt MẶC ĐỊNH cho mọi `ListItem` nằm bên trong — kể cả những hàng do feature KHÁC đăng ký vào một khe chung
 * (`ProfileRowsSlot` ở màn Tôi: "Cần chấm" của `boards`) mà nơi lắp ráp không sửa được từng cái.
 *
 * ```tsx
 * <ListItemDefaultsProvider emphasis="title">
 *   <Card>…nhiều ListItem điều hướng, kể cả hàng từ khe…</Card>
 * </ListItemDefaultsProvider>
 * ```
 *
 * ⚠️ Prop truyền THẲNG vào `ListItem` luôn thắng mặc định này. Không có provider ⇒ hành vi cũ y nguyên.
 */
export function ListItemDefaultsProvider({
  children,
  emphasis,
}: ListItemDefaults & { children: ReactNode }) {
  const value = useMemo(() => ({ emphasis }), [emphasis]);
  return <ListItemDefaultsContext.Provider value={value}>{children}</ListItemDefaultsContext.Provider>;
}

export function useListItemDefaults(): ListItemDefaults {
  return useContext(ListItemDefaultsContext);
}
