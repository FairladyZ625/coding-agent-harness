export const allowedPhaseKinds = new Set(["init", "execution", "gate"]);
export const allowedPhaseActors = new Set(["agent", "human", "coordinator"]);
export function normalizePhaseKind(value) {
    const normalized = String(value || "")
        .replace(/`/g, "")
        .trim()
        .toLowerCase()
        .replaceAll("_", "-");
    if (!normalized)
        return "execution";
    if (normalized === "exec" || normalized === "implementation")
        return "execution";
    if (normalized === "prep" || normalized === "discussion")
        return "init";
    if (normalized === "review" || normalized === "closeout")
        return "gate";
    return normalized;
}
export function normalizePhaseActor(value) {
    const normalized = String(value || "")
        .replace(/`/g, "")
        .trim()
        .toLowerCase()
        .replaceAll("_", "-");
    return normalized || "agent";
}
export function isExecutionPhase(phase) {
    return normalizePhaseKind(phase?.kind) === "execution";
}
export function nonSkippedPhases(phases = []) {
    return phases.filter((phase) => phase.state !== "skipped");
}
export function implementationPhases(phases = []) {
    return nonSkippedPhases(phases).filter(isExecutionPhase);
}
export function phaseCompletionAverage(phases = []) {
    const scored = implementationPhases(phases);
    if (scored.length === 0)
        return 0;
    return Math.round(scored.reduce((sum, phase) => sum + phase.completion, 0) / scored.length);
}
export function phaseHasRecordedProgress(phase) {
    return (phase.completion > 0 ||
        ["in_progress", "review", "blocked", "done"].includes(String(phase.state || "").toLowerCase()) ||
        ["partial", "present", "waived"].includes(String(phase.evidenceStatus || "").toLowerCase()));
}
