#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const defaultProjectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

type Failure = {
  code: string;
  message: string;
  actual?: unknown;
  command?: string;
  expected?: unknown;
  expectedTokens?: readonly string[];
  file?: string;
  mode?: number;
};

type CommandStep = {
  id: string;
  status: number | null;
};

type PackageJson = {
  bin?: {
    harness?: string;
  };
  scripts?: Record<string, string | undefined>;
};

type PackedEntry = {
  path: string;
  mode?: number;
};

type PackageObservation = {
  entryCount?: number;
  hasDistHarness?: boolean;
  hasDistPostinstall?: boolean;
  hasDistObservationGate?: boolean;
  hasPostinstallBootstrap?: boolean;
  hasRunDistBootstrap?: boolean;
  hasScriptsHarness?: boolean;
  hasScripts?: boolean;
  hasTests?: boolean;
  distHarnessMode?: number;
  distHarnessExecutable?: boolean;
};

type InventoryObservation = {
  distMjs?: number;
  scriptShims?: number;
  testShims?: number;
  unpairedScriptShims?: number;
  unpairedTestShims?: number;
};

type InstallSmokeObservation = {
  nodeVersion?: string;
  tempRoot?: string;
  binTarget?: string;
  bin?: string;
  binMode?: number;
  binExecutable?: boolean;
  binShebang?: string;
  postinstall?: string;
  observeDist?: string;
  hasTests?: boolean;
  hasScripts?: boolean;
  scriptsDisabled?: string[];
  steps?: CommandStep[];
  observationOk?: boolean;
};

type Observations = {
  packageRuntime: {
    bin?: string;
    scripts?: Record<string, string | undefined>;
  };
  inventory: InventoryObservation;
  package: PackageObservation;
  installSmoke: InstallSmokeObservation;
  commandMatrix: CommandStep[];
};

type CheckDistObservationOptions = {
  projectRoot?: string;
  runPack?: boolean;
  runInstallSmoke?: boolean;
  runCommandMatrix?: boolean;
};

type CliOptions = Required<CheckDistObservationOptions> & {
  json: boolean;
};

