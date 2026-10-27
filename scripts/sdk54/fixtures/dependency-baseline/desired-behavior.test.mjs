import test from 'node:test';
import { assertDesiredBehavior, runDependencyBaseline } from '../../reproduce-dependency-baseline.mjs';

const baseline = await runDependencyBaseline();
for (const entry of baseline.cases) test(entry.id, () => assertDesiredBehavior(entry));
test('CHECK-PACKAGES-JSON', () => assertDesiredBehavior(baseline.integration));
