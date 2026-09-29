import type { Sdk54Template } from './create-options';
import type { Sdk54PatchManifest } from './patch-manifest';

function sortedRecord(values: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values).sort(([left], [right]) => left.localeCompare(right, 'en')),
  );
}

export function buildSdk54PackageJson(
  current: Record<string, unknown>,
  template: Sdk54Template,
  manifest: Sdk54PatchManifest,
): Record<string, unknown> {
  const contract = manifest.templates[template];
  const dependencies: Record<string, string> = {};

  for (const name of contract.expoPackages) dependencies[name] = manifest.catalog.expo[name];
  for (const name of contract.externalPackages) dependencies[name] = manifest.catalog.external[name];
  Object.assign(dependencies, contract.dependencies);
  delete dependencies['expo-image'];

  return {
    ...current,
    dependencies: sortedRecord(dependencies),
    devDependencies: sortedRecord({
      ...contract.devDependencies,
      'patch-package': manifest.patchPackageVersion,
    }),
  };
}
