import { handleCallForceEnd, type CallForceEndPort } from "../jobs/call-admin.outbox-handlers";

/**
 * Consumer outbox `call.force-end` (p2-07): kết thúc qua ĐIỂM DUY NHẤT `endCall(FORCE_ENDED, actorId)`; idempotent (chạy hai lần → một lần kết thúc); từ chối cuộc gọi của cuộc họp.
 */
function port(call: { status: "RINGING" | "ACTIVE" | "ENDED"; scopeType: "CONVERSATION" | "CHANNEL" | "MEETING" } | null) {
  const state = { call };
  const endCall = jest.fn(async () => {
    if (state.call) state.call = { ...state.call, status: "ENDED" };
    return {};
  });
  const p: CallForceEndPort = { findCall: () => Promise.resolve(state.call), endCall };
  return { p, endCall };
}

const PAYLOAD = { callId: "c1", actorId: "admin-1", reason: "Vi phạm quy định" };

describe("handleCallForceEnd", () => {
  it("cuộc gọi đang chạy → endCall(callId, 'FORCE_ENDED', actorId)", async () => {
    const { p, endCall } = port({ status: "ACTIVE", scopeType: "CHANNEL" });
    await expect(handleCallForceEnd(PAYLOAD, p)).resolves.toBe("ENDED");
    expect(endCall).toHaveBeenCalledWith("c1", "FORCE_ENDED", "admin-1");
  });

  it("chạy hai lần (job retry) → chỉ một lần kết thúc; lần hai SKIPPED", async () => {
    const { p, endCall } = port({ status: "RINGING", scopeType: "CONVERSATION" });
    await handleCallForceEnd(PAYLOAD, p);
    await expect(handleCallForceEnd(PAYLOAD, p)).resolves.toBe("SKIPPED");
    expect(endCall).toHaveBeenCalledTimes(1);
  });

  it("đã ENDED / không còn → SKIPPED, không gọi endCall", async () => {
    const ended = port({ status: "ENDED", scopeType: "CHANNEL" });
    await expect(handleCallForceEnd(PAYLOAD, ended.p)).resolves.toBe("SKIPPED");
    const gone = port(null);
    await expect(handleCallForceEnd(PAYLOAD, gone.p)).resolves.toBe("SKIPPED");
    expect(ended.endCall).not.toHaveBeenCalled();
    expect(gone.endCall).not.toHaveBeenCalled();
  });

  it("cuộc gọi của cuộc họp → REFUSED_MEETING (phải kết thúc qua Meeting để Meeting.status không lệch)", async () => {
    const { p, endCall } = port({ status: "ACTIVE", scopeType: "MEETING" });
    await expect(handleCallForceEnd(PAYLOAD, p)).resolves.toBe("REFUSED_MEETING");
    expect(endCall).not.toHaveBeenCalled();
  });
});
