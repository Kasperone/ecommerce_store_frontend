<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  password: string | null | undefined
  minLength?: number
}>()

const { t } = useI18n()

interface Rule {
  key: string
  label: string
  passed: boolean
}

const rules = computed<Rule[]>(() => {
  const pwd = props.password ?? ''
  const min = props.minLength ?? 8
  return [
    {
      key: 'length',
      label: t('auth.passwordStrength.rules.length', { count: min }),
      passed: pwd.length >= min
    },
    {
      key: 'lowercase',
      label: t('auth.passwordStrength.rules.lowercase'),
      passed: /[a-z]/.test(pwd)
    },
    {
      key: 'uppercase',
      label: t('auth.passwordStrength.rules.uppercase'),
      passed: /[A-Z]/.test(pwd)
    },
    {
      key: 'number',
      label: t('auth.passwordStrength.rules.number'),
      passed: /\d/.test(pwd)
    },
    {
      key: 'symbol',
      label: t('auth.passwordStrength.rules.symbol'),
      passed: /[^A-Za-z0-9]/.test(pwd)
    }
  ]
})

const score = computed(() => rules.value.filter((r) => r.passed).length)

const isValid = computed(() => {
  // Required to submit: length + at least 3 of the other 4 categories
  const lengthOk = rules.value[0]?.passed ?? false
  const others = rules.value.slice(1).filter((r) => r.passed).length
  return lengthOk && others >= 3
})

const strength = computed(() => {
  const s = score.value
  if (!props.password) return { level: 0, label: '', color: 'bg-neutral-200 dark:bg-neutral-700' }
  if (s <= 1) return { level: 1, label: t('auth.passwordStrength.weak'), color: 'bg-red-500' }
  if (s <= 2) return { level: 2, label: t('auth.passwordStrength.fair'), color: 'bg-orange-500' }
  if (s <= 3) return { level: 3, label: t('auth.passwordStrength.medium'), color: 'bg-yellow-500' }
  if (s === 4) return { level: 4, label: t('auth.passwordStrength.strong'), color: 'bg-lime-500' }
  return { level: 5, label: t('auth.passwordStrength.veryStrong'), color: 'bg-green-600' }
})

defineExpose({ isValid, score, strength })
</script>

<template>
  <div v-if="password && password.length > 0" class="c-password-strength mt-2 flex flex-col gap-2">
    <div class="flex items-center gap-2">
      <div class="flex h-1.5 flex-1 gap-1">
        <div
          v-for="i in 5"
          :key="i"
          class="flex-1 rounded-full transition-colors duration-200"
          :class="i <= strength.level ? strength.color : 'bg-neutral-200 dark:bg-neutral-700'"
        />
      </div>
      <span
        v-if="strength.label"
        class="text-xs font-medium"
        :class="{
          'text-red-600 dark:text-red-400': strength.level === 1,
          'text-orange-600 dark:text-orange-400': strength.level === 2,
          'text-yellow-700 dark:text-yellow-400': strength.level === 3,
          'text-lime-700 dark:text-lime-400': strength.level === 4,
          'text-green-700 dark:text-green-400': strength.level === 5
        }"
      >
        {{ strength.label }}
      </span>
    </div>

    <ul class="flex flex-col gap-0.5 text-xs">
      <li
        v-for="rule in rules"
        :key="rule.key"
        class="flex items-center gap-1.5"
        :class="rule.passed ? 'text-green-700 dark:text-green-400' : 'text-neutral-500 dark:text-neutral-400'"
      >
        <UIcon
          :name="rule.passed ? 'i-lucide-check-circle-2' : 'i-lucide-circle'"
          class="h-3.5 w-3.5 shrink-0"
        />
        <span>{{ rule.label }}</span>
      </li>
    </ul>

    <p
      v-if="!isValid"
      class="text-xs text-neutral-500 dark:text-neutral-400"
    >
      {{ t('auth.passwordStrength.notReady') }}
    </p>
  </div>
</template>
