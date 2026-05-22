/**
 * Serialize kernel-api work per provider so we never overlap render calls.
 * Production kernel-api often runs with KERNEL_API_WORKERS=1; concurrent POSTs
 * race for the same worker and surface as 504 timeouts on the second one.
 */
export function createKernelExclusiveQueue(): <T>(task: () => Promise<T>) => Promise<T> {
  let chain: Promise<unknown> = Promise.resolve();
  return async function runExclusive<T>(task: () => Promise<T>): Promise<T> {
    const next = chain.then(() => task());
    chain = next.catch(() => undefined);
    return next;
  };
}
