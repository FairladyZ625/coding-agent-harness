export type SharedTypeIsland = "task" | "review" | "snapshot" | "task-scanner" | "check-profiles";

export interface SharedTypeIslandDescriptor {
  island: SharedTypeIsland;
  purpose: string;
  runtimeImportsAllowed: false;
}
