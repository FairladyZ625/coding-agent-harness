export type FlagType = "boolean" | "string" | "string[]";

export type FlagDefinition = {
  name: string;
  type: FlagType;
  description: string;
  default?: boolean | string | string[];
  alias?: string;
};

export type ParsedCommandArgs = {
  flags: Record<string, boolean>;
  options: Record<string, string>;
  repeated: Record<string, string[]>;
  positionals: string[];
};

export type CommandDefinition = {
  name: string;
  description: string;
  usage?: string;
  flags?: FlagDefinition[];
  hasTarget?: boolean;
  positionals?: string[];
  handler: (ctx: CommandContext) => void | Promise<void>;
};

export type CommandContext = {
  definition: CommandDefinition;
  args: ParsedCommandArgs;
  raw: string[];
  target: string;
  takeFlag: (name: string, fallback?: boolean) => boolean;
  takeOption: (name: string, fallback?: string) => string;
  targetArg: () => string;
};

export type ArgReaders = Pick<CommandContext, "takeFlag" | "takeOption" | "targetArg">;

const HELP_NOTES = `If init runs in an interactive terminal and --locale is omitted, it asks for a
language. Non-interactive init defaults to en-US.

Preset discovery:
  Project presets live in <target>/.coding-agent-harness/presets/<preset-id>/.
  User presets live in ~/.coding-agent-harness/presets/<preset-id>/.
  Harness discovers project presets first when a target is supplied, then user
  presets, then bundled package presets under presets/<preset-id>/.
  "harness init" seeds bundled presets into the target project. "harness
  install-user" and npm postinstall seed bundled presets into the user root.
  Use "harness preset seed" to repair or re-run preset seeding.
  Use "harness preset install" with a local preset folder, .zip archive, or
  bundled preset id. Preset archives must contain preset.yaml at the archive
  root or inside one top-level folder.
  Use "harness preset list --json" to see available presets, their source,
  purpose, compatible budgets, and manifest path. Use "harness preset inspect
  <id> --json" for the full preset manifest summary.

Module workflow:
  Registered modules are stored in the root harness.yaml under modules.items.
  "harness module register" writes YAML, creates module brief.md/module_plan.md,
  and regenerates planning/modules/Module-Registry.md as a read-only view.
  "harness module scaffold" repairs only module-owned root docs; task execution
  files stay under planning/modules/<key>/tasks/<task-id>/.
  "harness new-task --module <key>" creates a module task and applies the module
  task preset by default. Unknown modules must be registered first, or use
  --register-module with --module-title/--module-prefix/--module-scope.`;

export function dispatchCommand(registry: readonly CommandDefinition[], argv: readonly string[]): Promise<void> | void {
  if (isTopLevelHelpRequest(argv)) {
    console.log(generateCommandHelp(registry));
    return;
  }

  const resolved = resolveCommand(registry, argv);
  if (!resolved) {
    console.log(generateCommandHelp(registry));
    process.exit(2);
  }

  if (isCommandHelpRequest(resolved.raw)) {
    console.log(generateCommandHelp(registry));
    return;
  }

  return resolved.definition.handler(createCommandContext(resolved.definition, resolved.raw));
}

export function resolveCommand(
  registry: readonly CommandDefinition[],
  argv: readonly string[],
): { definition: CommandDefinition; raw: string[] } | null {
  const sorted = [...registry].sort((left, right) => commandWordCount(right.name) - commandWordCount(left.name));
  for (const definition of sorted) {
    const words = definition.name.split(" ");
    if (words.every((word, index) => argv[index] === word)) {
      return { definition, raw: [...argv.slice(words.length)] };
    }
  }
  return null;
}

export function createCommandContext(definition: CommandDefinition, raw: readonly string[]): CommandContext {
  const mutableArgs = [...raw];
  const readers = createArgReaders(mutableArgs);
  const parsed = parseCommandArgs(definition.flags || [], raw);
  return {
    definition,
    args: parsed,
    raw: [...raw],
    target: definition.hasTarget === false ? "." : targetFromArgsAfterKnownFlags(definition.flags || [], raw),
    ...readers,
  };
}

export function createArgReaders(args: string[]): ArgReaders {
  return {
    takeFlag(name: string, fallback = false): boolean {
      const index = args.indexOf(name);
      if (index < 0) return fallback;
      args.splice(index, 1);
      return true;
    },
    takeOption(name: string, fallback = ""): string {
      return takeOptionFromArgs(args, name, fallback);
    },
    targetArg(): string {
      return trailingTargetArg(args);
    },
  };
}

