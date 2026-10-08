export type DeviceLayout = { rail: boolean; compact: boolean; horizontalInset: number; verticalInset: number };

/** Use logical window dimensions; physical pixel resolution never determines UI size. */
export function deviceLayout(width: number, height: number, tv: boolean): DeviceLayout {
  return {
    rail: tv || (width >= 600 && width > height * 1.15),
    compact: !tv && height < 720,
    horizontalInset: tv ? Math.ceil(width * .05) : 22,
    verticalInset: tv ? Math.ceil(height * .05) : 0,
  };
}
