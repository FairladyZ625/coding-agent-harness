export function assertPresetActionTaskKernelMaterializationBoundary(actionName: string, destination: string): void {
  const materialName = taskKernelMaterialName(destination);
  if (!materialName) return;
  throw new Error(
    [
      `Preset action ${actionName} cannot materialize active task truth ${materialName}: ${destination}.`,
      `Task Kernel ${kernelCommandForMaterial(materialName)} is not implemented for preset action materialization yet.`,
      "Write task-local artifacts instead; migration-only compatibility must not become active runtime truth.",
    ].join(" "),
  );
}

function taskKernelMaterialName(destination: string): string {
  const match = destination.match(/(^|\/)(INDEX|brief|task_plan|execution_strategy|visual_map|progress|findings|review|lesson_candidates|long-running-task-contract|walkthrough)\.md$/);
  return match?.[2] ? `${match[2]}.md` : "";
}

function kernelCommandForMaterial(materialName: string): string {
  if (materialName === "progress.md") return "UpdateTaskProgress";
  if (materialName === "review.md") return "SubmitAgentReview or ConfirmHumanReview";
  if (materialName === "walkthrough.md") return "CompleteTask";
  return "task material command/query";
}
