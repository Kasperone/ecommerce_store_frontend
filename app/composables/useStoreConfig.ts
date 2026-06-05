import type { components } from '#shared/types/api.gen'

type StoreConfigPublic = components['schemas']['StoreConfigPublic']

/**
 * Public store-config reader for the footer.
 *
 * The backend exposes a slim public projection of the `store_config` singleton
 * at `GET /api/v1/store-config` (legal_name / address / NIP / REGON / KRS /
 * contact / socials). It is an **anonymous** read, so this uses `useAsyncData`
 * (the public-catalog pattern, NOT authed Pinia-Colada) — it serializes across
 * SSR and stays deterministic on hydration.
 *
 * Empty-safe by design: if the request fails (or store-config is unset) the
 * footer falls back to `null` and simply hides the company-identification block
 * and any social icon without a URL. Consumers should treat every field as
 * possibly blank.
 */
export function useStoreConfig() {
  const { apiFetch } = useApi()

  return useAsyncData<StoreConfigPublic | null>(
    'store-config-public',
    async () => {
      // Best-effort: a missing/erroring store-config must never break the
      // footer. Swallow the error and fall back to `null` so the company block
      // and socials simply hide.
      try {
        return await apiFetch<StoreConfigPublic>('/api/v1/store-config')
      }
      catch {
        return null
      }
    },
    {
      default: () => null,
    },
  )
}
