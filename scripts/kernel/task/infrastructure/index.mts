export const taskKernelInfrastructureBoundary = {
  layer: "infrastructure",
  purpose: "Task Kernel filesystem, markdown, git, and projection adapters live here after TK-03 and TK-06.",
} as const;

export {
  createGitUnitOfWork,
  createGitUnitOfWorkLiveLayer,
  GitUnitOfWorkLiveLayer,
} from "./git-unit-of-work.mjs";
export {
  createMarkdownTaskPackageStoreReader,
} from "./markdown-task-package-store-reader.mjs";
export type {
  GitUnitOfWorkOptions,
} from "./git-unit-of-work.mjs";
export type {
  MarkdownTaskPackageStoreReaderOptions,
} from "./markdown-task-package-store-reader.mjs";
