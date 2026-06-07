import '@testing-library/jest-dom/vitest'
import { expect } from 'vitest'
import * as axeMatchers from 'vitest-axe/matchers'

expect.extend(axeMatchers)

// The vitest workers inherit Node's experimental `--localstorage-file` flag
// without a valid path, which leaves `globalThis.localStorage` as a stub with
// NO methods (`typeof localStorage.setItem === 'undefined'`). In the nuxt test
// environment `window === globalThis`, so @nuxtjs/color-mode's client plugin
// (which `localStorage.setItem`s in an immediate watcher since the @nuxt/ui
// 4.8 moduleDependencies rework) throws during Nuxt app init — aborting the
// plugin chain BEFORE @nuxtjs/i18n installs vue-i18n, which then fails every
// mountSuspended spec with "Need to install with `app.use` function".
// Replace the broken stub with a real in-memory Storage.
function makeMemoryStorage(): Storage {
  const store = new Map<string, string>()
  return {
    get length() { return store.size },
    clear: () => { store.clear() },
    getItem: (k: string) => store.get(k) ?? null,
    key: (i: number) => [...store.keys()][i] ?? null,
    removeItem: (k: string) => { store.delete(k) },
    setItem: (k: string, v: string) => { store.set(k, String(v)) },
  } as Storage
}
for (const name of ['localStorage', 'sessionStorage'] as const) {
  let broken = false
  try {
    broken = typeof globalThis[name]?.setItem !== 'function'
  }
  catch {
    broken = true
  }
  if (broken) {
    Object.defineProperty(globalThis, name, {
      value: makeMemoryStorage(),
      writable: true,
      configurable: true,
    })
  }
}
