import {
  checkPresetPackage,
  inspectPresetPackage,
  installPresetPackage,
  listPresetPackages,
  uninstallPresetPackage,
} from "../lib/harness-core.mjs";

export function runPresetCommand({ args, takeFlag }) {
  const subcommand = args.shift() || "list";
  const json = takeFlag("--json");
  try {
    if (subcommand === "list") {
      const presets = listPresetPackages().map((preset) => ({
        id: preset.id,
        version: preset.version,
        purpose: preset.purpose,
        compatibleBudgets: preset.compatibleBudgets,
        source: preset.source,
        manifestPath: preset.manifestRelativePath,
      }));
      if (json) console.log(JSON.stringify({ presets }, null, 2));
      else for (const preset of presets) console.log(`${preset.id}@${preset.version} [${preset.source}] ${preset.compatibleBudgets.join(",")}`);
    } else if (subcommand === "inspect") {
      const id = args.shift();
      if (!id) throw new Error("Missing preset id");
      const preset = inspectPresetPackage(id);
      if (json) console.log(JSON.stringify(preset, null, 2));
      else console.log(`${preset.id}@${preset.version}\n${preset.purpose}`);
    } else if (subcommand === "check") {
      const id = args.shift();
      if (!id) throw new Error("Missing preset id");
      const report = checkPresetPackage(id);
      if (json) console.log(JSON.stringify(report, null, 2));
      else {
        for (const failure of report.failures) console.error(`Failure: ${failure}`);
        for (const warning of report.warnings) console.log(`Warning: ${warning}`);
        console.log(`Preset check ${report.status}: ${report.id}@${report.version}`);
      }
      process.exit(report.status === "pass" ? 0 : 1);
    } else if (subcommand === "install") {
      const force = takeFlag("--force");
      const source = args.shift();
      if (!source) throw new Error("Missing preset source");
      const result = installPresetPackage(source, { force });
      if (json) console.log(JSON.stringify(result, null, 2));
      else console.log(`Installed preset ${result.id}@${result.version} to ${result.destination}`);
    } else if (subcommand === "uninstall") {
      const id = args.shift();
      if (!id) throw new Error("Missing preset id");
      const result = uninstallPresetPackage(id);
      if (json) console.log(JSON.stringify(result, null, 2));
      else console.log(`${result.removed ? "Removed" : "Preset not installed"}: ${result.id}`);
    } else {
      throw new Error(`Unknown preset subcommand: ${subcommand}`);
    }
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
