import { formatMoney } from '#shared/utils/money'

/**
 * Full-ICU boot assertion (deployment guard).
 *
 * `Intl` currency/locale correctness depends on the Node runtime shipping
 * **full ICU**. A `small-icu` / system-ICU build silently degrades `pl-PL`
 * money output (wrong decimal separator, ISO code instead of `zł`) — and only
 * in production, where SSR renders prices server-side. This Nitro plugin runs
 * once at server startup and logs a loud error if the runtime cannot format
 * Polish złoty correctly, so a stripped-ICU image is caught in the boot logs
 * (and the deployment smoke check) rather than by a customer staring at
 * "PLN 1234.50" on a Polish product page.
 *
 * Node ≥13 bundles full ICU by default; do not build the production image with
 * `--with-intl=small-icu` or rely on a system ICU that lacks the CLDR data.
 */
export default defineNitroPlugin(() => {
  const sample = formatMoney(1234.5, 'PLN', 'pl')
  const fullIcu = sample.includes('zł') && sample.includes(',')
  if (!fullIcu) {
    console.error(
      '[icu-check] Node runtime is NOT full-ICU: pl-PL PLN formatted as '
      + `${JSON.stringify(sample)} (expected a comma decimal separator + "zł"). `
      + 'Polish money/locale output will be wrong in SSR. Ensure the production '
      + 'image runs a full-ICU Node build.',
    )
  }
})
