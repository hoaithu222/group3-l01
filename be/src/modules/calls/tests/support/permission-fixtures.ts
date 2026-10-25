import { clearRevokeListeners, setPermissionPorts, resetPermissionPorts } from "../../../../core/permission";

export { clearRevokeListeners };

/** Cổng permission giả cho `revokeScope` trong unit test (không Socket.IO/BullMQ thật). */
export function registerPermissionResolverForTest(): void {
  resetPermissionPorts();
  setPermissionPorts({
    realtime: { leaveRooms: () => Promise.resolve(), emitToUsers: () => Promise.resolve() },
    outbox: { enqueueNow: () => Promise.resolve() },
  });
}
