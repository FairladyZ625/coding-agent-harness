export type SharedTypeIsland = "task" | "review" | "snapshot";

export interface SharedTypeIslandDescriptor {
  island: SharedTypeIsland;
  purpose: string;
  runtimeImportsAllowed: false;
}
