import { localizedTemplateSource, longRunningTaskContractFile, visualMapFile, lessonCandidatesFile } from "../core-shared.mjs";

export function taskTemplateFiles({ locale = "en-US" } = {}) {
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
  ].map(([destination, source]) => [destination, localizedTemplateSource(source, locale)]);
}

export function simpleTaskTemplateFiles({ locale = "en-US" } = {}) {
  return [
    ["INDEX.md", "templates/planning/INDEX.md"],
    ["brief.md", "templates/planning/brief.md"],
    ["task_plan.md", "templates/planning/task_plan.md"],
    [visualMapFile, "templates/planning/visual_map.simple.md"],
    ["progress.md", "templates/planning/progress.md"],
  ].map(([destination, source]) => [destination, localizedTemplateSource(source, locale)]);
}

export function optionalTaskTemplateFiles({ locale = "en-US" } = {}) {
  return [
    ["references/INDEX.md", "templates/planning/optional/references/INDEX.md"],
    ["artifacts/INDEX.md", "templates/planning/optional/artifacts/INDEX.md"],
  ].map(([destination, source]) => [destination, localizedTemplateSource(source, locale)]);
}

export function moduleTemplateFiles({ locale = "en-US" } = {}) {
  return [
    ["brief.md", "templates/planning/module_brief.md"],
    ["module_plan.md", "templates/planning/module_plan.md"],
    ["execution_strategy.md", "templates/planning/execution_strategy.md"],
    [visualMapFile, "templates/planning/visual_map.md"],
    ["session_prompt.md", "templates/planning/module_session_prompt.md"],
  ].map(([destination, source]) => [destination, localizedTemplateSource(source, locale)]);
}

export function taskFilesForBudget({ budget, locale }) {
  if (budget === "simple") return simpleTaskTemplateFiles({ locale });
  if (budget === "complex") return [...taskTemplateFiles({ locale }), ...optionalTaskTemplateFiles({ locale })];
  return taskTemplateFiles({ locale });
}

export function appendLongRunningContractFile(files, { locale, longRunning }) {
  if (!longRunning) return files;
  return [...files, [longRunningTaskContractFile, localizedTemplateSource("templates/planning/long-running-task-contract.md", locale)]];
}
