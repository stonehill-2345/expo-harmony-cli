// HarmonyOS 上不需要 Metro 开发服务器功能，直接 no-op。
// expo-router dev 模式会用 withErrorOverlay 包裹根组件，鸿蒙无 Error Overlay UI，透传即可。
import type { ComponentType } from 'react';

export function withErrorOverlay<T>(Comp: ComponentType<T>): ComponentType<T> {
  return Comp;
}

export {};
