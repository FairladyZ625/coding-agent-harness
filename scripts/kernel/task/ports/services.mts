import { Context } from "effect";

import {
  GENERATED_PROJECTION_PORT_ID,
  type GeneratedProjectionPortServiceShape,
} from "./projection.mjs";
import {
  GIT_UNIT_OF_WORK_PORT_ID,
  type GitUnitOfWorkServiceShape,
} from "./unit-of-work.mjs";
import {
  HUMAN_REVIEW_PORT_ID,
  type HumanReviewPortServiceShape,
} from "./human-review.mjs";
import {
  TASK_PACKAGE_STORE_PORT_ID,
  type TaskPackageStoreServiceShape,
} from "./repository.mjs";

export class TaskPackageStore extends Context.Tag(TASK_PACKAGE_STORE_PORT_ID)<
  TaskPackageStore,
  TaskPackageStoreServiceShape
>() {}

export class GitUnitOfWork extends Context.Tag(GIT_UNIT_OF_WORK_PORT_ID)<
  GitUnitOfWork,
  GitUnitOfWorkServiceShape
>() {}

export class HumanReviewPort extends Context.Tag(HUMAN_REVIEW_PORT_ID)<
  HumanReviewPort,
  HumanReviewPortServiceShape
>() {}

export class GeneratedProjectionPort extends Context.Tag(GENERATED_PROJECTION_PORT_ID)<
  GeneratedProjectionPort,
  GeneratedProjectionPortServiceShape
>() {}
