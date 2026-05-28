import {
  assertPresetWriteScope,
  buildPresetContext,
  evaluateTemplateValues,
  resolvePresetInputs,
  renderPresetTaskTemplate,
} from "../preset-engine.mjs";
import type {
  LifecycleTarget,
  PresetContext,
  PresetInputs,
  PresetPackage,
} from "../types/task-lifecycle.js";

export function resolveLifecyclePresetInputs(
  presetPackage: PresetPackage,
  { cliArgs, fromSession, targetInput }: { cliArgs: string[]; fromSession: string; targetInput: string },
): PresetInputs {
  return Reflect.apply(resolvePresetInputs, undefined, [presetPackage, { cliArgs, fromSession, targetInput }]) as PresetInputs;
}

export function evaluatePresetValues(
  presetPackage: PresetPackage,
  resolvedInputs: Record<string, unknown>,
  { taskId, taskTitle, moduleKey, target }: { taskId: string; taskTitle: string; moduleKey: string; target: LifecycleTarget },
): Record<string, unknown> {
  return Reflect.apply(evaluateTemplateValues, undefined, [presetPackage, resolvedInputs, { taskId, taskTitle, moduleKey, target }]) as Record<string, unknown>;
}

export function buildLifecyclePresetContext(
  presetPackage: PresetPackage,
  options: {
    target: LifecycleTarget;
    taskDir: string;
    taskId: string;
    taskTitle: string;
    resolvedInputs: Record<string, unknown>;
    evaluatedValues: Record<string, unknown>;
  },
): PresetContext {
  return Reflect.apply(buildPresetContext, undefined, [presetPackage, options]) as PresetContext;
}

export function renderLifecyclePresetTaskTemplate(destination: string, content: string, presetContext: PresetContext | null): string {
  return Reflect.apply(renderPresetTaskTemplate, undefined, [destination, content, presetContext]) as string;
}

export function assertLifecyclePresetWriteScope(presetPackage: PresetPackage, relativePath: string, target: LifecycleTarget): void {
  Reflect.apply(assertPresetWriteScope, undefined, [presetPackage, relativePath, target]);
}
