import {
  buildMigrationPlan,
  runMigration,
  verifyMigrationSession,
} from "../lib/harness-core.mjs";

export function runMigrationCommand(command, { args, takeFlag, takeOption, targetArg }) {
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
      console.error(error.message);
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
      console.error(error.message);
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
