#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = process.env.HARNESS_TEST_REPO_ROOT || path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
type ImportGraphNode = {
  path: string;
  imports: Array<{ target?: string }>;
  reachableFromBin?: boolean;
  reachableFromHarnessCore?: boolean;
  barrelReachable?: boolean;
  layer: number;
};
type ImportGraph = {
  architectureContract: {
    version: string;
    layers: { id: string; owns: string[]; mayImport: string[] }[];
    phaseOpenExceptions: { id: string; source: string; target: string; ownerPhase: string; expiryPhase: string; reason?: string; evidence?: string }[];
    sharedFileLocks: { path: string; ownerPhase: string; reason: string }[];
    boundaryRules: string[];
  };
  summary: {
    fileCount: number;
    localEdgeCount: number;
    unresolvedLocalEdges: number;
    cycleNodes: number;
    runtimeMjsToTsEdges: number;
    typesValueImports: number;
    architectureBoundaryViolations: number;
    taskRepositoryIdentityViolations: number;
  };
  nodes: ImportGraphNode[];
};
type ImportGraphViolation = { code: string; message: string };
type ImportGraphCheck = {
  ok: boolean;
  violations: ImportGraphViolation[];
};
type ImportGraphApi = {
  buildImportGraph(options: { repoRoot: string }): ImportGraph;
  checkImportGraph(options: { repoRoot: string; expectNodes?: number; expectEdges?: number }): ImportGraphCheck;
};
const { buildImportGraph, checkImportGraph } = await import(pathToFileURL(path.join(repoRoot, "dist/check-import-graph.mjs")).href) as ImportGraphApi;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function writeFixture(root: string, relativePath: string, content: string): void {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content);
}

function nodeByPath(graph: ImportGraph, relativePath: string): ImportGraphNode {
  const node = graph.nodes.find((candidate) => candidate.path === relativePath);
  assert(node, `missing graph node ${relativePath}`);
  return node;
}

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "harness-import-graph-"));

writeFixture(
  fixtureRoot,
  "scripts/harness.mjs",
  'import { core } from "./lib/harness-core.mjs";\nawait import("./commands/task-command.mjs");\nconsole.log(core);\n',
);
writeFixture(fixtureRoot, "scripts/commands/task-command.mjs", 'import { leaf } from "../lib/leaf.mjs";\nconsole.log(leaf);\n');
writeFixture(fixtureRoot, "scripts/lib/harness-core.mjs", 'export { leaf } from "./leaf.mjs";\nexport { helper } from "./nested/helper.mjs";\n');
writeFixture(fixtureRoot, "scripts/lib/leaf.mjs", "export const leaf = 1;\n");
writeFixture(fixtureRoot, "scripts/lib/nested/helper.mjs", "export const helper = 2;\n");
writeFixture(fixtureRoot, "scripts/lib/types/protocol.ts", "export type Protocol = { id: string };\n");
writeFixture(fixtureRoot, "scripts/infrastructure/kernel/path-utils.mts", "export const value = 1;\n");
writeFixture(fixtureRoot, "scripts/domain/task/model.mts", 'import { value } from "../../infrastructure/kernel/path-utils.mjs";\nexport const model = value;\n');
writeFixture(fixtureRoot, "scripts/application/task/use-case.mts", 'import { model } from "../../domain/task/model.mjs";\nexport const useCase = model;\n');
writeFixture(fixtureRoot, "scripts/adapters/cli/task-adapter.mts", 'import { useCase } from "../../application/task/use-case.mjs";\nexport const adapter = useCase;\n');
writeFixture(
  fixtureRoot,
  "tests/type-consumer.ts",
  'import type { Protocol } from "../scripts/lib/' + 'types/protocol' + '.js";\nconst value: Protocol = { id: "ok" };\n',
);

