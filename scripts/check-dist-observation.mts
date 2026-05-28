#!/usr/bin/env node
// @ts-nocheck

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const defaultProjectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function checkDistObservation({
  projectRoot = defaultProjectRoot,
  runPack = true,
  runInstallSmoke = true,
  runCommandMatrix = true,
} = {}) {
  const root = path.resolve(projectRoot);
  const failures = [];
  const observations = {
    packageRuntime: {},
    inventory: {},
    package: {},
    installSmoke: {},
    commandMatrix: [],
  };

  const pkg = readJson(path.join(root, "package.json"), failures, "package-json");
  if (!pkg) return { ok: false, failures, observations };

  expectEqual(failures, "package-bin-not-dist", pkg.bin?.harness, "dist/harness.mjs", "package bin.harness must resolve to dist/harness.mjs");
  const distRuntimeScripts = {
    check: "node dist/harness.mjs check --profile source-package .",
    "check:private": "node dist/harness.mjs check --profile private-harness .harness-private",
    status: "node dist/harness.mjs status --json .",
    dashboard: "node dist/harness.mjs dashboard --out tmp/harness-dashboard.html examples/minimal-project",
    "dashboard:folder": "node dist/harness.mjs dashboard --out-dir tmp/harness-dashboard examples/minimal-project",
    postinstall: "node dist/postinstall.mjs",
    "observe:dist": "node dist/check-dist-observation.mjs --skip-pack --skip-install-smoke",
  };
  for (const [name, expected] of Object.entries(distRuntimeScripts)) {
    expectEqual(failures, `package-script-${name}-not-dist`, pkg.scripts?.[name], expected, `package script ${name} must run from dist`);
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
      const packed = JSON.parse(pack.stdout)[0].files.map((file) => file.path).sort();
      observations.package = {
        entryCount: packed.length,
        hasDistHarness: packed.includes("dist/harness.mjs"),
        hasDistPostinstall: packed.includes("dist/postinstall.mjs"),
        hasDistObservationGate: packed.includes("dist/check-dist-observation.mjs"),
        hasScriptsHarness: packed.includes("scripts/harness.mjs"),
        hasScripts: packed.some((file) => file.startsWith("scripts/")),
        hasTests: packed.some((file) => file.startsWith("tests/")),
      };
      for (const required of ["dist/harness.mjs", "dist/postinstall.mjs", "dist/check-dist-observation.mjs"]) {
        if (!packed.includes(required)) failures.push({ code: "packed-file-missing", file: required, message: `package missing ${required}` });
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

function runMatrix(root, failures, commandMatrix) {
  const distHarness = path.join(root, "dist/harness.mjs");
  const matrix = [
    { id: "help", args: ["--help"] },
    { id: "status", args: ["status", "--json", "."] },
    { id: "task-list", args: ["task-list", "--json", "."] },
    { id: "preset-list", args: ["preset", "list", "--json", "."] },
    { id: "source-check", args: ["check", "--profile", "source-package", "."] },
    { id: "target-check", args: ["check", "--profile", "target-project", "examples/minimal-project"] },
    { id: "migrate-plan", args: ["migrate-plan", "--json", "--limit", "20", "examples/minimal-project"] },
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

function runInstalledPackageSmoke(root, failures, observations) {
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

  const pack = spawnSync("npm", ["pack", "--silent", "--pack-destination", packDir], {
    cwd: root,
    encoding: "utf8",
    env: npmEnv,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (pack.status !== 0) {
    failures.push({ code: "install-smoke-pack-failed", message: `npm pack failed\nSTDOUT:\n${pack.stdout}\nSTDERR:\n${pack.stderr}` });
    return;
  }

  const tarball = path.join(packDir, pack.stdout.trim().split(/\r?\n/).at(-1));
  fs.writeFileSync(path.join(consumer, "package.json"), JSON.stringify({ private: true, type: "module" }, null, 2));
  const install = spawnSync("npm", ["install", "--silent", "--no-audit", "--no-fund", tarball], {
    cwd: consumer,
    encoding: "utf8",
    env: npmEnv,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (install.status !== 0) {
    failures.push({ code: "install-smoke-install-failed", message: `npm install packed tarball failed\nSTDOUT:\n${install.stdout}\nSTDERR:\n${install.stderr}` });
    return;
  }

  const packageRoot = path.join(consumer, "node_modules/coding-agent-harness");
  const bin = path.join(consumer, "node_modules/.bin/harness");
  const pkg = readJson(path.join(packageRoot, "package.json"), failures, "installed-package-json");
  if (!pkg) return;

  const binTarget = fs.existsSync(bin) ? fs.readlinkSync(bin) : "";
  observations.installSmoke = {
    nodeVersion,
    tempRoot,
    binTarget,
    bin: pkg.bin?.harness,
    postinstall: pkg.scripts?.postinstall,
    observeDist: pkg.scripts?.["observe:dist"],
    hasTests: fs.existsSync(path.join(packageRoot, "tests")),
    hasScripts: fs.existsSync(path.join(packageRoot, "scripts")),
    scriptsDisabled: [],
    steps: [],
  };

  expectEqual(failures, "installed-bin-not-dist", pkg.bin?.harness, "dist/harness.mjs", "installed package bin.harness must resolve to dist/harness.mjs");
  expectEqual(failures, "installed-postinstall-not-dist", pkg.scripts?.postinstall, "node dist/postinstall.mjs", "installed package postinstall must resolve to dist/postinstall.mjs");
  expectEqual(failures, "installed-observe-dist-not-dist", pkg.scripts?.["observe:dist"], "node dist/check-dist-observation.mjs --skip-pack --skip-install-smoke", "installed observe:dist must resolve to dist/check-dist-observation.mjs");
  if (!binTarget.includes("dist/harness.mjs")) {
    failures.push({ code: "installed-bin-link-not-dist", message: `installed bin link does not target dist/harness.mjs: ${binTarget}` });
  }
  for (const relative of ["dist/harness.mjs", "dist/postinstall.mjs", "dist/check-dist-observation.mjs"]) {
    if (!fs.existsSync(path.join(packageRoot, relative))) failures.push({ code: "installed-file-missing", file: relative, message: `installed package missing ${relative}` });
  }
  if (observations.installSmoke.hasTests) failures.push({ code: "installed-package-includes-tests", message: "installed package must not include tests/**" });
  if (observations.installSmoke.hasScripts) failures.push({ code: "installed-package-includes-scripts", message: "installed package must not include scripts/** after historical shim deletion" });

  const installedScripts = path.join(packageRoot, "scripts");
  if (fs.existsSync(installedScripts)) {
    fs.renameSync(installedScripts, `${installedScripts}.disabled-by-dist-observation`);
    observations.installSmoke.scriptsDisabled.push("scripts/");
  }

  const runtimeEnv = isolatedEnv({ nodeBin, home, extraPath: [path.join(consumer, "node_modules", ".bin")] });
  runInstalledMatrix(root, runtimeEnv, failures, observations.installSmoke.steps);

  const postinstall = spawnSync(node24, [path.join(packageRoot, "dist/postinstall.mjs")], {
    cwd: packageRoot,
    encoding: "utf8",
    env: { ...runtimeEnv, CODING_AGENT_HARNESS_SKIP_POSTINSTALL: "1" },
  });
  observations.installSmoke.steps.push({ id: "installed-dist-postinstall", status: postinstall.status });
  if (postinstall.status !== 0) failures.push({ code: "installed-postinstall-failed", message: `installed dist postinstall failed\nSTDOUT:\n${postinstall.stdout}\nSTDERR:\n${postinstall.stderr}` });

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
  observations.installSmoke.steps.push({ id: "installed-observation", status: installedObservation.status });
  if (installedObservation.status !== 0) {
    failures.push({ code: "installed-observation-failed", message: `installed observation failed\nSTDOUT:\n${installedObservation.stdout}\nSTDERR:\n${installedObservation.stderr}` });
  } else {
    const installedResult = JSON.parse(installedObservation.stdout);
    observations.installSmoke.observationOk = installedResult.ok;
    if (!installedResult.ok) failures.push({ code: "installed-observation-not-ok", message: JSON.stringify(installedResult.failures, null, 2) });
  }

}

function runInstalledMatrix(root, runtimeEnv, failures, steps) {
  const matrix = [
    { id: "installed-help", cwd: root, args: ["--help"] },
    { id: "installed-status", cwd: root, args: ["status", "--json", "."] },
    { id: "installed-task-list", cwd: root, args: ["task-list", "--json", "."] },
    { id: "installed-preset-list", cwd: root, args: ["preset", "list", "--json", "."] },
    { id: "installed-source-check", cwd: root, args: ["check", "--profile", "source-package", "."] },
    { id: "installed-target-check", cwd: root, args: ["check", "--profile", "target-project", "examples/minimal-project"] },
    { id: "installed-migrate-plan", cwd: root, args: ["migrate-plan", "--json", "--limit", "20", "examples/minimal-project"] },
    { id: "installed-dashboard", cwd: root, args: ["dashboard", "--out-dir", path.join("tmp", `pr-27-installed-observation-dashboard-${process.pid}`), "examples/minimal-project"] },
  ];

  for (const entry of matrix) {
    const result = spawnSync("harness", entry.args, {
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
        message: `installed command ${entry.id} failed after scripts/ isolation\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
      });
    }
  }
}

function findNode24() {
  const candidates = [
    process.env.NODE24,
    process.env.NODE24_PATH,
    process.execPath,
    path.join(os.homedir(), ".nvm", "versions", "node", "v24.16.0", "bin", "node"),
    path.join(os.homedir(), ".nvm", "versions", "node", "v24.13.1", "bin", "node"),
    "/opt/homebrew/opt/node@24/bin/node",
    "/usr/local/opt/node@24/bin/node",
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    const version = spawnSync(candidate, ["--version"], { encoding: "utf8" });
    if (version.status === 0 && version.stdout.trim().startsWith("v24.")) return candidate;
  }
  return undefined;
}

function isolatedEnv({ nodeBin, home = process.env.HOME, extraPath = [] }) {
  return {
    ...process.env,
    HOME: home,
    npm_config_cache: path.join(home, ".npm"),
    PATH: [...extraPath, nodeBin, "/usr/bin", "/bin"].join(path.delimiter),
  };
}

function readJson(file, failures, code) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    failures.push({ code, message: `failed to read ${file}: ${error.message}` });
    return undefined;
  }
}

function expectEqual(failures, code, actual, expected, message) {
  if (actual !== expected) failures.push({ code, actual, expected, message });
}

function parseImportSpecifiers(content) {
  const specifiers = [];
  for (const match of content.matchAll(/\bfrom\s*["']([^"']+)["']/g)) specifiers.push(match[1]);
  for (const match of content.matchAll(/\bimport\s*["']([^"']+)["']/g)) specifiers.push(match[1]);
  for (const match of content.matchAll(/\bimport\s*\(\s*["']([^"']+)["']/g)) specifiers.push(match[1]);
  return specifiers;
}

function collectFiles(directory) {
  const files = [];
  if (!fs.existsSync(directory)) return files;
  walk(directory, files);
  return files.sort();
}

function walk(current, files) {
  const stat = fs.lstatSync(current);
  if (stat.isSymbolicLink()) return;
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(current)) walk(path.join(current, entry), files);
    return;
  }
  if (stat.isFile()) files.push(current);
}

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function parseArgs(argv) {
  const options = { json: false, runPack: true, runInstallSmoke: true, runCommandMatrix: true, projectRoot: defaultProjectRoot };
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

function requireValue(argv, index, option) {
  const value = argv[index + 1];
  if (!value) throw new Error(`${option} requires a value`);
  return value;
}

function isMainModule() {
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
    console.error(error.message);
    process.exit(1);
  }
  const result = checkDistObservation(options);
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else if (result.ok) console.log(`Dist observation gate passed: ${options.projectRoot}`);
  else console.error(result.failures.map((failure) => failure.message).join("\n"));
  if (!result.ok) process.exit(1);
}