export function parseCommandArgs(flags: readonly FlagDefinition[], argv: readonly string[]): ParsedCommandArgs {
  const result: ParsedCommandArgs = { flags: {}, options: {}, repeated: {}, positionals: [] };
  for (const flag of flags) {
    const key = flagKey(flag.name);
    if (flag.default === undefined) continue;
    if (flag.type === "boolean") result.flags[key] = Boolean(flag.default);
    else if (flag.type === "string[]") result.repeated[key] = Array.isArray(flag.default) ? flag.default.map(String) : [];
    else result.options[key] = String(flag.default);
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const definition = flags.find((flag) => flag.name === arg || flag.alias === arg);
    if (!definition) {
      if (!arg.startsWith("-")) result.positionals.push(arg);
      continue;
    }
    const key = flagKey(definition.name);
    if (definition.type === "boolean") {
      result.flags[key] = true;
      continue;
    }
    const fallback = definition.default === undefined || Array.isArray(definition.default) ? "" : String(definition.default);
    const value = argv[index + 1] || fallback;
    if (definition.type === "string[]") {
      result.repeated[key] = result.repeated[key] || [];
      result.repeated[key].push(value);
    } else {
      result.options[key] = value;
    }
    index += 1;
  }

  return result;
}

export function takeOptionFromArgs(args: string[], name: string, fallback = ""): string {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1] || fallback;
  args.splice(index, 2);
  return value;
}

export function takeRepeatedOptionsFromArgs(args: string[], flag: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length;) {
    if (args[index] !== flag) {
      index += 1;
      continue;
    }
    const value = args[index + 1] || "";
    args.splice(index, 2);
    if (!value) throw new Error(`${flag} requires a value`);
    values.push(value);
  }
  return values;
}

export function generateCommandHelp(registry: readonly CommandDefinition[]): string {
  const usageLines: string[] = [];
  const seenUsages = new Set<string>();
  for (const command of registry) {
    const usage = command.usage || buildUsage(command);
    if (seenUsages.has(usage)) continue;
    seenUsages.add(usage);
    usageLines.push(`  ${usage}`);
  }
  const lines = [
    "Coding Agent Harness",
    "",
    "Usage:",
    ...usageLines,
    "",
    HELP_NOTES,
  ];
  return `${lines.join("\n")}\n`;
}

export function validateCommandRegistry(registry: readonly CommandDefinition[]): string[] {
  const issues: string[] = [];
  const seenCommands = new Set<string>();

  for (const command of registry) {
    if (!command.name.trim()) issues.push("command has empty name");
    if (seenCommands.has(command.name)) issues.push(`duplicate command name: ${command.name}`);
    seenCommands.add(command.name);
    if (!command.description.trim()) issues.push(`${command.name}: missing description`);
    if (typeof command.handler !== "function") issues.push(`${command.name}: missing handler`);

    const seenFlags = new Set<string>();
    for (const flag of command.flags || []) {
      if (!flag.name.startsWith("--")) issues.push(`${command.name}: flag must use -- prefix: ${flag.name}`);
      if (seenFlags.has(flag.name)) issues.push(`${command.name}: duplicate flag ${flag.name}`);
      seenFlags.add(flag.name);
      if (flag.alias) {
        if (seenFlags.has(flag.alias)) issues.push(`${command.name}: duplicate flag alias ${flag.alias}`);
        seenFlags.add(flag.alias);
      }
      if (!flag.description.trim()) issues.push(`${command.name}: ${flag.name} missing description`);
    }
  }

  return issues;
}

function isTopLevelHelpRequest(argv: readonly string[]): boolean {
  return argv.length === 0 || argv[0] === "help" || argv[0] === "--help" || argv[0] === "-h";
}

function isCommandHelpRequest(raw: readonly string[]): boolean {
  return raw[0] === "help" || raw.includes("--help") || raw.includes("-h");
}

function buildUsage(command: CommandDefinition): string {
  const positionals = (command.positionals || []).map((positional) => `<${positional}>`);
  const flags = (command.flags || []).map((flag) => `[${flag.name}${flag.type === "boolean" ? "" : " value"}]`);
  const target = command.hasTarget === false ? [] : ["[target]"];
  return ["harness", command.name, ...positionals, ...flags, ...target].join(" ");
}

function targetFromArgsAfterKnownFlags(flags: readonly FlagDefinition[], argv: readonly string[]): string {
  const args = [...argv];
  for (const flag of flags) {
    if (flag.type === "boolean") {
      removeBooleanFlag(args, flag.name);
      if (flag.alias) removeBooleanFlag(args, flag.alias);
    } else {
      removeOption(args, flag.name);
      if (flag.alias) removeOption(args, flag.alias);
    }
  }
  return trailingTargetArg(args);
}

function removeBooleanFlag(args: string[], name: string): void {
  for (let index = args.indexOf(name); index >= 0; index = args.indexOf(name)) args.splice(index, 1);
}

function removeOption(args: string[], name: string): void {
  for (let index = args.indexOf(name); index >= 0; index = args.indexOf(name)) args.splice(index, 2);
}

function trailingTargetArg(args: readonly string[]): string {
  const candidate = args[args.length - 1] || "";
  return candidate && !candidate.startsWith("-") ? candidate : ".";
}

function flagKey(name: string): string {
  return name.replace(/^-+/, "");
}

function commandWordCount(name: string): number {
  return name.split(" ").length;
}
