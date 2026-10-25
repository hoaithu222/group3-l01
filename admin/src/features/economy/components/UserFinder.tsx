import { memo } from 'react';
import { Link } from 'react-router-dom';

import { useAuthStore } from '@/app/store';
import { useDebounce, useImeSafeSearchInput, useNavHref, useQueryParams } from '@/shared/hooks';
import { Callout, Input } from '@/shared/ui';

import { OBJECT_ID_PATTERN, USER_SEARCH_MIN_LENGTH } from '../constants/economy.constants';
import UserSearchResults from './UserSearchResults';

/**
 * Bước chọn người dùng trước khi xem ví (BE chỉ có endpoint theo `userId`): gõ tên/email (cần `user:view`, tìm IME-safe, debounce 300 ms, từ khoá sống trên URL
 * `?search=`) hoặc DÁN ID người dùng (24 ký tự hex) — cách thứ hai dùng được cả khi admin không có `user:view`. Chọn xong → `?userId=`.
 */
const UserFinder = memo(function UserFinder() {
  const { search, setSearch } = useQueryParams();
  const canViewUser = useAuthStore((s) => s.hasPermission('user', 'view'));
  const buildHref = useNavHref();
  const { inputProps } = useImeSafeSearchInput(search, setSearch);
  const query = useDebounce(search.trim(), 300);
  const isId = OBJECT_ID_PATTERN.test(query);

  return (
    <div className="flex flex-col gap-3">
      <Callout
        description="Tìm người dùng theo tên hoặc email, hoặc dán ID người dùng (24 ký tự), để xem ví, sổ cái và điều chỉnh xu."
        intent="info"
        variant="ghost"
      />
      <Input
        {...inputProps}
        aria-label="Tìm người dùng để xem ví xu"
        placeholder="Tìm theo tên, email hoặc dán ID người dùng…"
      />
      {isId ? (
        <Link
          className="text-body-14 text-link hover:underline"
          to={buildHref({ userId: query, search: null })}
        >
          Xem ví của người dùng có ID {query}
        </Link>
      ) : query.length >= USER_SEARCH_MIN_LENGTH ? (
        canViewUser ? (
          <UserSearchResults q={query} />
        ) : (
          <Callout
            description="Tài khoản của bạn chưa có quyền xem danh sách người dùng — hãy dán ID người dùng (24 ký tự) vào ô tìm kiếm."
            intent="warning"
            variant="ghost"
          />
        )
      ) : null}
    </div>
  );
});

export default UserFinder;