export function checkDistObservation({
  projectRoot = defaultProjectRoot,
  runPack = true,
  runInstallSmoke = true,
  runCommandMatrix = true,
}: CheckDistObservationOptions = {}) {
  const root = path.resolve(projectRoot);
  const failures: Failure[] = [];
  const observations: Observations = {
    packageRuntime: {},
    inventory: {},
    package: {},
    installSmoke: {},
    commandMatrix: [],
  };

  const pkg = readJson<PackageJson>(path.join(root, "package.json"), failures, "package-json");
  if (!pkg) return { ok: false, failures, observations };

  expectEqual(failures, "package-bin-not-dist", pkg.bin?.harness, "dist/harness.mjs", "package bin.harness must resolve to dist/harness.mjs");
  const distRuntimeScripts = {
    check: ["run-dist.mjs", "harness.mjs", "check", "--profile", "source-package"],
    "check:private": ["run-dist.mjs", "harness.mjs", "check", "--profile", "private-harness"],
    status: ["run-dist.mjs", "harness.mjs", "status", "--json"],
    dashboard: ["run-dist.mjs", "harness.mjs", "dashboard", "--out"],
    "dashboard:folder": ["run-dist.mjs", "harness.mjs", "dashboard", "--out-dir"],
    postinstall: ["postinstall.mjs"],
    prepare: ["postinstall.mjs", "--build-only"],
    prepublishOnly: ["run-dist.mjs", "check-dist-observation.mjs", "--skip-install-smoke"],
    "observe:dist": ["run-dist.mjs", "check-dist-observation.mjs", "--skip-pack", "--skip-install-smoke"],
  };
  for (const [name, tokens] of Object.entries(distRuntimeScripts)) {
    expectScriptIncludes(failures, `package-script-${name}-not-source-safe-dist`, pkg.scripts?.[name], tokens, `package script ${name} must run through the source-safe dist bootstrap`);
  }

  observations.packageRuntime = {
    bin: pkg.bin?.harness,
    scripts: Object.fromEntries(Object.keys(distRuntimeScripts).map((name) => [name, pkg.scripts?.[name]])),
  };

  // `npm pack --dry-run` runs `prepack`, which refreshes committed `dist/`.
  // Run it before inspecting dist so the observation is from one stable build.
  if (runPack) {
    const pack = spawnSync("npm", ["pack", "--dry-run", "--json"], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
    if (pack.status !== 0) {
      failures.push({ code: "pack-dry-run-failed", message: `npm pack dry-run failed\nSTDOUT:\n${pack.stdout}\nSTDERR:\n${pack.stderr}` });
    } else {
      const packedEntries = (JSON.parse(pack.stdout) as Array<{ files: PackedEntry[] }>)[0]?.files ?? [];
      const packed = packedEntries.map((file) => file.path).sort();
      const packedModeByPath = new Map(packedEntries.map((file) => [file.path, file.mode]));
      const distHarnessMode = packedModeByPath.get("dist/harness.mjs");
      observations.package = {
        entryCount: packed.length,
        hasDistHarness: packed.includes("dist/harness.mjs"),
        hasDistPostinstall: packed.includes("dist/postinstall.mjs"),
        hasDistObservationGate: packed.includes("dist/check-dist-observation.mjs"),
        hasPostinstallBootstrap: packed.includes("postinstall.mjs"),
        hasRunDistBootstrap: packed.includes("run-dist.mjs"),
        hasScriptsHarness: packed.includes("scripts/harness.mjs"),
        hasScripts: packed.some((file) => file.startsWith("scripts/")),
        hasTests: packed.some((file) => file.startsWith("tests/")),
        distHarnessMode,
        distHarnessExecutable: typeof distHarnessMode === "number" && Boolean(distHarnessMode & 0o111),
      };
      for (const required of ["postinstall.mjs", "run-dist.mjs", "dist/harness.mjs", "dist/postinstall.mjs", "dist/check-dist-observation.mjs"]) {
        if (!packed.includes(required)) failures.push({ code: "packed-file-missing", file: required, message: `package missing ${required}` });
      }
      if (!observations.package.distHarnessExecutable) {
        failures.push({ code: "packed-bin-not-executable", file: "dist/harness.mjs", mode: distHarnessMode, message: "package bin dist/harness.mjs must be executable" });
      }
      if (observations.package.hasScripts) failures.push({ code: "package-includes-scripts", message: "package must not include scripts/** after historical shim deletion" });
      if (observations.package.hasTests) failures.push({ code: "package-includes-tests", message: "package must not include tests/**" });
    }
  }

  const requiredDist = ["dist/harness.mjs", "dist/postinstall.mjs", "dist/check-dist-observation.mjs"];
  for (const relative of requiredDist) {
    if (!fs.existsSync(path.join(root, relative))) {
      failures.push({ code: "missing-dist-runtime", message: `missing dist runtime artifact: ${relative}` });
    }
  }

  const distFiles = collectFiles(path.join(root, "dist")).filter((file) => file.endsWith(".mjs"));
  for (const file of distFiles) {
    const relative = toPosix(path.relative(root, file));
    const content = fs.readFileSync(file, "utf8");
    for (const specifier of parseImportSpecifiers(content)) {
      if (/\.(?:ts|mts)$/.test(specifier)) {
        failures.push({ code: "dist-imports-typescript-source", file: relative, message: `${relative} imports TypeScript source ${specifier}` });
      }
      if (specifier.includes("scripts/") && specifier.endsWith(".mjs")) {
        failures.push({ code: "dist-imports-scripts-shim", file: relative, message: `${relative} imports historical scripts shim ${specifier}` });
      }
    }
  }

  const scriptShims = collectFiles(path.join(root, "scripts")).filter((file) => file.endsWith(".mjs"));
  const testShims = collectFiles(path.join(root, "tests")).filter((file) => file.endsWith(".mjs"));
  const unpairedScriptShims = scriptShims.filter((file) => !fs.existsSync(file.replace(/\.mjs$/, ".mts")));
  const unpairedTestShims = testShims.filter((file) => !fs.existsSync(file.replace(/\.mjs$/, ".mts")));
  for (const file of [...unpairedScriptShims, ...unpairedTestShims]) {
    failures.push({
      code: "historical-shim-without-typescript-source",
      file: toPosix(path.relative(root, file)),
      message: `${toPosix(path.relative(root, file))} has no adjacent .mts source twin`,
    });
  }
  observations.inventory = {
    distMjs: distFiles.length,
    scriptShims: scriptShims.length,
    testShims: testShims.length,
    unpairedScriptShims: unpairedScriptShims.length,
    unpairedTestShims: unpairedTestShims.length,
  };
  if (scriptShims.length > 0) {
    failures.push({ code: "historical-script-shims-remain", message: `PR-28 final inventory must have 0 scripts/**/*.mjs files; found ${scriptShims.length}` });
  }
  if (testShims.length > 0) {
    failures.push({ code: "historical-test-shims-remain", message: `PR-28 final inventory must have 0 tests/**/*.mjs files; found ${testShims.length}` });
  }

  if (runCommandMatrix) {
    runMatrix(root, failures, observations.commandMatrix);
  }

  if (runInstallSmoke) {
    runInstalledPackageSmoke(root, failures, observations);
  }

  return {
    ok: failures.length === 0,
    failures,
    observations,
  };
}

function runMatrix(root: string, failures: Failure[], commandMatrix: CommandStep[]) {
  const distHarness = path.join(root, "dist/harness.mjs");
  const matrix = [
    { id: "help", args: ["--help"] },
    { id: "status", args: ["status", "--json", "examples/minimal-project"] },
    { id: "task-list", args: ["task-list", "--json", "examples/minimal-project"] },
    { id: "preset-list", args: ["preset", "list", "--json", "examples/minimal-project"] },
    { id: "source-check", args: ["check", "--profile", "source-package", "."] },
    { id: "target-check", args: ["check", "--profile", "target-project", "examples/minimal-project"] },
    { id: "migrate-plan", args: ["migrate-plan", "--json", "--limit", "20", "examples/minimal-project"] },
    { id: "migrate-structure-plan", args: ["migrate-structure", "--plan", "--json", "examples/minimal-project"] },
    { id: "dashboard", args: ["dashboard", "--out-dir", path.join("tmp", `pr-27-observation-dashboard-${process.pid}`), "examples/minimal-project"] },
  ];

  for (const entry of matrix) {
    const result = spawnSync(process.execPath, [distHarness, ...entry.args], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    });
    commandMatrix.push({ id: entry.id, status: result.status });
    if (result.status !== 0) {
      failures.push({
        code: "dist-command-failed",
        command: entry.id,
        message: `dist command ${entry.id} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
      });
    }
  }

  const postinstall = spawnSync(process.execPath, [path.join(root, "dist/postinstall.mjs")], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, CODING_AGENT_HARNESS_SKIP_POSTINSTALL: "1" },
  });
  commandMatrix.push({ id: "postinstall-skip", status: postinstall.status });
  if (postinstall.status !== 0) {
    failures.push({
      code: "dist-postinstall-failed",
      message: `dist postinstall failed\nSTDOUT:\n${postinstall.stdout}\nSTDERR:\n${postinstall.stderr}`,
    });
  }
}

function runInstalledPackageSmoke(root: string, failures: Failure[], observations: Observations) {
  const node24 = findNode24();
  if (!node24) {
    failures.push({ code: "node24-not-found", message: "install smoke requires a Node 24 executable" });
    return;
  }
  const nodeBin = path.dirname(node24);
  const nodeVersion = spawnSync(node24, ["--version"], { encoding: "utf8" }).stdout.trim();
  if (!nodeVersion.startsWith("v24.")) {
    failures.push({ code: "node24-version-mismatch", actual: nodeVersion, message: `install smoke must run on Node 24, got ${nodeVersion}` });
    return;
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "harness-dist-observation-install-"));
  const packDir = path.join(tempRoot, "pack");
  const consumer = path.join(tempRoot, "consumer");
  const home = path.join(tempRoot, "home");
  fs.mkdirSync(packDir, { recursive: true });
  fs.mkdirSync(consumer, { recursive: true });
  fs.mkdirSync(home, { recursive: true });
  const npmEnv = isolatedEnv({ nodeBin, home });

  // The release observation already runs `npm pack --dry-run --json` first,
  // which exercises prepack and refreshes dist. The install smoke needs a
  // tarball of that observed package, not another cold lifecycle build in an
  // isolated npm cache.
  const pack = spawnSync("npm", ["pack", "--silent", "--ignore-scripts", "--pack-destination", packDir], {
    cwd: root,
    encoding: "utf8",
    env: npmEnv,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (pack.status !== 0) {
    failures.push({ code: "install-smoke-pack-failed", message: `npm pack failed\nERROR:\n${pack.error ? errorMessage(pack.error) : ""}\nSTDOUT:\n${pack.stdout ?? ""}\nSTDERR:\n${pack.stderr ?? ""}` });
    return;
  }

  const tarballName = pack.stdout.trim().split(/\r?\n/).at(-1);
  if (!tarballName) {
    failures.push({ code: "install-smoke-pack-empty", message: "npm pack did not print a tarball name" });
    return;
  }
  const tarball = path.join(packDir, tarballName);
  fs.writeFileSync(path.join(consumer, "package.json"), JSON.stringify({ private: true, type: "module" }, null, 2));
  const install = spawnSync("npm", ["install", "--silent", "--no-audit", "--no-fund", tarball], {
    cwd: consumer,
    encoding: "utf8",
    env: npmEnv,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (install.status !== 0) {
    failures.push({ code: "install-smoke-install-failed", message: `npm install packed tarball failed\nERROR:\n${install.error ? errorMessage(install.error) : ""}\nSTDOUT:\n${install.stdout ?? ""}\nSTDERR:\n${install.stderr ?? ""}` });
    return;
  }

  const packageRoot = path.join(consumer, "node_modules/coding-agent-harness");
  const bin = path.join(consumer, "node_modules/.bin/harness");
  const pkg = readJson<PackageJson>(path.join(packageRoot, "package.json"), failures, "installed-package-json");
  if (!pkg) return;

  const binTarget = fs.existsSync(bin) ? fs.readlinkSync(bin) : "";
  const installedBinFile = path.join(packageRoot, "dist/harness.mjs");
  const installedBinMode = fs.existsSync(installedBinFile) ? fs.statSync(installedBinFile).mode : undefined;
  const installedBinShebang = fs.existsSync(installedBinFile) ? fs.readFileSync(installedBinFile, "utf8").split(/\r?\n/, 1)[0] : "";
  const installSmoke: InstallSmokeObservation & {
    scriptsDisabled: string[];
    steps: CommandStep[];
  } = {
    nodeVersion,
    tempRoot,
    binTarget,
    bin: pkg.bin?.harness,
    binMode: installedBinMode,
    binExecutable: typeof installedBinMode === "number" && Boolean(installedBinMode & 0o111),
    binShebang: installedBinShebang,
    postinstall: pkg.scripts?.postinstall,
    observeDist: pkg.scripts?.["observe:dist"],
    hasTests: fs.existsSync(path.join(packageRoot, "tests")),
    hasScripts: fs.existsSync(path.join(packageRoot, "scripts")),
    scriptsDisabled: [],
    steps: [],
  };
  observations.installSmoke = installSmoke;

  expectEqual(failures, "installed-bin-not-dist", pkg.bin?.harness, "dist/harness.mjs", "installed package bin.harness must resolve to dist/harness.mjs");
  expectScriptIncludes(failures, "installed-postinstall-not-source-safe", pkg.scripts?.postinstall, ["postinstall.mjs"], "installed package postinstall must use the source-safe bootstrap");
  expectScriptIncludes(failures, "installed-observe-dist-not-source-safe", pkg.scripts?.["observe:dist"], ["run-dist.mjs", "check-dist-observation.mjs"], "installed observe:dist must use the source-safe dist bootstrap");
  if (!binTarget.includes("dist/harness.mjs")) {
    failures.push({ code: "installed-bin-link-not-dist", message: `installed bin link does not target dist/harness.mjs: ${binTarget}` });
  }
  if (!installSmoke.binExecutable) {
    failures.push({ code: "installed-bin-not-executable", file: "dist/harness.mjs", mode: installedBinMode, message: "installed package bin dist/harness.mjs must be executable" });
  }
  expectEqual(failures, "installed-bin-shebang-not-node-env", installedBinShebang, "#!/usr/bin/env node", "installed package bin dist/harness.mjs must keep the portable node env shebang");
  for (const relative of ["postinstall.mjs", "run-dist.mjs", "dist/harness.mjs", "dist/postinstall.mjs", "dist/check-dist-observation.mjs"]) {
    if (!fs.existsSync(path.join(packageRoot, relative))) failures.push({ code: "installed-file-missing", file: relative, message: `installed package missing ${relative}` });
  }
  if (installSmoke.hasTests) failures.push({ code: "installed-package-includes-tests", message: "installed package must not include tests/**" });
  if (installSmoke.hasScripts) failures.push({ code: "installed-package-includes-scripts", message: "installed package must not include scripts/** after historical shim deletion" });

  const installedScripts = path.join(packageRoot, "scripts");
  if (fs.existsSync(installedScripts)) {
    fs.renameSync(installedScripts, `${installedScripts}.disabled-by-dist-observation`);
    installSmoke.scriptsDisabled.push("scripts/");
  }

  const runtimeEnv = isolatedEnv({ nodeBin, home, extraPath: [path.join(consumer, "node_modules", ".bin")] });
  runInstalledMatrix(root, runtimeEnv, failures, installSmoke.steps, node24, installedBinFile);

  const postinstall = spawnSync(node24, [path.join(packageRoot, "dist/postinstall.mjs")], {
    cwd: packageRoot,
    encoding: "utf8",
    env: { ...runtimeEnv, CODING_AGENT_HARNESS_SKIP_POSTINSTALL: "1" },
  });
  installSmoke.steps.push({ id: "installed-dist-postinstall", status: postinstall.status });
  if (postinstall.status !== 0) failures.push({ code: "installed-postinstall-failed", message: `installed dist postinstall failed\nSTDOUT:\n${postinstall.stdout}\nSTDERR:\n${postinstall.stderr}` });

  const postinstallBootstrap = spawnSync(node24, [path.join(packageRoot, "postinstall.mjs")], {
    cwd: packageRoot,
    encoding: "utf8",
    env: { ...runtimeEnv, CODING_AGENT_HARNESS_SKIP_POSTINSTALL: "1" },
  });
  installSmoke.steps.push({ id: "installed-postinstall-bootstrap", status: postinstallBootstrap.status });
  if (postinstallBootstrap.status !== 0) failures.push({ code: "installed-postinstall-bootstrap-failed", message: `installed postinstall bootstrap failed\nSTDOUT:\n${postinstallBootstrap.stdout}\nSTDERR:\n${postinstallBootstrap.stderr}` });

  const installedObservation = spawnSync(
    node24,
    [path.join(packageRoot, "dist/check-dist-observation.mjs"), "--project-root", packageRoot, "--skip-pack", "--skip-install-smoke", "--skip-command-matrix", "--json"],
    {
      cwd: packageRoot,
      encoding: "utf8",
      env: runtimeEnv,
      maxBuffer: 32 * 1024 * 1024,
    },
  );
  installSmoke.steps.push({ id: "installed-observation", status: installedObservation.status });
  if (installedObservation.status !== 0) {
    failures.push({ code: "installed-observation-failed", message: `installed observation failed\nSTDOUT:\n${installedObservation.stdout}\nSTDERR:\n${installedObservation.stderr}` });
  } else {
    const installedResult = JSON.parse(installedObservation.stdout) as { ok?: boolean; failures?: unknown };
    installSmoke.observationOk = installedResult.ok;
    if (!installedResult.ok) failures.push({ code: "installed-observation-not-ok", message: JSON.stringify(installedResult.failures, null, 2) });
  }

}

function runInstalledMatrix(root: string, runtimeEnv: NodeJS.ProcessEnv, failures: Failure[], steps: CommandStep[], node24: string, installedBinFile: string) {
  const matrix = [
    { id: "installed-help", cwd: root, args: ["--help"] },
    { id: "installed-status", cwd: root, args: ["status", "--json", "examples/minimal-project"] },
    { id: "installed-task-list", cwd: root, args: ["task-list", "--json", "examples/minimal-project"] },
    { id: "installed-task-kernel-list", cwd: root, args: ["task-list", "--json", "--task-kernel", "examples/minimal-project"] },
    { id: "installed-preset-list", cwd: root, args: ["preset", "list", "--json", "examples/minimal-project"] },
    { id: "installed-source-check", cwd: root, args: ["check", "--profile", "source-package", "."] },
    { id: "installed-target-check", cwd: root, args: ["check", "--profile", "target-project", "examples/minimal-project"] },
    { id: "installed-migrate-plan", cwd: root, args: ["migrate-plan", "--json", "--limit", "20", "examples/minimal-project"] },
    { id: "installed-migrate-structure-plan", cwd: root, args: ["migrate-structure", "--plan", "--json", "examples/minimal-project"] },
    { id: "installed-dashboard", cwd: root, args: ["dashboard", "--out-dir", path.join("tmp", `pr-27-installed-observation-dashboard-${process.pid}`), "examples/minimal-project"] },
  ];

  for (const entry of matrix) {
    const result = spawnSync(node24, [installedBinFile, ...entry.args], {
      cwd: entry.cwd,
      encoding: "utf8",
      env: runtimeEnv,
      maxBuffer: 16 * 1024 * 1024,
    });
    steps.push({ id: entry.id, status: result.status });
    if (result.status !== 0) {
      failures.push({
        code: "installed-command-failed",
        command: entry.id,
        message: `installed command ${entry.id} failed after scripts/ isolation\nERROR:\n${result.error ? errorMessage(result.error) : ""}\nSIGNAL:\n${result.signal ?? ""}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
      });
    }
  }
}

