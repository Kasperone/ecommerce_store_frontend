import { createPinia, setActivePinia, type Pinia } from 'pinia'

/**
 * Spin up a fresh Pinia and register it as the active instance for the
 * current test. Use in `beforeEach` so every test starts from a clean state
 * — Pinia stores are singletons within a Pinia, and stale state across tests
 * is one of the loudest sources of false positives.
 */
export function setupTestPinia(): Pinia {
  const pinia = createPinia()
  setActivePinia(pinia)
  return pinia
}
