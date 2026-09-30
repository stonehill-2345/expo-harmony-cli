import type { Check } from './types';
import { nodeCheck, pmCheck, ohpmCheck, devecoCheck, hvigorCheck, hdcCheck } from './tool-checks';
export const TOOL_CHECKS: Check[] = [nodeCheck, pmCheck, ohpmCheck, devecoCheck, hvigorCheck, hdcCheck];
import { harmonyExistsCheck, baselineCheck, driftCheck } from './project-checks';
export const PROJECT_CHECKS: Check[] = [harmonyExistsCheck, baselineCheck, driftCheck];
