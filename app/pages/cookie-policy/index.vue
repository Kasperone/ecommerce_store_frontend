<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const categories = ['necessary', 'analytics', 'marketing'] as const

useSeoMeta({
  title: () => t('legal.cookies.meta.title'),
  description: () => t('legal.cookies.meta.description'),
})
</script>

<template>
  <LegalPageShell
    :title="t('legal.cookies.title')"
    :intro="t('legal.cookies.intro')"
  >
    <LegalSection
      :heading="t('legal.cookies.sections.what.heading')"
      body-key="legal.cookies.sections.what.body"
    />

    <section class="c-legal-section">
      <h2 class="text-xl font-semibold mb-3">
        {{ t('legal.cookies.sections.categories.heading') }}
      </h2>
      <dl class="space-y-3">
        <div
          v-for="cat in categories"
          :key="cat"
          class="rounded-md border border-default p-4"
        >
          <dt class="font-medium">
            {{ t(`legal.cookies.sections.categories.${cat}.name`) }}
          </dt>
          <dd class="text-muted mt-1">
            {{ t(`legal.cookies.sections.categories.${cat}.desc`) }}
          </dd>
        </div>
      </dl>
    </section>

    <LegalSection
      :heading="t('legal.cookies.sections.manage.heading')"
      body-key="legal.cookies.sections.manage.body"
    />
    <LegalSection
      :heading="t('legal.cookies.sections.retention.heading')"
      body-key="legal.cookies.sections.retention.body"
    />
  </LegalPageShell>
</template>
