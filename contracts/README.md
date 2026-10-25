# contracts/

Nguồn sự thật cho hợp đồng ngoài REST (REST/OpenAPI nằm ở `be/openapi.json`) —
**chỉ JSON, không code, không `package.json`** (D-07: repo không có root
`package.json`, mọi tool — BE, app, admin — đọc JSON bằng `fs` thuần).

Xem đặc tả đầy đủ: [`docs/plans/phase-0-common/p0-09-contract-tooling/README.md`](../docs/plans/phase-0-common/p0-09-contract-tooling/README.md).

| File | Sinh bởi | Nội dung |
| --- | --- | --- |
| `error-codes.json` | `be/scripts/export-error-codes.ts` (`npm run gen:error-codes` trong `be/`) | Đọc trực tiếp `ErrorCode`/`ErrorMessages` (`be/src/core/utils/error.codes.ts`) — **không sửa tay**, chạy lại script khi thêm mã lỗi mới. |
| `socket-events.json` | Chép tay từ `SocketEvent` enum (`be/src/infrastructure/socket/socket.events.ts`) | Tên sự kiện Socket.IO thật + mô tả payload/room. Chưa phải catalog Zod code-gen (xem `note` trong file) — thêm dòng khi có sự kiện mới. |
| `push-types.json` | Chép tay từ `TYPE_SPECS`/`isCallIncoming` (`be/src/modules/notifications/services/push-payload.builder.ts`) | 14 loại push canonical (channel/visible/voip/dataKeys). Các loại push riêng từng module Phase 1+ CHƯA liệt kê (xem `note` trong file). |
| `whiteboard-elements.schema.json` | (module `whiteboard`, ngoài phạm vi p0-09) | JSON Schema phần tử whiteboard. |

Quy trình dev khi đổi hợp đồng BE: sửa DTO/route → `cd be && npm run
contracts:export` (chạy `gen:openapi` + `gen:error-codes`) → commit
`be/openapi.json` + `contracts/*.json` cùng PR → client chạy `gen:api-types`/
`sync:contracts` của package mình.
