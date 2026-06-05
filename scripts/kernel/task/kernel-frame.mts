export const TASK_KERNEL_FRAME_VERSION = "task-kernel-frame/2026-06-05-tk00" as const;

export const taskKernelLayerIds = [
  "domain",
  "application",
  "ports",
  "infrastructure",
  "adapters",
] as const;

export type TaskKernelLayerId = (typeof taskKernelLayerIds)[number];

export type TaskKernelLayerDescriptor = Readonly<{
  id: TaskKernelLayerId;
  path: string;
  owns: readonly string[];
  mayImport: readonly TaskKernelLayerId[];
}>;

export type TaskKernelFrame = Readonly<{
  version: typeof TASK_KERNEL_FRAME_VERSION;
  root: "scripts/kernel/task";
  layers: readonly TaskKernelLayerDescriptor[];
}>;

export const taskKernelFrame = {
  version: TASK_KERNEL_FRAME_VERSION,
  root: "scripts/kernel/task",
  layers: [
    {
      id: "domain",
      path: "scripts/kernel/task/domain",
      owns: ["Task identity and value object contracts", "domain policy contracts"],
      mayImport: [],
    },
    {
      id: "application",
      path: "scripts/kernel/task/application",
      owns: ["task command and query use case contracts"],
      mayImport: ["domain", "ports"],
    },
    {
      id: "ports",
      path: "scripts/kernel/task/ports",
      owns: ["repository, transaction, clock, human review, and generated projection ports"],
      mayImport: ["domain"],
    },
    {
      id: "infrastructure",
      path: "scripts/kernel/task/infrastructure",
      owns: ["filesystem, markdown, git, and projection adapters"],
      mayImport: ["domain", "ports"],
    },
    {
      id: "adapters",
      path: "scripts/kernel/task/adapters",
      owns: ["CLI, REST, dashboard, preset, and test adapter boundaries"],
      mayImport: ["application", "domain", "ports"],
    },
  ],
} as const satisfies TaskKernelFrame;

export function listTaskKernelLayers(): readonly TaskKernelLayerDescriptor[] {
  return taskKernelFrame.layers;
}
