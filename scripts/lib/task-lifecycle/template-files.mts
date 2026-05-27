// @ts-ignore core-shared remains a JS runtime dependency until its migration PR.
import { localizedTemplateSource, longRunningTaskContractFile, visualMapFile, lessonCandidatesFile } from "../core-shared.mjs";

type TemplatePair = [string, string];

export function taskTemplateFiles({ locale = "en-US" } = {}): TemplatePair[] {
  return [
    ["INDEX.md", "templates/planning/INDEX.md"],
    ["brief.md", "templates/planning/brief.md"],
    ["task_plan.md", "templates/planning/task_plan.md"],
    ["execution_strategy.md", "templates/planning/execution_strategy.md"],
    [visualMapFile, "templates/planning/visual_map.md"],
    ["findings.md", "templates/planning/findings.md"],
    [lessonCandidatesFile, "templates/planning/lesson_candidates.md"],
    ["progress.md", "templates/planning/progress.md"],
    ["review.md", "templates/planning/review.md"],
  ].map(([destination, source]) => [destination, localizedTemplateSource(source, locale)] as TemplatePair);
}

export function simpleTaskTemplateFiles({ locale = "en-US" } = {}): TemplatePair[] {
  return [
    ["INDEX.md", "templates/planning/INDEX.md"],
    ["brief.md", "templates/planning/brief.md"],
    ["task_plan.md", "templates/planning/task_plan.md"],
    [visualMapFile, "templates/planning/visual_map.simple.md"],
    ["progress.md", "templates/planning/progress.md"],
  ].map(([destination, source]) => [destination, localizedTemplateSource(source, locale)] as TemplatePair);
}

export function optionalTaskTemplateFiles({ locale = "en-US" } = {}): TemplatePair[] {
  return [
    ["references/INDEX.md", "templates/planning/optional/references/INDEX.md"],
    ["artifacts/INDEX.md", "templates/planning/optional/artifacts/INDEX.md"],
  ].map(([destination, source]) => [destination, localizedTemplateSource(source, locale)] as TemplatePair);
}

export function moduleTemplateFiles({ locale = "en-US" } = {}): TemplatePair[] {
  return [
    ["brief.md", "templates/planning/module_brief.md"],
    ["module_plan.md", "templates/planning/module_plan.md"],
    ["execution_strategy.md", "templates/planning/execution_strategy.md"],
    [visualMapFile, "templates/planning/visual_map.md"],
    ["session_prompt.md", "templates/planning/module_session_prompt.md"],
  ].map(([destination, source]) => [destination, localizedTemplateSource(source, locale)] as TemplatePair);
}

export function taskFilesForBudget({ budget, locale }: { budget?: string; locale?: string }): TemplatePair[] {
  const files = budget === "simple"
    ? simpleTaskTemplateFiles({ locale })
    : budget === "complex"
      ? [...taskTemplateFiles({ locale }), ...optionalTaskTemplateFiles({ locale })]
      : taskTemplateFiles({ locale });
  return [...files, ["walkthrough.md", localizedTemplateSource("templates/planning/walkthrough.md", locale)] as TemplatePair];
}

export function appendLongRunningContractFile(files: TemplatePair[], { locale, longRunning }: { locale?: string; longRunning?: boolean }): TemplatePair[] {
  if (!longRunning) return files;
  return [...files, [longRunningTaskContractFile, localizedTemplateSource("templates/planning/long-running-task-contract.md", locale)]];
}