function findNode24(): string | undefined {
  const candidates = [
    process.env.NODE24,
    process.env.NODE24_PATH,
    process.execPath,
    path.join(os.homedir(), ".nvm", "versions", "node", "v24.16.0", "bin", "node"),
    path.join(os.homedir(), ".nvm", "versions", "node", "v24.13.1", "bin", "node"),
    "/opt/homebrew/opt/node@24/bin/node",
    "/usr/local/opt/node@24/bin/node",
  ].filter(isNonEmptyString);

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    const version = spawnSync(candidate, ["--version"], { encoding: "utf8" });
    if (version.status === 0 && version.stdout.trim().startsWith("v24.")) return candidate;
  }
  return undefined;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isolatedEnv({
  nodeBin,
  home = process.env.HOME || os.homedir(),
  extraPath = [],
}: {
  nodeBin: string;
  home?: string;
  extraPath?: string[];
}): NodeJS.ProcessEnv {
  const nodePath = path.dirname(nodeBin);
  const basePath = (process.env.PATH || "").split(path.delimiter).filter(Boolean);
  return {
    ...process.env,
    HOME: home,
    npm_config_cache: path.join(home, ".npm"),
    PATH: [...new Set([...extraPath, nodePath, "/usr/bin", "/bin", ...basePath])].join(path.delimiter),
  };
}

