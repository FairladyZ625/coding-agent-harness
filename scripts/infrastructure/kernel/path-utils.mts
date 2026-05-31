import path from "node:path";

export type ProjectRootTarget = {
  projectRoot: string;
};

export function toPosix(value: string): string {
  return String(value).split(path.sep).join("/");
}

export function prefixedPath(target: ProjectRootTarget, filePath: string): string {
  return `TARGET:${toPosix(path.relative(target.projectRoot, filePath))}`;
}
