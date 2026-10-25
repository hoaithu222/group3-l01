import { LiveQuizGate } from '@/features/live-quiz/components/LiveQuizGate';
import { HostSetupScreen } from '@/features/live-quiz/screens/HostSetupScreen';

export default function LiveQuizHostRoute() {
  return (
    <LiveQuizGate>
      <HostSetupScreen />
    </LiveQuizGate>
  );
}
