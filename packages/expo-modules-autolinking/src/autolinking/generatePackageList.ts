import { getLinkingImplementationForPlatform } from '../platforms';
import {
  ModuleDescriptor,
  ModuleDescriptorAndroid,
  ModuleDescriptorHarmony,
  ModuleDescriptorIos,
  SupportedPlatform,
} from '../types';

interface GeneratePackageListParams {
  platform: SupportedPlatform;
  targetPath: string;
  namespace: string;
}

/** Generates source files listing all packages to link. */
export async function generatePackageListAsync(
  modules: ModuleDescriptor[],
  params: GeneratePackageListParams
) {
  if (params.platform === 'android') {
    await getLinkingImplementationForPlatform('android').generatePackageListAsync(
      modules as ModuleDescriptorAndroid[],
      params.targetPath,
      params.namespace
    );
    return;
  }
  if (params.platform === 'harmony') {
    await getLinkingImplementationForPlatform('harmony').generatePackageListAsync(
      modules as ModuleDescriptorHarmony[],
      params.targetPath,
      params.namespace
    );
    return;
  }
  throw new Error(`Generating package list is not available for platform "${params.platform}"`);
}

interface GenerateModulesProviderParams {
  platform: SupportedPlatform;
  targetPath: string;
  entitlementPath: string | null;
}

/** Generates ExpoModulesProvider file listing all packages to link (Apple-only)
 */
export async function generateModulesProviderAsync(
  modules: ModuleDescriptor[],
  params: GenerateModulesProviderParams
) {
  const platformLinking = getLinkingImplementationForPlatform(params.platform);
  if (!('generateModulesProviderAsync' in platformLinking)) {
    throw new Error(
      `Generating modules provider is not available for platform "${params.platform}"`
    );
  }
  await platformLinking.generateModulesProviderAsync(
    modules as ModuleDescriptorIos[],
    params.targetPath,
    params.entitlementPath
  );
}
