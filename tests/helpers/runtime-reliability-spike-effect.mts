import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { Effect } from "effect";

type ProbeFailureCode = "probe-command-failed" | "probe-timeout" | "probe-unexpected-error";

type ProbeFailure = {
  code: ProbeFailureCode;
  message: string;
  status?: number | null;
  stderr?: string;
  stdout?: string;
};

type ProbeSuccess = {
  ok: true;
  root: string;
  home: string;
  pathEntries: string[];
  stdout: string;
};

type ProbeFailureResult = {
  ok: false;
  root?: string;
  failure: ProbeFailure;
};

export type RuntimeReliabilitySpikeProbeResult = ProbeSuccess | ProbeFailureResult;

export type RuntimeReliabilitySpikeProbeOptions = {
  timeoutMillis?: number;
  keepTemp?: boolean;
  script?: string;
  extraPath?: readonly string[];
};

type ProbeContext = {
  root: string;
  home: string;
  bin: string;
  consumer: string;
};

type RunningProbeCommand = {
  child: ChildProcess;
  stdout: string[];
  stderr: string[];
  done: boolean;
};

type ProbeCommandResult = {
  status: number | null;
  stdout: string;
  stderr: string;
};

class RuntimeReliabilitySpikeFailure {
  readonly _tag = "RuntimeReliabilitySpikeFailure";

  constructor(readonly failure: ProbeFailure, readonly root?: string) {}
}

export async function runRuntimeReliabilitySpikeProbe({
  timeoutMillis = 5_000,
  keepTemp = false,
  script = "console.log(JSON.stringify({home: process.env.HOME, path: process.env.PATH}))",
  extraPath = [],
}: RuntimeReliabilitySpikeProbeOptions = {}): Promise<RuntimeReliabilitySpikeProbeResult> {
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const context = yield* acquireProbeContext(keepTemp);
        const env = {
          ...process.env,
          HOME: context.home,
          npm_config_cache: path.join(context.home, ".npm"),
          PATH: [context.bin, ...extraPath, "/usr/bin", "/bin"].join(path.delimiter),
        };
        const command = yield* acquireProbeCommand({ context, env, script });
        const result = yield* awaitProbeCommand(command, context.root).pipe(
          Effect.timeoutFail({
            duration: `${timeoutMillis} millis`,
            onTimeout: () =>
              new RuntimeReliabilitySpikeFailure({
                code: "probe-timeout",
                message: `runtime reliability probe timed out after ${timeoutMillis}ms`,
              }, context.root),
          }),
        );

        if (result.status !== 0) {
          return yield* Effect.fail(
            new RuntimeReliabilitySpikeFailure({
              code: "probe-command-failed",
              message: "runtime reliability probe command failed",
              status: result.status,
              stdout: result.stdout,
              stderr: result.stderr,
            }, context.root),
          );
        }

        return {
          ok: true as const,
          root: context.root,
          home: context.home,
          pathEntries: env.PATH.split(path.delimiter),
          stdout: result.stdout,
        };
      }).pipe(
        Effect.catchAll((error) =>
          Effect.succeed({
            ok: false as const,
            root: error.root,
            failure: error.failure,
          }),
        ),
      ),
    ),
  );
}

function acquireProbeContext(keepTemp: boolean) {
  return Effect.acquireRelease(
    Effect.sync(() => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "harness-effect-runtime-spike-"));
      const home = path.join(root, "home");
      const bin = path.join(root, "bin");
      const consumer = path.join(root, "consumer");
      fs.mkdirSync(home, { recursive: true });
      fs.mkdirSync(bin, { recursive: true });
      fs.mkdirSync(consumer, { recursive: true });
      fs.writeFileSync(path.join(consumer, "package.json"), JSON.stringify({ private: true, type: "module" }, null, 2));
      return { root, home, bin, consumer };
    }),
    (context) =>
      Effect.sync(() => {
        if (!keepTemp) fs.rmSync(context.root, { recursive: true, force: true });
      }),
  );
}

function acquireProbeCommand({ context, env, script }: { context: ProbeContext; env: NodeJS.ProcessEnv; script: string }) {
  return Effect.acquireRelease(
    Effect.sync(() => {
      const child = spawn(process.execPath, ["-e", script], {
        cwd: context.consumer,
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });
      const command: RunningProbeCommand = { child, stdout: [], stderr: [], done: false };
      child.stdout.on("data", (chunk: Buffer) => command.stdout.push(chunk.toString("utf8")));
      child.stderr.on("data", (chunk: Buffer) => command.stderr.push(chunk.toString("utf8")));
      return command;
    }),
    (command) =>
      Effect.sync(() => {
        if (!command.done) command.child.kill("SIGTERM");
      }),
  );
}

function awaitProbeCommand(command: RunningProbeCommand, root: string): Effect.Effect<ProbeCommandResult, RuntimeReliabilitySpikeFailure> {
  return Effect.async<ProbeCommandResult, RuntimeReliabilitySpikeFailure>((resume) => {
    command.child.once("error", (error) => {
      command.done = true;
      resume(
        Effect.fail(
          new RuntimeReliabilitySpikeFailure({
            code: "probe-unexpected-error",
            message: errorMessage(error),
            stdout: command.stdout.join(""),
            stderr: command.stderr.join(""),
          }, root),
        ),
      );
    });
    command.child.once("close", (status) => {
      command.done = true;
      resume(
        Effect.succeed({
          status,
          stdout: command.stdout.join(""),
          stderr: command.stderr.join(""),
        }),
      );
    });
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
