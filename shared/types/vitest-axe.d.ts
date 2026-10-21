// `test/setup.ts` registers the vitest-axe matchers at runtime via
// `expect.extend`, but the package only augments the legacy global `Vi`
// namespace, not vitest's own `Assertion` interface. Without this, every
// `expect(await axe(html)).toHaveNoViolations()` is a TS2339.
import type { AxeMatchers } from 'vitest-axe/matchers'

declare module 'vitest' {
  // Declaration merging must repeat vitest's own `T = any` parameter.
  /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Assertion<T = any> extends AxeMatchers {}
  /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface AsymmetricMatchersContaining extends AxeMatchers {}
}
