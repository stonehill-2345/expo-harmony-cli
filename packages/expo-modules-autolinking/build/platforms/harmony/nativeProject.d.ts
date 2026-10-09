import type { HarmonyHarConfig, ModuleDescriptorHarmony } from '../../types';
export declare const RNOH_COMPATIBILITY_ID = "expo-rnoh-0.82.30-core-v1-v3";
export declare const RNOH_INPUT_HAR_SHA256 = "cac2b5d1b9ce7d306079218931db12489aaceb240002c9c32e6c13185c577011";
export declare const RNOH_OUTPUT_HAR_SHA256 = "0e0cf3dbb5b2e510f49c819ff5db2f43ad5a5918d38e840cc2714055c9f6fd83";
export interface RunCompatibilityToolOptions {
    pythonExecutable: string;
    scriptPath: string;
    inputHarPath: string;
    outputHarPath: string;
    profile: 'core-v1-v3';
}
export type RunCompatibilityTool = (options: RunCompatibilityToolOptions) => Promise<void>;
export interface RunAppConfigGeneratorOptions {
    scriptPath: string;
    projectRoot: string;
    destinationDir: string;
}
export type RunAppConfigGenerator = (options: RunAppConfigGeneratorOptions) => Promise<void>;
export interface HarmonyNativeProjectOptions {
    projectRoot: string;
    appName: string;
    bundleName: string;
    modules: ModuleDescriptorHarmony[];
    inputHarPath: string;
    corePackageRoot: string;
    pythonExecutable?: string;
    runCompatibilityTool?: RunCompatibilityTool;
    runAppConfigGenerator?: RunAppConfigGenerator;
    templateRoot?: string;
}
export declare function prepareHarmonyNativeProjectAsync({ projectRoot, appName, bundleName, modules, inputHarPath, corePackageRoot, pythonExecutable, runCompatibilityTool, runAppConfigGenerator, templateRoot, }: HarmonyNativeProjectOptions): Promise<{
    harmonyRoot: string;
    rnohHarPath: string;
    generatedFiles: {
        cpp: string;
        ets: string;
        cmake: string;
        lifecycle: string;
        overlays: string;
    };
}>;
export declare function copyHarmonyTemplateMediaAsync(projectRoot: string, harmonyRoot: string): Promise<void>;
export declare function syncHarmonyNativeProjectAsync(options: HarmonyNativeProjectOptions): ReturnType<typeof prepareHarmonyNativeProjectAsync>;
export declare function generateHarmonyAppConfigAsync({ projectRoot, harmonyRoot, runAppConfigGenerator, }: {
    projectRoot: string;
    harmonyRoot: string;
    runAppConfigGenerator?: RunAppConfigGenerator;
}): Promise<string>;
export declare function prepareRnohCompatibilityHarAsync({ harmonyRoot, inputHarPath, corePackageRoot, pythonExecutable, runCompatibilityTool, }: {
    harmonyRoot: string;
    inputHarPath: string;
    corePackageRoot: string;
    pythonExecutable?: string;
    runCompatibilityTool?: RunCompatibilityTool;
}): Promise<string>;
export type RunHarmonyHarTransform = (transform: NonNullable<HarmonyHarConfig['transform']>, input: string, output: string) => Promise<void>;
export declare function stageHarmonyEtsPackagesAsync(modules: ModuleDescriptorHarmony[], harmonyRoot: string, runHarTransform?: RunHarmonyHarTransform): Promise<Record<string, string>>;
export declare function renderExpoModulesLifecycle(modules: ModuleDescriptorHarmony[]): string;
export declare function renderExpoModulesAppOverlays(modules: ModuleDescriptorHarmony[]): string;
