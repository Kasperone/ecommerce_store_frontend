/**
 * Pinia Colada mutations for B2B net-terms auto-charge card vaulting (tail
 * Program C — opt-in, per-company).
 *
 * The company's card is vaulted via a Stripe SetupIntent, confirmed browser-side
 * (Payment Element, setup mode), then registered with the backend:
 *
 * 1. `POST /companies/me/auto-charge/setup-intent` → `{ client_secret }` — ensures
 *    a Stripe Customer for the company and opens a card-vaulting SetupIntent.
 * 2. Browser confirms the SetupIntent (see `AccountAutoChargeCardSetup`).
 * 3. `POST /companies/me/auto-charge/confirm { setup_intent_id }` → stores the
 *    resulting PaymentMethod (validated server-side against the company's Customer).
 * 4. `DELETE /companies/me/auto-charge` → forget the vaulted card.
 *
 * All three are COMPANY_ADMIN-only (enforced server-side). The current card state
 * (`auto_charge_card_set`) rides the company credit summary (`useCompanyCredit`),
 * so callers refetch that after a mutation rather than reading the returned status
 * in two places.
 */

import { useMutation } from '@pinia/colada'
import type { components } from '#shared/types/api.gen'

type SetupIntentResponse = components['schemas']['AutoChargeSetupIntentResponse']
type StatusResponse = components['schemas']['AutoChargeStatusResponse']

export function useCreateAutoChargeSetupIntent() {
  const { apiFetch } = useApi()
  return useMutation({
    mutation: () =>
      apiFetch<SetupIntentResponse>('/api/v1/companies/me/auto-charge/setup-intent', {
        method: 'POST',
      }),
  })
}

export function useConfirmAutoCharge() {
  const { apiFetch } = useApi()
  return useMutation({
    mutation: (setupIntentId: string) =>
      apiFetch<StatusResponse>('/api/v1/companies/me/auto-charge/confirm', {
        method: 'POST',
        body: { setup_intent_id: setupIntentId },
      }),
  })
}

export function useRemoveAutoCharge() {
  const { apiFetch } = useApi()
  return useMutation({
    mutation: () =>
      apiFetch<StatusResponse>('/api/v1/companies/me/auto-charge', { method: 'DELETE' }),
  })
}
