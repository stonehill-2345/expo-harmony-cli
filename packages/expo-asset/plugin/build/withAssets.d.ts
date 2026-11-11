import { type ConfigPlugin } from 'expo/config-plugins';
export type AssetProps = {
    assets?: string[];
};
declare const _default: ConfigPlugin<AssetProps | null> & {
    harmony: {
        platforms: string[];
    };
};
export default _default;