function readJson<T>(file: string, failures: Failure[], code: string): T | undefined {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch (error) {
    failures.push({ code, message: `failed to read ${file}: ${errorMessage(error)}` });
    return undefined;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function expectEqual(failures: Failure[], code: string, actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) failures.push({ code, actual, expected, message });
}

function expectScriptIncludes(failures: Failure[], code: string, script: unknown, tokens: readonly string[], message: string) {
  if (typeof script !== "string" || tokens.some((token) => !script.includes(token)) || script.includes("scripts/")) {
    failures.push({ code, actual: script, expectedTokens: tokens, message });
  }
}

function parseImportSpecifiers(content: string): string[] {
  const specifiers: string[] = [];
  for (const match of content.matchAll(/\bfrom\s*["']([^"']+)["']/g)) specifiers.push(match[1]);
  for (const match of content.matchAll(/\bimport\s*["']([^"']+)["']/g)) specifiers.push(match[1]);
  for (const match of content.matchAll(/\bimport\s*\(\s*["']([^"']+)["']/g)) specifiers.push(match[1]);
  return specifiers;
}

function collectFiles(directory: string): string[] {
  const files: string[] = [];
  if (!fs.existsSync(directory)) return files;
  walk(directory, files);
  return files.sort();
}

function walk(current: string, files: string[]) {
  const stat = fs.lstatSync(current);
  if (stat.isSymbolicLink()) return;
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(current)) walk(path.join(current, entry), files);
    return;
  }
  if (stat.isFile()) files.push(current);
}

