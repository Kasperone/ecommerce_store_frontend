/**
 * Polish CLDR plural-form selector for vue-i18n's `pluralRules`.
 *
 * vue-i18n's built-in rule only models one/other (correct for English), so
 * Polish strings — which need one / few / many — mis-select under it (count 1
 * lands on the "few" form). This registers the correct Polish categories.
 *
 * Polish CLDR categories (for integers):
 *   - one:  exactly 1                              → "1 zamówienie"
 *   - few:  ends in 2–4 but NOT 12–14             → "2/3/4/22 zamówienia"
 *   - many: 0, 5–21, ends in 0/1/5–9, or 12–14    → "5/11/12/25 zamówień"
 *
 * Note "one" is *exactly* 1 (21 is "many"), unlike Russian where 21 is "one".
 *
 * We expose a fourth slot at index 0 as a dedicated **zero** form. Real CLDR
 * folds 0 into "many", but a leading zero slot lets review strings render a
 * "Brak opinii" message at count 0; count-bearing strings simply repeat the
 * genitive ("many") text in that slot, so the genitive is still what shows.
 *
 * PL plural strings are therefore authored with four forms:
 *   "zero | one | few | many"
 *
 * `choicesLength` clamping keeps the function safe if a PL string ever carries
 * fewer forms (it indexes the last available slot instead of overflowing).
 */
export function plPluralIndex(choice: number, choicesLength: number): number {
  if (choice === 0) return 0
  if (choice === 1) return 1
  const teen = choice % 100 >= 12 && choice % 100 <= 14
  const lastDigit = choice % 10
  if (!teen && lastDigit >= 2 && lastDigit <= 4) {
    return Math.min(2, choicesLength - 1)
  }
  return Math.min(3, choicesLength - 1)
}
