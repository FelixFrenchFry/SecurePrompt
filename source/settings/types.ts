export type ExtensionSettings = {
    darkModeEnabled: boolean;
    rulesDetectionEnabled: boolean;
    localModelDetectionEnabled: boolean;
};

export const DEFAULT_EXTENSION_SETTINGS: ExtensionSettings = {
    darkModeEnabled: false,
    rulesDetectionEnabled: true,
    localModelDetectionEnabled: true,
};
