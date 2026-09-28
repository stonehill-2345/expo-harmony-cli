export type ExpoPublicConfig = Record<string, unknown>;

export type ConstantsDataInput = {
  sessionId: string;
  manifest: ExpoPublicConfig | null;
  deviceName: string;
  systemVersion: string;
  statusBarHeight: number;
  systemFonts: string[];
  debugMode: boolean;
  launchUri?: string;
  versionCode: number;
  versionName: string;
};

export function parseAppConfig(rawConfig: string | null): ExpoPublicConfig | null {
  if (rawConfig === null) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawConfig);
  } catch (error) {
    throw new Error(`Invalid embedded app.config: ${String(error)}`);
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Embedded app.config must contain a JSON object');
  }
  return parsed as ExpoPublicConfig;
}

export function buildConstants(input: ConstantsDataInput) {
  const launchUri = input.launchUri ?? '';
  return {
    name: 'ExponentConstants',
    appOwnership: null,
    debugMode: input.debugMode,
    deviceName: input.deviceName,
    deviceYearClass: null,
    executionEnvironment: 'bare',
    experienceUrl: launchUri,
    expoRuntimeVersion: null,
    expoVersion: null,
    isHeadless: false,
    linkingUri: launchUri,
    manifest: input.manifest,
    sessionId: input.sessionId,
    statusBarHeight: input.statusBarHeight,
    systemFonts: input.systemFonts,
    systemVersion: input.systemVersion,
    platform: {
      harmony: {
        versionCode: input.versionCode,
        versionName: input.versionName,
      },
    },
  };
}
