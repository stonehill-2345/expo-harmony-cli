import type { ExtraDependencies, ModuleDescriptorHarmony, PackageRevision } from '../../types';
export declare function resolveModuleAsync(packageName: string, revision: PackageRevision): Promise<ModuleDescriptorHarmony | null>;
export declare function generatePackageListAsync(modules: ModuleDescriptorHarmony[], targetDirectory: string, _namespace: string): Promise<void>;
export declare function resolveExtraBuildDependenciesAsync(_projectNativeRoot: string): Promise<ExtraDependencies | null>;
