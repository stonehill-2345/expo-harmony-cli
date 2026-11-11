// Explicit controls only: a case is never marked passed by this fixture.
export const sheetCases = {
  one: { sheetAllowedDetents: [0.5], sheetInitialDetentIndex: 0 },
  two: { sheetAllowedDetents: [0.35, 0.75], sheetInitialDetentIndex: 0 },
  'three-0': { sheetAllowedDetents: [0.2, 0.5, 0.9], sheetInitialDetentIndex: 0 },
  'three-1': { sheetAllowedDetents: [0.2, 0.5, 0.9], sheetInitialDetentIndex: 1 },
  'three-2': { sheetAllowedDetents: [0.2, 0.5, 0.9], sheetInitialDetentIndex: 2 },
  fit: { sheetAllowedDetents: 'fitToContents', sheetInitialDetentIndex: 0 },
  grabber: { sheetAllowedDetents: [0.35, 0.75], sheetGrabberVisible: true },
  undimmed: { sheetAllowedDetents: [0.35, 0.75], sheetLargestUndimmedDetentIndex: 0 },
  guarded: { sheetAllowedDetents: [0.5], gestureEnabled: false },
  radius: { sheetAllowedDetents: [0.5], sheetCornerRadius: 32, sheetElevation: 24 },
  square: { sheetAllowedDetents: [0.5], sheetCornerRadius: 0, sheetElevation: 0 },
} as const;
export type SheetCase = keyof typeof sheetCases;
