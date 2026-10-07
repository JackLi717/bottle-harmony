/** Serializes native writes: a slow old write can never overwrite newer progress.
 * Errors are surfaced to the caller; later snapshots retry normally. */
export function createProgressWriter(write: (value: string) => Promise<void>) {
  let chain = Promise.resolve(), saved: string | null = null;
  return (value: string): Promise<boolean> => {
    const result = chain.then(async () => {
      if (saved === value) return true;
      try { await write(value); saved = value; return true; } catch { return false; }
    });
    chain = result.then(() => {});
    return result;
  };
}
