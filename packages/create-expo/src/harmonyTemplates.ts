export const HARMONY_DEFAULT_TEMPLATE = '@expo-oh/expo-template-default@54.0.64';
export const HARMONY_BLANK_TYPESCRIPT_TEMPLATE = '@expo-oh/expo-template-blank-typescript@54.0.48';

export function resolveHarmonyTemplate(template?: string | null): string {
  switch (template) {
    case undefined:
    case null:
    case 'default':
    case 'expo-template-default':
      return HARMONY_DEFAULT_TEMPLATE;
    case 'blank-typescript':
    case 'expo-template-blank-typescript':
      return HARMONY_BLANK_TYPESCRIPT_TEMPLATE;
    default:
      return template;
  }
}
