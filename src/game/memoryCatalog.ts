/** Content identity is independent of the visibility rules and stable puzzle IDs. */
export const MEMORY_CATALOG = 'memory-100-v1';
export const MEMORY_COUNT = 100;
export function nextMemoryNumber(number: number, count = MEMORY_COUNT) {
  if (!Number.isInteger(number) || number < 1 || number > count) throw new Error('Invalid memory position');
  return number === count ? 1 : number + 1;
}
