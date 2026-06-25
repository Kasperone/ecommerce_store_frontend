<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { NavigationMenuItem } from '@nuxt/ui'
import { flattenCategoryTree } from '#shared/utils/categoryTree'

const route = useRoute()
const router = useRouter()
const { locale, setLocale, t } = useI18n()
const authStore = useAuthStore()
const localePath = useLocalePath()

const { data: categoryTree } = useStorefrontCategories()

async function handleLogout() {
  await authStore.logout()
  await router.push('/login')
}

function toggleLocale() {
  setLocale(locale.value === 'pl' ? 'en' : 'pl')
}

const items = computed<NavigationMenuItem[]>(() => {
  const categoryChildren = flattenCategoryTree(categoryTree.value ?? [], locale.value).map(cat => ({
    label: `${'— '.repeat(cat.depth)}${cat.name}`,
    to: localePath(`/category/${cat.slug}`),
  }))

  return [
    {
      label: t('navigation.products'),
      to: localePath('/products'),
      active: route.path.endsWith('/products') || route.path.includes('/products/'),
    },
    ...(categoryChildren.length
      ? [{ label: t('navigation.categories'), children: categoryChildren }]
      : []),
  ]
})
</script>

<template>
  <UHeader
    class="c-header"
    :to="localePath('/')"
    :toggle="{
      color: 'primary',
      variant: 'subtle',
      class: 'rounded-full',
    }"
  >
    <template #title>
      <!-- UHeader's #title slot already links to home; render the mark as a
           non-anchor to avoid nesting <a> inside <a> (hydration mismatch). -->
      <LayoutLogo :link="false" />
    </template>

    <UNavigationMenu :items="items" />

    <template #right>
      <LayoutSearchBar class="mr-2 hidden md:block" />

      <LayoutCurrencySwitcher class="mr-1 hidden sm:block" />

      <ClientOnly>
        <CartTrigger class="mr-1" />
      </ClientOnly>

      <UColorModeButton class="cursor-pointer" />

      <UTooltip :text="t('header.toggleLang')">
        <UButton
          color="neutral"
          variant="ghost"
          class="ml-2 hidden px-2 text-sm cursor-pointer sm:inline-flex"
          :aria-label="t('header.toggleLang')"
          @click="toggleLocale"
        >
          {{ locale === 'pl' ? 'PL' : 'EN' }}
        </UButton>
      </UTooltip>

      <ClientOnly>
        <UTooltip
          v-if="authStore.isAdmin"
          :text="t('header.admin')"
        >
          <UButton
            color="primary"
            variant="soft"
            class="ml-2 hidden px-2 sm:inline-flex"
            :aria-label="t('header.admin')"
            :to="localePath('/admin')"
            icon="i-lucide-shield"
          />
        </UTooltip>
      </ClientOnly>

      <!--
        Auth state is unknowable on the server (refresh cookie is path-scoped
        to /api/v1/auth). Render this block client-only so the SSR template
        never disagrees with the post-hydration store and we don't end up
        with both Login and Logout in the DOM at once.
      -->
      <ClientOnly>
        <template v-if="authStore.isAuthenticated">
          <UTooltip
            v-if="!authStore.isAdmin"
            :text="t('header.account')"
          >
            <UButton
              color="neutral"
              variant="ghost"
              class="ml-2 hidden px-2 cursor-pointer sm:inline-flex"
              :aria-label="t('header.account')"
              :to="localePath('/account')"
              icon="i-lucide-user"
            />
          </UTooltip>

          <UTooltip
            v-if="!authStore.isAdmin"
            :text="t('header.accountSettings')"
          >
            <UButton
              color="neutral"
              variant="ghost"
              class="ml-2 hidden px-2 cursor-pointer sm:inline-flex"
              :aria-label="t('header.accountSettings')"
              to="/account/profile"
              icon="i-lucide-settings"
            />
          </UTooltip>

          <UTooltip :text="t('header.logout')">
            <UButton
              color="neutral"
              variant="ghost"
              class="ml-2 hidden px-2 cursor-pointer sm:inline-flex"
              aria-label="Logout"
              icon="i-lucide-log-out"
              @click="handleLogout"
            />
          </UTooltip>
        </template>
        <template v-else>
          <UTooltip :text="t('header.login')">
            <UButton
              color="neutral"
              variant="ghost"
              class="ml-2 hidden px-2 sm:inline-flex"
              aria-label="Login"
              to="/login"
              icon="i-lucide-log-in"
            />
          </UTooltip>

          <UTooltip :text="t('header.signUp')">
            <UButton
              color="neutral"
              variant="ghost"
              class="ml-2 hidden px-2 sm:inline-flex"
              aria-label="Sign up"
              to="/sign-up"
              icon="i-lucide-user-plus"
            />
          </UTooltip>
        </template>
      </ClientOnly>
    </template>

    <template #body>
      <LayoutSearchBar class="mb-4 md:hidden" />

      <UNavigationMenu
        :items="items"
        orientation="vertical"
        class="-mx-2.5"
      />

      <!-- Secondary actions that live in #right on sm+; surfaced here on mobile
           (below sm) where they'd otherwise overflow the header bar. -->
      <div class="mt-4 flex flex-col gap-2 border-t border-default pt-4 sm:hidden">
        <div class="flex items-center gap-2">
          <LayoutCurrencySwitcher />
          <UButton
            color="neutral"
            variant="subtle"
            class="px-2 text-sm cursor-pointer"
            :aria-label="t('header.toggleLang')"
            @click="toggleLocale"
          >
            {{ locale === 'pl' ? 'PL' : 'EN' }}
          </UButton>
        </div>

        <ClientOnly>
          <template v-if="authStore.isAuthenticated">
            <UButton
              v-if="authStore.isAdmin"
              block
              color="primary"
              variant="soft"
              class="justify-start"
              :label="t('header.admin')"
              icon="i-lucide-shield"
              :to="localePath('/admin')"
            />
            <template v-if="!authStore.isAdmin">
              <UButton
                block
                color="neutral"
                variant="ghost"
                class="justify-start"
                :label="t('header.account')"
                icon="i-lucide-user"
                :to="localePath('/account')"
              />
              <UButton
                block
                color="neutral"
                variant="ghost"
                class="justify-start"
                :label="t('header.accountSettings')"
                icon="i-lucide-settings"
                to="/account/profile"
              />
            </template>
            <UButton
              block
              color="neutral"
              variant="ghost"
              class="justify-start"
              :label="t('header.logout')"
              icon="i-lucide-log-out"
              @click="handleLogout"
            />
          </template>
          <template v-else>
            <UButton
              block
              color="neutral"
              variant="ghost"
              class="justify-start"
              :label="t('header.login')"
              icon="i-lucide-log-in"
              to="/login"
            />
            <UButton
              block
              color="neutral"
              variant="ghost"
              class="justify-start"
              :label="t('header.signUp')"
              icon="i-lucide-user-plus"
              to="/sign-up"
            />
          </template>
        </ClientOnly>
      </div>
    </template>
  </UHeader>
</template>
