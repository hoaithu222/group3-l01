/**
 * Bảng i18n server cho tiêu đề/nội dung hiển thị push (be.md §6.2) — tiếng
 * Việt duy nhất Phase 0 (client-side i18n là việc của app, đây là fallback
 * server không phụ thuộc locale thiết bị). KHÔNG BAO GIỜ đưa nội dung tin,
 * tên tệp, tên kênh riêng tư vào chuỗi trả về — `refs` truyền vào chỉ chứa id
 * + tên hiển thị ĐÃ ĐƯỢC module gọi `notify()` kiểm quyền cho phép thấy.
 */
export interface PushTemplateResult {
  title?: string;
  body?: string;
}

/** Body chung khi `lockScreenPreview=false` (mặc định) cho tin nhắn/mention/thread — không lộ nội dung/tên kênh. */
const GENERIC_MESSAGE_BODY = "Bạn có thông báo mới trong Super App";

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

export function buildTemplate(
  type: string,
  refs: Record<string, unknown>,
  lockScreenPreview: boolean,
  batchCount?: number
): PushTemplateResult {
  if (batchCount && batchCount > 1) {
    return { title: `${batchCount} thông báo mới`, body: undefined };
  }

  switch (type) {
    case "message.new":
    case "mention":
    case "thread.reply":
      // Tiêu đề CỐ Ý chung ("Super App"), KHÔNG dùng tên kênh/hội thoại —
      // be.md §6.2 "không bao giờ đưa ... tên kênh riêng tư vào payload".
      return {
        title: "Super App",
        body: lockScreenPreview ? str(refs["preview"]) ?? GENERIC_MESSAGE_BODY : GENERIC_MESSAGE_BODY,
      };
    case "call.missed": {
      // "Nhóm" = CHANNEL, hoặc CONVERSATION có nhiều hơn 2 thành viên (module
      // gọi tự đánh dấu `refs.isGroup`) — CONVERSATION không đánh dấu mặc định
      // coi là DM (be.md README §2 "DM: tên người gọi; nhóm: tên nhóm").
      const scopeType = str(refs["scopeType"]);
      const isGroup = scopeType === "CHANNEL" || (scopeType === "CONVERSATION" && refs["isGroup"] === true);
      const callerName = str(refs["callerName"]);
      return {
        title: "Cuộc gọi nhỡ",
        body: isGroup ? "Cuộc gọi nhỡ trong nhóm" : callerName ? `Cuộc gọi nhỡ từ ${callerName}` : "Cuộc gọi nhỡ",
      };
    }
    case "meeting.invited":
      return { title: "Bạn được mời họp", body: str(refs["scopeTitle"]) };
    case "meeting.reminder":
      return { title: "Cuộc họp sắp bắt đầu", body: str(refs["scopeTitle"]) };
    case "meeting.started":
      return { title: "Cuộc họp đã bắt đầu", body: str(refs["scopeTitle"]) };
    case "meeting.updated":
      return { title: "Cuộc họp đã thay đổi", body: str(refs["scopeTitle"]) };
    case "meeting.cancelled":
      return { title: "Cuộc họp đã huỷ", body: str(refs["scopeTitle"]) };
    case "meeting.recap-published":
      return { title: "Biên bản họp đã có", body: str(refs["scopeTitle"]) };
    // ── Phase 3 (foundation) — dự án & khách/duyệt. KHÔNG đưa tiêu đề thẻ/tên kênh riêng vào body khi
    // `lockScreenPreview=false` (mặc định); `refs.taskTitle` chỉ hiện khi người dùng bật xem trước.
    case "task.assigned":
      return { title: "Bạn được giao việc mới", body: lockScreenPreview ? str(refs["taskTitle"]) : undefined };
    case "task.comment":
      return { title: "Bình luận mới trên thẻ", body: lockScreenPreview ? str(refs["taskTitle"]) : undefined };
    case "task.comment-mention":
      return { title: "Bạn được nhắc tên trong một bình luận", body: lockScreenPreview ? str(refs["taskTitle"]) : undefined };
    case "task.due-soon":
      return { title: "Thẻ sắp đến hạn", body: lockScreenPreview ? str(refs["taskTitle"]) : undefined };
    case "workspace.invited":
      return { title: "Bạn được mời vào một nhóm", body: str(refs["workspaceName"]) };
    case "workspace.join-requested":
      return { title: "Có yêu cầu tham gia nhóm", body: str(refs["workspaceName"]) };
    case "workspace.join-approved":
      return { title: "Yêu cầu tham gia đã được duyệt", body: str(refs["workspaceName"]) };
    case "workspace.join-rejected":
      return { title: "Yêu cầu tham gia bị từ chối", body: str(refs["workspaceName"]) };
    case "guest.expiring":
      return { title: "Quyền khách sắp hết hạn", body: str(refs["workspaceName"]) };
    case "mention.role":
      return { title: "Super App", body: GENERIC_MESSAGE_BODY };
    case "system.test":
      return { title: "Thử nghiệm push", body: "Đây là thông báo thử từ quản trị viên" };
    default:
      // call.incoming/call.cancelled/call.answered-elsewhere → data-only, không hiển thị.
      return {};
  }
}
