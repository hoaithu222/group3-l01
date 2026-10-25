import type { PhaseFormValues } from '../schemas/phase.schema';
import type { AdminPhase, PatchPhasePayload } from '../types/roadmap.types';

const DEFAULT_COLOR = '#06B6D4';

export function phaseToFormValues(phase: AdminPhase): PhaseFormValues {
  return {
    title: phase.title,
    summary: phase.summary ?? '',
    stageLabel: phase.stageLabel ?? '',
    color: phase.color ?? DEFAULT_COLOR,
    capstone: phase.capstone ?? '',
  };
}

export function toPatchPhasePayload(phase: AdminPhase, values: PhaseFormValues): PatchPhasePayload {
  return {
    id: phase.id,
    expectedVersion: phase.version,
    title: values.title,
    summary: values.summary,
    stageLabel: values.stageLabel,
    color: values.color,
    capstone: values.capstone,
  };
}