const graph = buildImportGraph({ repoRoot: fixtureRoot });
const repoGraph = buildImportGraph({ repoRoot });
const harnessCoreSource = fs.readFileSync(path.join(repoRoot, "scripts/lib/harness-core.mts"), "utf8");
const taskOperationsSource = fs.readFileSync(path.join(repoRoot, "scripts/application/task/task-operations.mts"), "utf8");
const taskLifecycleSource = fs.readFileSync(path.join(repoRoot, "scripts/lib/task-lifecycle.mts"), "utf8");
const statusBuilderSource = fs.readFileSync(path.join(repoRoot, "scripts/lib/status-builder.mts"), "utf8");
const dashboardWorkbenchSource = fs.readFileSync(path.join(repoRoot, "scripts/lib/dashboard-workbench.mts"), "utf8");
const taskTombstoneCommandsSource = fs.readFileSync(path.join(repoRoot, "scripts/lib/task-tombstone-commands.mts"), "utf8");
const taskIndexSource = fs.readFileSync(path.join(repoRoot, "scripts/lib/task-index.mts"), "utf8");
const checkProfilesSource = fs.readFileSync(path.join(repoRoot, "scripts/lib/check-profiles.mts"), "utf8");
const checkTaskContractsSource = fs.readFileSync(path.join(repoRoot, "scripts/lib/check-task-contracts.mts"), "utf8");
const governanceIndexGeneratorSource = fs.readFileSync(path.join(repoRoot, "scripts/lib/governance-index-generator.mts"), "utf8");
const dashboardDataSource = fs.readFileSync(path.join(repoRoot, "scripts/lib/dashboard-data.mts"), "utf8");
const governanceSyncSource = fs.readFileSync(path.join(repoRoot, "scripts/lib/governance-sync.mts"), "utf8");
const lessonMaintenanceSource = fs.readFileSync(path.join(repoRoot, "scripts/lib/lesson-maintenance.mts"), "utf8");
const moduleRegistrySource = fs.readFileSync(path.join(repoRoot, "scripts/lib/module-registry.mts"), "utf8");
const reviewConfirmSource = fs.readFileSync(path.join(repoRoot, "scripts/lib/task-lifecycle/review-confirm.mts"), "utf8");
const checkProfilesTypesSource = fs.readFileSync(path.join(repoRoot, "scripts/lib/types/check-profiles.ts"), "utf8");
const taskRepositorySource = fs.readFileSync(path.join(repoRoot, "scripts/lib/task-repository.mts"), "utf8");
const taskRepositoryTypesSource = fs.readFileSync(path.join(repoRoot, "scripts/lib/types/task-repository.ts"), "utf8");
const taskSubjectsSource = fs.readFileSync(path.join(repoRoot, "scripts/domain/task/task-subjects.mts"), "utf8");
const taskSemanticProjectionSource = fs.readFileSync(path.join(repoRoot, "scripts/lib/task-semantic-projection.mts"), "utf8");
const statusProjectionReaderSource = taskRepositorySource.match(/export function createTaskStatusProjectionReader[\s\S]*?\n}\n/)?.[0] || "";
const checkProfileReaderSource = taskRepositorySource.match(/export function createTaskCheckProfileReader[\s\S]*?\n}\n/)?.[0] || "";
const taskIndexProjectionReaderSource = taskRepositorySource.match(/export function createTaskIndexProjectionReader[\s\S]*?\n}\n/)?.[0] || "";
const taskGovernanceProjectionReaderSource = taskRepositorySource.match(/export function createTaskGovernanceProjectionReader[\s\S]*?\n}\n/)?.[0] || "";
const taskPlanContractReaderSource = taskRepositorySource.match(/export function createTaskPlanContractReader[\s\S]*?\n}\n/)?.[0] || "";
const taskLessonPromotionReaderSource = taskRepositorySource.match(/export function createTaskLessonPromotionReader[\s\S]*?\n}\n/)?.[0] || "";
const taskModuleReferenceReaderSource = taskRepositorySource.match(/export function createTaskModuleReferenceReader[\s\S]*?\n}\n/)?.[0] || "";
const resolveTaskDirectorySource = taskRepositorySource.match(/export function resolveTaskDirectory[\s\S]*?\n}\n/)?.[0] || "";
const broadTaskRepositoryTypeSource = taskRepositorySource.match(/export type TaskRepository =[\s\S]*?\n};/)?.[0] || "";
const lifecycleReviewTaskByDirectorySource = taskLifecycleSource.match(/function findReviewTaskByDirectory[\s\S]*?\n}\n/)?.[0] || "";
assert(!harnessCoreSource.includes("./task-operation-subjects.mjs"), "scanner-backed TaskOperationSubjectReader helper should not be re-exported from the broad harness-core barrel");
assert(!harnessCoreSource.includes("../domain/task/task-subjects.mjs"), "task subject domain mapper should not be re-exported from the broad harness-core barrel");
assert(harnessCoreSource.includes("../infrastructure/task/legacy-task-operation-writers.mjs"), "harness-core should expose the legacy writer adapter needed for package-facing TaskOperations composition");
assert(!fs.existsSync(path.join(repoRoot, "scripts/lib/task-operation-subjects.mts")), "scanner-backed TaskOperationSubjectReader helper should not live in scripts/lib");
assert(!taskOperationsSource.includes("../../lib/task-lifecycle.mjs"), "TaskOperations should consume injected writer ports instead of importing the legacy lifecycle writer");
assert(!taskOperationsSource.includes("../../lib/task-lesson-sedimentation.mjs"), "TaskOperations should consume injected writer ports instead of importing the legacy lesson writer");
assert(!taskLifecycleSource.includes("createScannerTaskRepository"), "task-lifecycle should consume the narrow lifecycle reader instead of the broad scanner-backed repository");
assert(!resolveTaskDirectorySource.includes("createScannerTaskRepository"), "task lifecycle resolver handoff should not route resolveTaskDirectory through the broad scanner-backed repository identity");
assert(!broadTaskRepositoryTypeSource.includes("listLifecycleTasks") && !broadTaskRepositoryTypeSource.includes("getLifecycleTaskByDirectory"), "TaskLifecycleReader should stay separate instead of widening the broad TaskRepository identity");
assert(!statusBuilderSource.includes("createScannerTaskRepository"), "status-builder should consume task status projections instead of creating the scanner-backed repository");
assert(!taskIndexSource.includes("createScannerTaskRepository"), "task-index should consume task-index projections instead of creating the broad scanner-backed repository");
assert(!taskIndexSource.includes("TaskRecord"), "task-index should not import or retype raw scanner TaskRecord objects");
assert(!taskIndexSource.includes("task-semantic-projection"), "task-index should consume materialized visibility scopes instead of reinterpreting raw task visibility facts");
assert(taskIndexSource.includes("createTaskIndexProjectionReader"), "task-index should compose through the task-index projection reader seam");
assert(!checkProfilesSource.includes("createScannerTaskRepository"), "check-profiles should consume a narrow checker reader instead of creating the broad scanner-backed repository");
assert(!checkProfilesSource.includes("createTaskStatusProjectionReader"), "check-profiles should not consume the broad status/dashboard projection for checker validation");
assert(checkProfilesSource.includes("createTaskCheckProfileReader"), "check-profiles should compose through the check-profile reader seam");
assert(!checkProfilesTypesSource.includes("TaskRecord"), "checker task types should not alias raw scanner TaskRecord objects");
assert(!checkProfilesTypesSource.includes("TaskStatusProjection"), "checker task types should not alias broad status/dashboard projection objects");
assert(!governanceIndexGeneratorSource.includes("createScannerTaskRepository"), "generated governance rebuild should consume governance projections instead of creating the broad scanner-backed repository");
assert(!governanceIndexGeneratorSource.includes("TaskRecord"), "generated governance rebuild should not import or alias raw scanner TaskRecord objects");
assert(governanceIndexGeneratorSource.includes("createTaskGovernanceProjectionReader"), "generated governance rebuild should compose through the governance projection reader seam");
assert(!dashboardDataSource.includes("createScannerTaskRepository"), "dashboard bundle generation should consume status projections instead of creating the broad scanner-backed repository");
assert(dashboardDataSource.includes("createTaskStatusProjectionReader"), "dashboard bundle generation should compose through the status projection reader seam");
assert(!governanceSyncSource.includes("collectTasks"), "module governance generated indexes should not default to raw scanner task collection");
assert(!governanceSyncSource.includes("task-scanner"), "module governance generated indexes should not import task-scanner directly");
assert(!governanceSyncSource.includes("TaskRecord"), "module governance generated indexes should not import or alias raw scanner TaskRecord objects");
assert(governanceSyncSource.includes("createTaskGovernanceProjectionReader"), "module governance generated indexes should compose through the governance projection reader seam");
assert(!lessonMaintenanceSource.includes("collectTasks"), "lesson promotion should consume a narrow reader instead of raw scanner task collection");
assert(!lessonMaintenanceSource.includes("task-scanner"), "lesson promotion should not import task-scanner directly");
assert(!lessonMaintenanceSource.includes("TaskRecord"), "lesson promotion should not import or alias raw scanner TaskRecord objects");
assert(lessonMaintenanceSource.includes("createTaskLessonPromotionReader"), "lesson promotion should compose through the lesson promotion reader seam");
assert(!moduleRegistrySource.includes("collectTasks"), "module registry unregister blockers should consume a narrow reader instead of raw scanner task collection");
assert(!moduleRegistrySource.includes("task-scanner"), "module registry unregister blockers should not import task-scanner directly");
assert(!moduleRegistrySource.includes("TaskRecord"), "module registry unregister blockers should not import or alias raw scanner TaskRecord objects");
assert(moduleRegistrySource.includes("createTaskModuleReferenceReader"), "module registry unregister blockers should compose through the module reference reader seam");
assert(!reviewConfirmSource.includes("task-scanner"), "review-confirm should consume narrow metadata/review/lesson/path modules instead of the broad task-scanner facade");
assert(reviewConfirmSource.includes("task-review-model"), "review-confirm should read review risks through the review model module");
assert(reviewConfirmSource.includes("task-lesson-candidates"), "review-confirm should read lesson candidate status through the lesson candidate module");
assert(reviewConfirmSource.includes("task-metadata"), "review-confirm should read budget through the task metadata module");
assert(reviewConfirmSource.includes("harness-paths"), "review-confirm should derive task ids through harness path identity helpers");
assert(!dashboardWorkbenchSource.includes("subjects: taskRepository"), "dashboard workbench task actions should use narrow subject readers instead of the broad TaskRepository identity");
assert(!dashboardWorkbenchSource.includes("createScannerTaskRepository"), "dashboard workbench bulk review cache should consume workbench review subjects instead of creating the broad scanner-backed repository");
assert(!taskTombstoneCommandsSource.includes("createScannerTaskRepository"), "task-tombstone compatibility commands should use the narrow tombstone subject reader instead of the broad scanner-backed repository");
assert(!taskTombstoneCommandsSource.includes("../adapters/cli/"), "task-tombstone compatibility commands should not depend on the CLI adapter layer");
assert(taskTombstoneCommandsSource.includes("createScannerTaskTombstoneSubjectReader"), "task-tombstone compatibility commands should compose through the scanner-backed tombstone subject reader adapter");
assert(!dashboardWorkbenchSource.includes("TaskRecord"), "dashboard workbench bulk review cache should not store raw scanner TaskRecord objects");
assert(!dashboardWorkbenchSource.includes("buildTaskSemanticProjection"), "dashboard workbench bulk review gate should not interpret raw task facts locally");
assert(taskLifecycleSource.includes("createTaskReviewConfirmationSubjectReader"), "task-lifecycle review-confirm should consume the narrow review confirmation subject reader");
assert(lifecycleReviewTaskByDirectorySource.includes("createTaskReviewConfirmationSubjectReader"), "task-lifecycle review-confirm lookup should use the narrow review confirmation subject reader");
assert(!lifecycleReviewTaskByDirectorySource.includes("createScannerTaskRepository"), "task-lifecycle review-confirm lookup should not use the broad scanner-backed repository identity");
assert(!lifecycleReviewTaskByDirectorySource.includes(".get({ path: taskDir })"), "task-lifecycle review-confirm lookup should not retrieve raw TaskRecord by directory");
assert(!/export type TaskStatusProjection = \{\s*\[key: string\]: unknown;/m.test(taskRepositoryTypesSource), "TaskStatusProjection should be an explicit status/dashboard contract, not an arbitrary scanner record bag");
assert(!statusProjectionReaderSource.includes("createScannerTaskRepository"), "TaskStatusProjectionReader should not recreate the broad scanner-backed TaskRepository identity");
assert(!checkProfileReaderSource.includes("createScannerTaskRepository"), "TaskCheckProfileReader should not recreate the broad scanner-backed TaskRepository identity");
assert(!taskIndexProjectionReaderSource.includes("createScannerTaskRepository"), "TaskIndexProjectionReader should not recreate the broad scanner-backed TaskRepository identity");
assert(taskRepositoryTypesSource.includes("export type TaskIndexProjectionReader"), "task repository type island should expose the narrow task-index projection reader contract");
assert(taskRepositoryTypesSource.includes("export type TaskCheckProfileReader"), "task repository type island should expose the narrow check-profile reader contract");
assert(!taskGovernanceProjectionReaderSource.includes("createScannerTaskRepository"), "TaskGovernanceProjectionReader should not recreate the broad scanner-backed TaskRepository identity");
assert(taskRepositoryTypesSource.includes("export type TaskGovernanceProjectionReader"), "task repository type island should expose the narrow governance projection reader contract");
assert(!checkTaskContractsSource.includes("createScannerTaskRepository"), "check-task-contracts should consume a narrow plan-contract reader instead of the broad scanner-backed repository");
assert(checkTaskContractsSource.includes("createTaskPlanContractReader"), "check-task-contracts should compose through the task plan-contract reader seam");
assert(!taskPlanContractReaderSource.includes("createScannerTaskRepository"), "TaskPlanContractReader should not recreate the broad scanner-backed TaskRepository identity");
assert(taskRepositoryTypesSource.includes("export type TaskPlanContractReader"), "task repository type island should expose the narrow plan-contract reader contract");
assert(!taskLessonPromotionReaderSource.includes("createScannerTaskRepository"), "TaskLessonPromotionReader should not recreate the broad scanner-backed TaskRepository identity");
assert(taskRepositoryTypesSource.includes("export type TaskLessonPromotionReader"), "task repository type island should expose the narrow lesson promotion reader contract");
assert(!broadTaskRepositoryTypeSource.includes("resolveLessonPromotionTask"), "TaskLessonPromotionReader should stay separate instead of widening the broad TaskRepository identity");
assert(!taskModuleReferenceReaderSource.includes("createScannerTaskRepository"), "TaskModuleReferenceReader should not recreate the broad scanner-backed TaskRepository identity");
assert(taskRepositoryTypesSource.includes("export type TaskModuleReferenceReader"), "task repository type island should expose the narrow module reference reader contract");
assert(!broadTaskRepositoryTypeSource.includes("listModuleReferences"), "TaskModuleReferenceReader should stay separate instead of widening the broad TaskRepository identity");
assert(!taskRepositorySource.includes("return { ...task };"), "status projection materialization should not leak scanner records by object spread");
assert(graph.summary.fileCount === 11, `expected 11 graph files, got ${graph.summary.fileCount}`);
assert(graph.summary.localEdgeCount === 9, `expected 9 local edges, got ${graph.summary.localEdgeCount}`);
assert(graph.summary.unresolvedLocalEdges === 0, "valid graph should have no unresolved local edges");
assert(graph.summary.cycleNodes === 0, "valid graph should have no cycle nodes");
assert(graph.summary.runtimeMjsToTsEdges === 0, "valid graph should have no .mjs to .ts/.mts edges");
assert(graph.summary.typesValueImports === 0, "valid graph should allow import type from scripts/lib/types");
assert(graph.summary.architectureBoundaryViolations === 0, "valid layered fixture should have no architecture boundary violations");
assert(repoGraph.summary.taskRepositoryIdentityViolations === 0, "repo graph should have no runtime consumers of broad scanner-backed TaskRepository/TaskRecord identity outside the repository adapter and tests");
assert(graph.architectureContract.version === "architecture-import-contract/2026-06-02-p03", "graph should expose the P03 architecture import contract version");
assert(graph.architectureContract.layers.some((layer) => layer.id === "application" && layer.mayImport.includes("phase-open-exceptions")), "contract should expose application phase-open exception policy");
assert(graph.architectureContract.layers.some((layer) => layer.id === "commands" && layer.owns.includes("scripts/commands/**")), "contract should expose a dedicated commands ownership layer");
assert(graph.architectureContract.layers.some((layer) => layer.id === "commands" && layer.mayImport.includes("scripts/adapters/**")), "commands should be allowed to compose explicit CLI adapters");
assert(!graph.architectureContract.phaseOpenExceptions.some((exception) => exception.id === "P05-application-task-operations-repository-bridge"), "contract should not keep the retired TaskOperations repository bridge exception");
assert(!graph.architectureContract.phaseOpenExceptions.some((exception) => exception.id === "P06-application-task-operations-projection-bridge"), "contract should not keep the retired TaskOperations projection bridge exception");
assert(!graph.architectureContract.phaseOpenExceptions.some((exception) => exception.source === "scripts/application/task/task-operations.mts" && exception.target === "scripts/lib/task-repository.mts"), "contract should not re-register the retired TaskOperations repository bridge under a new id");
assert(!graph.architectureContract.phaseOpenExceptions.some((exception) => exception.source === "scripts/application/task/task-operations.mts" && exception.target === "scripts/lib/task-semantic-projection.mts"), "contract should not re-register the retired TaskOperations projection bridge under a new id");
assert(!graph.architectureContract.phaseOpenExceptions.some((exception) => exception.id === "P04-application-task-operations-tombstone-bridge"), "contract should not keep the retired TaskOperations tombstone bridge exception");
assert(!graph.architectureContract.phaseOpenExceptions.some((exception) => exception.id === "P04-application-task-operations-legacy-bridge"), "contract should not keep the retired TaskOperations lifecycle writer bridge exception");
assert(!graph.architectureContract.phaseOpenExceptions.some((exception) => exception.id === "P04-application-task-operations-lesson-bridge"), "contract should not keep the retired TaskOperations lesson writer bridge exception");
assert(!graph.architectureContract.phaseOpenExceptions.some((exception) => exception.source === "scripts/application/task/task-operations.mts" && exception.target === "scripts/lib/task-lifecycle.mts"), "contract should not re-register the TaskOperations lifecycle writer bridge under a new id");
assert(!graph.architectureContract.phaseOpenExceptions.some((exception) => exception.source === "scripts/application/task/task-operations.mts" && exception.target === "scripts/lib/task-lesson-sedimentation.mts"), "contract should not re-register the TaskOperations lesson writer bridge under a new id");
assert(!graph.architectureContract.phaseOpenExceptions.some((exception) => exception.id === "P04-application-module-governance-sync-bridge"), "contract should not keep the retired module governance sync bridge exception");
assert(!graph.architectureContract.phaseOpenExceptions.some((exception) => exception.id === "P04-application-tombstone-resolution-bridge"), "contract should not keep the retired tombstone lifecycle resolver bridge exception");
assert(!graph.architectureContract.phaseOpenExceptions.some((exception) => exception.id === "P05-application-tombstone-repository-resolution-bridge"), "contract should not keep the retired tombstone repository resolver exception");
assert(!graph.architectureContract.phaseOpenExceptions.some((exception) => exception.id === "P05-application-tombstone-scanner-bridge"), "contract should not keep the retired tombstone scanner bridge exception");
assert(!graph.architectureContract.phaseOpenExceptions.some((exception) => exception.id === "P05-command-task-operations-subject-composition-bridge"), "contract should not keep the retired command-to-lib TaskOperationSubjectReader helper bridge");
assert(!graph.architectureContract.phaseOpenExceptions.some((exception) => exception.target === "scripts/lib/task-operation-subjects.mts"), "contract should not keep phase-open exceptions targeting the retired lib TaskOperationSubjectReader helper");
assert(!graph.architectureContract.phaseOpenExceptions.some((exception) => exception.id === "P05-adapter-task-operation-subject-repository-bridge"), "contract should not keep the broad TaskRepository-backed operation subject adapter bridge");
assert(!graph.architectureContract.phaseOpenExceptions.some((exception) => exception.source === "scripts/adapters/cli/task-operation-subject-reader.mts" && exception.target === "scripts/lib/task-repository.mts"), "contract should not re-register the operation subject adapter through the broad TaskRepository port");
assert(!graph.architectureContract.phaseOpenExceptions.some((exception) => exception.id === "P05-adapter-task-operation-subject-scanner-bridge"), "contract should not keep the retired CLI adapter to task-scanner direct bridge exception");
assert(!graph.architectureContract.phaseOpenExceptions.some((exception) => exception.source === "scripts/adapters/cli/task-operation-subject-reader.mts" && exception.target === "scripts/lib/task-scanner.mts"), "contract should not re-register direct CLI adapter scanner access under a new exception");
assert(!nodeByPath(repoGraph, "scripts/adapters/cli/task-operation-subject-reader.mts").imports.some((edge) => edge.target === "scripts/lib/task-scanner.mts"), "CLI subject reader adapter should not import task-scanner directly");
assert(nodeByPath(repoGraph, "scripts/infrastructure/task/scanner-subject-source.mts").imports.some((edge) => edge.target === "scripts/lib/task-scanner.mts"), "scanner subject source should own the infrastructure-only scanner read");
const taskInfrastructureLayer = graph.architectureContract.layers.find((layer) => layer.id === "task-infrastructure-adapters");
assert(taskInfrastructureLayer?.owns.includes("scripts/infrastructure/task/**"), "contract should register task infrastructure adapter ownership");
assert(taskInfrastructureLayer?.mayImport.includes("scripts/lib/task-scanner.mts"), "task infrastructure adapter contract should explicitly own scanner reads");
assert(!graph.architectureContract.phaseOpenExceptions.some((exception) => exception.id === "P05-domain-task-subject-semantic-projection-bridge"), "contract should not keep the retired task subject domain semantic projection bridge");
assert(!taskSubjectsSource.includes("../../lib/task-semantic-projection"), "task subject domain mapper should consume the domain-owned semantic projection module");
assert(taskSemanticProjectionSource.includes("export * from \"../domain/task/task-semantic-projection.mjs\""), "legacy task semantic projection module should be a compatibility re-export");
const legacyWriterLifecycleBridge = graph.architectureContract.phaseOpenExceptions.find((exception) => exception.id === "P04-infrastructure-task-operation-lifecycle-writer-adapter");
assert(legacyWriterLifecycleBridge?.source === "scripts/infrastructure/task/legacy-task-operation-writers.mts" && legacyWriterLifecycleBridge.target === "scripts/lib/task-lifecycle.mts", "contract should explicitly track the legacy lifecycle writer adapter residual");
assert(legacyWriterLifecycleBridge?.ownerPhase === "P04-transaction-cutover" && legacyWriterLifecycleBridge.expiryPhase === "P07-task-operations-facade-removal", "legacy lifecycle writer adapter residual should stay scoped to the P04-to-P07 retirement window");
const legacyWriterLessonBridge = graph.architectureContract.phaseOpenExceptions.find((exception) => exception.id === "P04-infrastructure-task-operation-lesson-writer-adapter");
assert(legacyWriterLessonBridge?.source === "scripts/infrastructure/task/legacy-task-operation-writers.mts" && legacyWriterLessonBridge.target === "scripts/lib/task-lesson-sedimentation.mts", "contract should explicitly track the legacy lesson writer adapter residual");
assert(legacyWriterLessonBridge?.ownerPhase === "P04-transaction-cutover" && legacyWriterLessonBridge.expiryPhase === "P07-task-operations-facade-removal", "legacy lesson writer adapter residual should stay scoped to the P04-to-P07 retirement window");
assert(graph.architectureContract.sharedFileLocks.some((lock) => lock.path === "scripts/lib/task-scanner.mts" && lock.ownerPhase === "P05-repository-scanner-strangler"), "contract should expose scanner shared-file lock ownership");
assert(graph.architectureContract.sharedFileLocks.some((lock) => lock.path === "scripts/ports/task/task-operation-writers.mts" && lock.ownerPhase === "P04-transaction-cutover"), "contract should expose TaskOperations writer port ownership");
assert(graph.architectureContract.sharedFileLocks.some((lock) => lock.path === "scripts/infrastructure/task/legacy-task-operation-writers.mts" && lock.ownerPhase === "P04-transaction-cutover"), "contract should expose legacy writer adapter ownership");
assert(graph.architectureContract.sharedFileLocks.some((lock) => lock.path === "scripts/adapters/cli/task-operations.mts" && lock.ownerPhase === "P04-transaction-cutover"), "contract should expose TaskOperations CLI composition ownership");
assert(graph.architectureContract.sharedFileLocks.some((lock) => lock.path === "scripts/domain/task/task-subjects.mts" && lock.ownerPhase === "P05-repository-scanner-strangler"), "contract should expose task subject domain mapper ownership");
assert(!graph.architectureContract.sharedFileLocks.some((lock) => lock.path === "scripts/lib/task-operation-subjects.mts"), "contract should not keep a shared-file lock for the retired lib TaskOperationSubjectReader helper");
assert(graph.architectureContract.sharedFileLocks.some((lock) => lock.path === "scripts/adapters/cli/task-operation-subject-reader.mts" && lock.ownerPhase === "P05-repository-scanner-strangler"), "contract should expose TaskOperationSubjectReader CLI adapter ownership");
assert(graph.architectureContract.sharedFileLocks.some((lock) => lock.path === "scripts/infrastructure/task/scanner-subject-source.mts" && lock.ownerPhase === "P05-repository-scanner-strangler"), "contract should expose scanner subject source adapter ownership");
assert(graph.architectureContract.boundaryRules.includes("application-imports-unregistered-legacy-surface"), "contract should expose fail-closed application legacy import rule");
assert(graph.architectureContract.boundaryRules.includes("domain-imports-legacy-runtime"), "contract should expose fail-closed domain legacy runtime import rule");
assert(graph.architectureContract.boundaryRules.includes("runtime-consumes-broad-task-repository-identity"), "contract should expose fail-closed broad TaskRepository identity runtime usage rule");

assert(nodeByPath(graph, "scripts/harness.mjs").reachableFromBin === true, "bin entry should be bin-reachable");
assert(nodeByPath(graph, "scripts/lib/harness-core.mjs").reachableFromBin === true, "harness-core should be bin-reachable");
assert(nodeByPath(graph, "scripts/lib/leaf.mjs").reachableFromHarnessCore === true, "barrel target should be harness-core reachable");
assert(nodeByPath(graph, "scripts/lib/leaf.mjs").barrelReachable === true, "barrel re-export target should be barrel reachable");
assert(nodeByPath(graph, "scripts/lib/leaf.mjs").layer === 0, "leaf dependency should be layer 0");
assert(nodeByPath(graph, "scripts/harness.mjs").layer > nodeByPath(graph, "scripts/lib/leaf.mjs").layer, "importer layer should be deeper than leaf layer");

const checked = checkImportGraph({ repoRoot: fixtureRoot, expectNodes: 11, expectEdges: 9 });
assert(checked.ok === true, `valid graph gate should pass:\n${checked.violations.map((violation) => violation.message).join("\n")}`);

writeFixture(fixtureRoot, "scripts/bad-missing.mjs", 'import "./missing.mjs";\n');
writeFixture(fixtureRoot, "scripts/bad-runtime.mjs", 'import "./runtime-target' + '.ts";\n');
writeFixture(fixtureRoot, "scripts/runtime-target.ts", "export const value = 1;\n");
writeFixture(fixtureRoot, "scripts/a.mjs", 'import "./b.mjs";\n');
writeFixture(fixtureRoot, "scripts/b.mjs", 'import "./a.mjs";\n');
writeFixture(fixtureRoot, "scripts/value-consumer.ts", 'import { Protocol } from "./lib/' + 'types/protocol' + '.js";\nconsole.log(Protocol);\n');
writeFixture(fixtureRoot, "scripts/infrastructure/kernel/bad-kernel.mts", 'import { leaf } from "../../lib/leaf.mjs";\nexport const bad = leaf;\n');
writeFixture(fixtureRoot, "scripts/domain/task/bad-domain.mts", 'import { adapter } from "../../adapters/cli/task-adapter.mjs";\nexport const bad = adapter;\n');
writeFixture(fixtureRoot, "scripts/domain/task/bad-domain-legacy-runtime.mts", 'import { scan } from "../../lib/task-scanner.mjs";\nexport const badLegacyRuntime = scan;\n');
writeFixture(fixtureRoot, "scripts/application/task/bad-use-case.mts", 'import { adapter } from "../../adapters/cli/task-adapter.mjs";\nexport const bad = adapter;\n');
writeFixture(fixtureRoot, "scripts/lib/task-scanner.mts", "export const scan = 1;\n");
writeFixture(fixtureRoot, "scripts/application/task/bad-legacy-use-case.mts", 'import { scan } from "../../lib/task-scanner.mjs";\nexport const badLegacy = scan;\n');
writeFixture(fixtureRoot, "scripts/lib/task-tombstone-commands.mts", "export const tombstone = 1;\n");
writeFixture(fixtureRoot, "scripts/application/task/bad-tombstone-use-case.mts", 'import { tombstone } from "../../lib/task-tombstone-commands.mjs";\nexport const badTombstone = tombstone;\n');
writeFixture(fixtureRoot, "scripts/lib/task-lifecycle/review-confirm.mts", "export type ReviewConfirm = { id: string };\nexport const confirm = 1;\n");
writeFixture(fixtureRoot, "scripts/lib/task-lifecycle/internal.mts", "export const internal = 1;\n");
writeFixture(fixtureRoot, "scripts/application/task/bad-legacy-internal-use-case.mts", 'import { confirm } from "../../lib/task-lifecycle/review-confirm.mjs";\nexport const badInternal = confirm;\n');
writeFixture(fixtureRoot, "scripts/application/task/bad-legacy-internal-type-use-case.mts", 'import type { ReviewConfirm } from "../../lib/task-lifecycle/review-confirm.mjs";\nexport const badInternalType: ReviewConfirm = { id: "bad" };\n');
writeFixture(fixtureRoot, "scripts/application/module/module-governance.mts", 'import { sync } from "../../lib/governance-sync.mjs";\nexport const badModuleGovernance = sync;\n');
writeFixture(fixtureRoot, "scripts/commands/bad-lifecycle-internal-command.mts", 'import { confirm } from "../lib/task-lifecycle/review-confirm.mjs";\nexport const badCommand = confirm;\n');
writeFixture(fixtureRoot, "scripts/adapters/cli/bad-lifecycle-internal-adapter.mts", 'import { confirm } from "../../lib/task-lifecycle/review-confirm.mjs";\nexport const badAdapter = confirm;\n');
writeFixture(fixtureRoot, "scripts/lib/dashboard-data.mts", 'import { scan } from "./task-scanner.mjs";\nimport { internal } from "./task-lifecycle/internal.mjs";\nexport const dashboard = scan + internal;\n');
writeFixture(fixtureRoot, "scripts/lib/task-lifecycle.mts", "export const lifecycle = 1;\n");
writeFixture(fixtureRoot, "scripts/lib/dashboard-workbench.mts", 'import { lifecycle } from "./task-lifecycle.mjs";\nimport { internal } from "./task-lifecycle/internal.mjs";\nexport const workbench = lifecycle + internal;\n');
writeFixture(fixtureRoot, "scripts/adapters/cli/bad-scanner-adapter.mts", 'import { scan } from "../../lib/task-scanner.mjs";\nexport const badScannerAdapter = scan;\n');
writeFixture(fixtureRoot, "scripts/infrastructure/task/bad-legacy-writer.mts", 'import { lifecycle } from "../../lib/task-lifecycle.mjs";\nexport const badLegacyWriter = lifecycle;\n');
writeFixture(fixtureRoot, "scripts/commands/bad-repository-command.mts", 'import { create } from "../lib/task-repository.mjs";\nexport const badRepositoryCommand = create;\n');
writeFixture(fixtureRoot, "scripts/adapters/cli/bad-repository-adapter.mts", 'import { create } from "../../lib/task-repository.mjs";\nexport const badRepositoryAdapter = create;\n');
writeFixture(fixtureRoot, "scripts/lib/bad-runtime-repository-identity.mts", 'import type { TaskRepository, TaskRecord } from "./task-repository.mjs";\nexport function leak(repository: TaskRepository): TaskRecord[] { return repository.list(); }\n');
writeFixture(fixtureRoot, "scripts/lib/bad-runtime-repository-factory.mts", 'import { createScannerTaskRepository } from "./task-repository.mjs";\nexport const repository = createScannerTaskRepository(".");\n');
writeFixture(fixtureRoot, "scripts/lib/governance-index-generator.mts", 'import { scan } from "./task-scanner.mjs";\nexport const generated = scan;\n');
writeFixture(fixtureRoot, "scripts/lib/governance-sync.mts", "export const sync = 1;\n");
writeFixture(fixtureRoot, "scripts/lib/preset-runner.mts", 'import { sync } from "./governance-sync.mjs";\nexport const preset = sync;\n');
writeFixture(fixtureRoot, "scripts/commands/module-command.mts", 'import { sync } from "../lib/governance-sync.mjs";\nexport const command = sync;\n');
writeFixture(fixtureRoot, "scripts/lib/task-repository.mts", "export const create = 1;\n");
writeFixture(fixtureRoot, "scripts/lib/task-operations.mts", "export const operations = 1;\n");
writeFixture(fixtureRoot, "scripts/commands/task-command.mts", 'import { operations } from "../lib/task-operations.mjs";\nexport const commandTask = operations;\n');

const failed = checkImportGraph({ repoRoot: fixtureRoot });
assert(failed.ok === false, "invalid graph fixture should fail");
assert(failed.violations.some((violation) => violation.code === "unresolved-local-edge"), "gate should report unresolved local edges");
assert(failed.violations.some((violation) => violation.code === "cycle"), "gate should report import cycles");
assert(failed.violations.some((violation) => violation.code === "mjs-imports-ts"), "gate should report .mjs importing .ts/.mts");
assert(failed.violations.some((violation) => violation.code === "types-value-import"), "gate should report value imports from scripts/lib/types");
assert(failed.violations.some((violation) => violation.code === "kernel-imports-outer-layer"), "gate should report kernel imports from outer layers");
assert(failed.violations.some((violation) => violation.code === "domain-imports-outer-layer"), "gate should report domain imports from adapters/application");
assert(failed.violations.some((violation) => violation.code === "domain-imports-legacy-runtime" && violation.message.includes("task-scanner")), "gate should reject unregistered domain imports from legacy runtime surfaces");
assert(failed.violations.some((violation) => violation.code === "application-imports-adapter"), "gate should report application imports from adapters");
assert(failed.violations.some((violation) => violation.code === "application-imports-unregistered-legacy-surface"), "gate should reject unregistered application imports from legacy task runtime surfaces");
assert(failed.violations.some((violation) => violation.code === "application-imports-unregistered-legacy-surface" && violation.message.includes("task-tombstone-commands")), "gate should reject application imports from the legacy tombstone command surface");
assert(failed.violations.some((violation) => violation.code === "application-imports-unregistered-legacy-surface" && violation.message.includes("task-lifecycle/review-confirm")), "gate should reject unregistered application imports from legacy task lifecycle internal modules");
assert(failed.violations.some((violation) => violation.code === "application-imports-unregistered-legacy-surface" && violation.message.includes("governance-sync")), "gate should reject application module imports from governance-sync after P04 transaction cutover");
assert(failed.violations.some((violation) => violation.code === "dashboard-data-imports-task-internal"), "gate should report dashboard-data imports from task internals");
assert(failed.violations.some((violation) => violation.code === "dashboard-workbench-imports-task-internal"), "gate should report dashboard-workbench imports from task internals");
assert(failed.violations.some((violation) => violation.code === "generated-governance-imports-task-scanner"), "gate should report generated governance imports from task scanner internals");
assert(failed.violations.some((violation) => violation.code === "command-imports-task-internal"), "gate should report command adapters importing task internals");
assert(failed.violations.some((violation) => violation.code === "command-imports-task-internal" && violation.message.includes("task-lifecycle/review-confirm")), "gate should reject command imports from task lifecycle internal modules");
assert(failed.violations.some((violation) => violation.code === "command-imports-task-internal" && violation.message.includes("task-repository")), "gate should reject command imports from task repository legacy surface");
assert(failed.violations.some((violation) => violation.code === "adapter-imports-task-internal" && violation.message.includes("task-lifecycle/review-confirm")), "gate should reject adapter imports from task lifecycle internal modules");
assert(failed.violations.some((violation) => violation.code === "adapter-imports-task-internal" && violation.message.includes("task-repository")), "gate should reject adapter imports from task repository legacy surface");
assert(failed.violations.some((violation) => violation.code === "adapter-imports-task-internal" && violation.message.includes("task-scanner")), "gate should reject unregistered adapter imports from task scanner internals");
assert(failed.violations.some((violation) => violation.code === "runtime-consumes-broad-task-repository-identity" && violation.message.includes("TaskRecord")), "gate should reject runtime code consuming raw TaskRecord identity outside the repository adapter");
assert(failed.violations.some((violation) => violation.code === "runtime-consumes-broad-task-repository-identity" && violation.message.includes("createScannerTaskRepository")), "gate should reject runtime code recreating the broad scanner-backed repository identity outside the repository adapter");
assert(failed.violations.some((violation) => violation.code === "task-infrastructure-imports-unregistered-legacy-surface" && violation.message.includes("task-lifecycle")), "gate should reject unregistered task infrastructure imports from legacy lifecycle writers");
assert(failed.violations.some((violation) => violation.code === "dashboard-data-imports-task-internal" && violation.message.includes("task-lifecycle/internal")), "gate should reject dashboard-data imports from unregistered task lifecycle internal modules");
assert(failed.violations.some((violation) => violation.code === "dashboard-workbench-imports-task-internal" && violation.message.includes("task-lifecycle/internal")), "gate should reject dashboard-workbench imports from unregistered task lifecycle internal modules");
assert(failed.violations.some((violation) => violation.code === "runtime-imports-task-operations-facade"), "gate should report runtime callers importing the TaskOperations compatibility facade");
assert(failed.violations.some((violation) => violation.code === "preset-runtime-imports-governance-sync"), "gate should report preset runtime direct governance sync imports");

console.log("Import graph gate tests passed");
