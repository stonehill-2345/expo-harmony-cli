import { Platform, requireNativeModule, requireNativeViewManager, SharedObject, uuid, reloadAppAsync } from 'expo-modules-core';

const selected: string = Platform.select({ harmony: 'harmony', native: 'native', default: 'default' });
const mobile: string = Platform.select({ android: 'android', ios: 'ios', default: 'other' });
const random: string = uuid.v4();
const named: string = uuid.v5('typed', uuid.namespace.dns);
const reload: Promise<void> = reloadAppAsync('typecheck');
const module = requireNativeModule<{ getValue(): number }>('TypeOnly');
const view = requireNativeViewManager<{ label: string }>('TypeOnly');
const resource = new SharedObject();
void [selected, mobile, random, named, reload, module, view, resource];
