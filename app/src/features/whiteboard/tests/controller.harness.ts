import * as Y from 'yjs';

import { ConnectionController } from '../collab/connection-controller';
import type { ControllerHost } from '../collab/connection-controller.types';
import { fakePorts, WB_ID } from './wb.harness';

/** Dựng `ConnectionController` với cổng giả + token giả (dùng chung cho `connection-controller*.test.ts`). Test PHẢI `jest.useFakeTimers()` trước khi gọi. */
export const flush = () => jest.advanceTimersByTimeAsync(0);
export const notice = (code: string) => JSON.stringify({ code, type: 'notice', v: 1 });

export function setup(over: { ensure?: jest.Mock; refresh?: jest.Mock; classify?: 'forbidden' | 'retry' } = {}) {
  const ports = fakePorts();
  const host: jest.Mocked<ControllerHost> = {
    onFailure: jest.fn(),
    onNotice: jest.fn(),
    onPresence: jest.fn(),
    onSnapshot: jest.fn(),
  };
  const tokens = {
    ensure: over.ensure ?? jest.fn().mockResolvedValue({ token: 't-ensure' }),
    refresh: over.refresh ?? jest.fn().mockResolvedValue({ token: 't-fresh' }),
  };
  const controller = new ConnectionController({
    classifyTokenError: () => over.classify ?? 'retry',
    createPort: ports.factory,
    doc: new Y.Doc(),
    documentName: `wb:${WB_ID}`,
    host,
    random: () => 0,
    tokens,
    url: 'wss://x.example/collab',
    user: { color: '#175CD3', id: 'u1', name: 'An' },
  });
  controller.connect();
  const port = ports.last();
  const lastSnapshot = () => host.onSnapshot.mock.calls.at(-1)?.[0];
  return { controller, host, lastSnapshot, port, tokens };
}
