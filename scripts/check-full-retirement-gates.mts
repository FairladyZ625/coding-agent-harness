#!/usr/bin/env node

import fs from "node:fs";
import { fileURLToPath } from "node:url";

import {
  evaluateGateEvidenceEnvelope,
  getFullRetirementGateProfile,
  type FullRetirementPhase,
  type GateEvidenceEnvelope,
} from "./lib/full-retirement-gate-profile.mjs";

type CliArgs = {
  envelopePath?: string;
  json: boolean;
  phase?: FullRetirementPhase;
};

function parseArgs(argv: string[]): CliArgs {
  const parsed: CliArgs = { json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      parsed.json = true;
    } else if (arg === "--phase") {
      parsed.phase = parsePhase(readArgValue(argv, ++index, arg));
    } else if (arg === "--envelope") {
      parsed.envelopePath = readArgValue(argv, ++index, arg);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return parsed;
}

function parsePhase(value: string): FullRetirementPhase {
  if (["P10", "P11", "P12", "P13"].includes(value)) return value as FullRetirementPhase;
  throw new Error(`Unsupported phase: ${value}`);
}

function readArgValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (!value) throw new Error(`${flag} requires a value`);
  return value;
}

function readEnvelope(envelopePath: string): GateEvidenceEnvelope {
  const parsed = JSON.parse(fs.readFileSync(envelopePath, "utf8")) as GateEvidenceEnvelope;
  if (parsed.schemaVersion !== "full-retirement-evidence-envelope/v1") {
    throw new Error(`Unsupported evidence envelope schema: ${String(parsed.schemaVersion)}`);
  }
  return parsed;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.envelopePath) {
      const evaluation = evaluateGateEvidenceEnvelope(readEnvelope(args.envelopePath));
      if (args.json) console.log(JSON.stringify(evaluation, null, 2));
      else if (evaluation.readyForAgentReview) console.log(`${evaluation.phase} full-retirement gate evidence passed`);
      else {
        console.error(evaluation.findings.map((finding) => finding.message).join("\n"));
      }
      process.exit(evaluation.readyForAgentReview ? 0 : 1);
    }
    if (!args.phase) throw new Error("--phase is required when --envelope is not provided");
    const profile = getFullRetirementGateProfile(args.phase);
    if (args.json) console.log(JSON.stringify({ schemaVersion: "full-retirement-gate-profile/v1", phase: args.phase, gates: profile }, null, 2));
    else console.log(profile.map((gate) => `${gate.id}: ${gate.command}`).join("\n"));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