function toPosix(value: string): string {
  return value.split(path.sep).join("/");
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { json: false, runPack: true, runInstallSmoke: true, runCommandMatrix: true, projectRoot: defaultProjectRoot };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") options.json = true;
    else if (arg === "--skip-pack") options.runPack = false;
    else if (arg === "--skip-install-smoke") options.runInstallSmoke = false;
    else if (arg === "--skip-command-matrix") options.runCommandMatrix = false;
    else if (arg === "--project-root") {
      options.projectRoot = path.resolve(requireValue(argv, index, arg));
      index += 1;
    } else {
      throw new Error(`Unknown check-dist-observation option: ${arg}`);
    }
  }
  return options;
}

function requireValue(argv: string[], index: number, option: string): string {
  const value = argv[index + 1];
  if (!value) throw new Error(`${option} requires a value`);
  return value;
}

function isMainModule(): boolean {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync.native(fileURLToPath(import.meta.url)) === fs.realpathSync.native(process.argv[1]);
  } catch {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  }
}

if (isMainModule()) {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(errorMessage(error));
    process.exit(1);
  }
  const result = checkDistObservation(options);
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else if (result.ok) console.log(`Dist observation gate passed: ${options.projectRoot}`);
  else console.error(result.failures.map((failure) => failure.message).join("\n"));
  if (!result.ok) process.exit(1);
}
