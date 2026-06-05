#!/usr/bin/env node

import fs from "node:fs";
import { fileURLToPath } from "node:url";

import {
  evaluateTaskKernelCutoverEvidenceEnvelope,
  getTaskKernelCutoverGateProfile,
  type TaskKernelCutoverEvidenceEnvelope,
  type TaskKernelCutoverProfile,
} from "./lib/task-kernel-cutover-gate-profile.mjs";

type CliArgs = {
  envelopePath?: string;
  json: boolean;
  profile?: TaskKernelCutoverProfile;
};

function parseArgs(argv: string[]): CliArgs {
  const parsed: CliArgs = { json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      parsed.json = true;
    } else if (arg === "--profile") {
      parsed.profile = parseProfile(readArgValue(argv, ++index, arg));
    } else if (arg === "--envelope") {
      parsed.envelopePath = readArgValue(argv, ++index, arg);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return parsed;
}

function parseProfile(value: string): TaskKernelCutoverProfile {
  if (value === "TK11") return value;
  throw new Error(`Unsupported Task Kernel cutover profile: ${value}`);
}

function readArgValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (!value) throw new Error(`${flag} requires a value`);
  return value;
}

function readEnvelope(envelopePath: string): TaskKernelCutoverEvidenceEnvelope {
  const parsed = JSON.parse(fs.readFileSync(envelopePath, "utf8")) as TaskKernelCutoverEvidenceEnvelope;
  if (parsed.schemaVersion !== "task-kernel-cutover-evidence-envelope/v1") {
    throw new Error(`Unsupported evidence envelope schema: ${String(parsed.schemaVersion)}`);
  }
  return parsed;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.envelopePath) {
      const evaluation = evaluateTaskKernelCutoverEvidenceEnvelope(readEnvelope(args.envelopePath));
      if (args.json) console.log(JSON.stringify(evaluation, null, 2));
      else if (evaluation.readyForTk12) console.log(`${evaluation.profile} Task Kernel cutover gate evidence passed`);
      else console.error(evaluation.findings.map((finding) => finding.message).join("\n"));
      process.exit(evaluation.readyForTk12 ? 0 : 1);
    }
    if (!args.profile) throw new Error("--profile is required when --envelope is not provided");
    const profile = getTaskKernelCutoverGateProfile(args.profile);
    if (args.json) {
      console.log(JSON.stringify({ schemaVersion: "task-kernel-cutover-gate-profile/v1", profile: args.profile, gates: profile }, null, 2));
    } else {
      console.log(profile.map((gate) => `${gate.id}: ${gate.commands.join(" && ")}`).join("\n"));
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
