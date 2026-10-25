/** Kết quả OAuth mà BE trả qua deep link cố định `superapp://integrations/callback?status&provider&id&code&workspaceId`. */
export interface CallbackOutcome {
  status: 'ok' | 'error' | 'cancelled';
  provider: string | null;
  id: string | null;
  code: string | null;
  workspaceId: string | null;
}

const OBJECT_ID = /^[a-f0-9]{24}$/i;
const CODE = /^[A-Z]+_\d{3}$/;

function pick(
  params: URLSearchParams | Record<string, string | string[] | undefined>,
  key: string,
): string | null {
  const raw = params instanceof URLSearchParams ? params.get(key) : params[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Đọc tham số callback — CHỈ nhận giá trị đúng dạng (id ObjectId, mã `XXX_000`, trạng thái trong danh sách): deep link ai cũng tự gõ được, không
 * được dùng để điều hướng tới đường dẫn tuỳ ý. Nhận cả URL đầy đủ (kết quả `openAuthSessionAsync`) lẫn params của route.
 */
export function parseCallback(
  input: string | Record<string, string | string[] | undefined>,
): CallbackOutcome {
  let params: URLSearchParams | Record<string, string | string[] | undefined>;
  if (typeof input === 'string') {
    const q = input.indexOf('?');
    params = new URLSearchParams(q >= 0 ? input.slice(q + 1) : '');
  } else {
    params = input;
  }
  const status = pick(params, 'status');
  const id = pick(params, 'id');
  const workspaceId = pick(params, 'workspaceId');
  const code = pick(params, 'code');
  return {
    status: status === 'ok' || status === 'cancelled' ? status : 'error',
    provider: pick(params, 'provider'),
    id: id && OBJECT_ID.test(id) ? id : null,
    code: code && CODE.test(code) ? code : null,
    workspaceId: workspaceId && OBJECT_ID.test(workspaceId) ? workspaceId : null,
  };
}
