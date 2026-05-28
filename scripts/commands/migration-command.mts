import {
  applyStructureMigration,
  buildMigrationPlan,
  planStructureMigration,
  runMigration,
  verifyMigrationSession,
} from "../lib/harness-core.mjs";
import {
  applyTaskAuditIndexMigration,
  planTaskAuditIndexMigration,
} from "../lib/task-audit-migration.mjs";

type FlagReader = (name: string, fallback?: boolean) => boolean;
type OptionReader = (name: string, fallback?: string) => string;
type TargetReader = () => string;

export function runMigrationCommand(command: string, { args, takeFlag, takeOption, targetArg }: { args: string[]; takeFlag: FlagReader; takeOption: OptionReader; targetArg: TargetReader }) {
  if (command === "migrate-structure") {
    const json = takeFlag("--json");
    const apply = takeFlag("--apply");
    const planOnly = takeFlag("--plan");
    const force = takeFlag("--force");
    try {
      const shouldApply = apply && !planOnly;
      const result = apply && !planOnly
        ? applyStructureMigration(targetArg(), { force })
        : planStructureMigration(targetArg());
      if (json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`Structure migration ${shouldApply ? "applied" : "plan"}: ${result.target}`);
        console.log(`manifest: ${result.manifest}`);
        console.log(`actions: ${result.summary.actions}`);
        for (const action of result.actions || []) console.log(`- ${action.action}: ${action.source || "(none)"} -> ${action.destination}`);
      }
    } catch (error) {
      console.error(errorMessage(error));
      process.exit(1);
    }
    return;
  }

  if (command === "migrate-task-audit-index") {
    const json = takeFlag("--json");
    const apply = takeFlag("--apply");
    const planOnly = takeFlag("--plan");
    try {
      const result = apply && !planOnly
        ? applyTaskAuditIndexMigration(targetArg())
        : planTaskAuditIndexMigration(targetArg());
      if (json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`Task audit INDEX migration ${result.result}: ${result.target}`);
        console.log(`actions: ${result.summary.actions}`);
        console.log(`legacy audit blocks: ${result.summary.legacyAuditBlocks}`);
        console.log(`failures: ${result.summary.failures}`);
        for (const action of result.actions || []) console.log(`- ${action.taskId}: ${action.legacyBlocks.join(", ")}`);
        for (const failure of result.failures || []) console.error(`Failure: ${failure.taskId}: ${failure.failure}`);
      }
      process.exit(result.failures?.length ? 1 : 0);
    } catch (error) {
      const plan = readProperty(error, "plan");
      if (json && plan) console.error(JSON.stringify(plan, null, 2));
      else console.error(errorMessage(error));
      process.exit(1);
    }
  }

  if (command === "migrate-plan") {
    const json = takeFlag("--json");
    const limit = Number.parseInt(takeOption("--limit", "20"), 10) || 20;
    try {
      const plan = buildMigrationPlan(targetArg(), { limit });
      if (json) {
        console.log(JSON.stringify(plan, null, 2));
      } else {
        console.log(`Migration Plan: ${plan.target}`);
        console.log(`mode: ${plan.mode}`);
        console.log(`warnings: ${plan.summary.warnings}`);
        console.log(`task actions: ${plan.summary.taskActions}`);
        console.log(`visual map actions: ${plan.summary.visualMapActions}`);
        console.log(`legacy visual-only tasks: ${plan.summary.legacyVisualOnly}`);
        console.log(`weak briefs: ${plan.summary.weakBrief}`);
        console.log(`unknown classifications: ${plan.summary.unknownClassification}`);
        console.log(`full cutover eligible: ${plan.summary.fullCutoverEligible ? "yes" : "no"}`);
        console.log(`review actions: ${plan.summary.reviewSchemaGaps}`);
        console.log(`legacy actions: ${plan.summary.legacyReferenceGaps}`);
        console.log(`legacy residuals: ${plan.summary.legacyResiduals}`);
        console.log(`recommended capabilities: ${plan.summary.recommendedCapabilities.join(", ") || "none"}`);
        console.log("\nPhases:");
        for (const phase of plan.phases) console.log(`- ${phase.id}: ${phase.title}`);
        console.log("\nTop task actions:");
        for (const action of plan.taskActions) console.log(`- ${action.taskId}: add ${action.files.join(", ")}`);
        console.log("\nTop review actions:");
        for (const action of plan.reviewActions) console.log(`- ${action.path}: add ${action.missing.join(", ")}`);
        console.log("\nTop legacy residuals:");
        for (const action of plan.legacyResiduals) console.log(`- ${action.taskId}: ${action.missing} (${action.reason})`);
        console.log("\nNext commands:");
        for (const next of plan.nextCommands) console.log(`- ${next}`);
      }
    } catch (error) {
      console.error(errorMessage(error));
      process.exit(1);
    }
    return;
  }

  if (command === "migrate-run") {
    const locale = takeOption("--locale", "");
    const assumeLocale = takeFlag("--assume-locale");
    const allowDirty = takeFlag("--allow-dirty");
    const planOnly = takeFlag("--plan-only");
    const outDir = takeOption("--out-dir", "");
    const sessionDir = takeOption("--session-dir", "");
    try {
      console.log(
        JSON.stringify(
          runMigration(targetArg(), {
            locale,
            assumeLocale,
            allowDirty,
            planOnly,
            outDir,
            sessionDir,
          }),
          null,
          2,
        ),
      );
    } catch (error) {
      console.error(errorMessage(error));
      process.exit(1);
    }
    return;
  }

  if (command === "migrate-verify") {
    const json = takeFlag("--json");
    const fullCutover = takeFlag("--full-cutover");
    const sessionPath = args.shift();
    if (!sessionPath) {
      console.error("Missing session.json path");
      process.exit(2);
    }
    const result = verifyMigrationSession(sessionPath, { fullCutover });
    if (json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      for (const failure of result.failures) console.error(`Failure: ${failure}`);
      for (const warning of result.warnings) console.log(`Warning: ${warning}`);
      console.log(`Migration verify ${result.status}: ${result.sessionPath}`);
    }
    process.exit(result.status === "pass" ? 0 : 1);
  }

  throw new Error(`Unsupported migration command: ${command}`);
}

function readProperty(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
