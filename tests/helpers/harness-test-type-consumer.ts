import type {
  HarnessTestCommandResult,
  HarnessTestJsonResult,
  HarnessTestPaths,
  WorkbenchRuntime,
  ZipFixtureEntry,
} from "./harness-test-types.js";

type StatusPayload = {
  tasks: Array<{ id: string }>;
};

const commandResult: HarnessTestCommandResult = {
  status: 0,
  stdout: "{}\n",
  stderr: "",
};

const jsonResult: HarnessTestJsonResult<StatusPayload> = {
  ...commandResult,
  payload: { tasks: [{ id: "TASKS/example" }] },
};

const paths: HarnessTestPaths = {
  repoRoot: "/repo",
  cli: "/repo/dist/harness.mjs",
  tmpRoot: "/tmp/harness-v1",
};

const runtime: WorkbenchRuntime = {
  url: "http://127.0.0.1:12345/",
  csrf: "abcdef",
  stdout: "",
  stderr: "",
};

const zipEntry: ZipFixtureEntry = {
  name: "fixture/file.txt",
  data: "fixture",
  method: 8,
};

export type HarnessTestTypeSmoke = {
  commandResult: typeof commandResult;
  jsonResult: typeof jsonResult;
  paths: typeof paths;
  runtime: typeof runtime;
  zipEntry: typeof zipEntry;
};
