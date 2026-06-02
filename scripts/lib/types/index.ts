export type SharedTypeIsland = "task" | "review" | "snapshot" | "task-scanner" | "task-repository" | "check-profiles" | "task-lifecycle" | "impact";

export interface SharedTypeIslandDescriptor {
  island: SharedTypeIsland;
  purpose: string;
  runtimeImportsAllowed: false;
}
