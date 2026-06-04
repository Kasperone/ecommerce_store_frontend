<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AddressInput } from '#shared/validators/address'
import {
  useAddressesQuery,
  useCreateAddress,
  useUpdateAddress,
  useDeleteAddress,
  type Address,
  type AddressCreate,
  type AddressUpdate,
} from '~/composables/queries/useAddresses'

/**
 * Address-book settings: list saved addresses, add/edit (in a modal form),
 * delete (behind a confirm modal), and set the default shipping/billing address.
 *
 * The list comes from the client-gated Colada query; create/update/delete are
 * non-optimistic mutations that invalidate the namespace so the list refetches.
 * Default mutual-exclusion is enforced server-side — "make default" is just a
 * partial PUT that flips the relevant flag.
 */

definePageMeta({
  layout: 'account',
  middleware: 'user',
})

const { t } = useI18n()
const toast = useToast()

useHead({
  titleTemplate: '%s | Account',
})

const { data: addresses, isLoading } = useAddressesQuery()
const { mutateAsync: createAddress } = useCreateAddress()
const { mutateAsync: updateAddress } = useUpdateAddress()
const { mutateAsync: deleteAddress } = useDeleteAddress()

// ---- Add / edit form modal ----

const formOpen = ref(false)
const editTarget = ref<Address | null>(null)
const saving = ref(false)

function onAddRequest() {
  editTarget.value = null
  formOpen.value = true
}

function onEditRequest(address: Address) {
  editTarget.value = address
  formOpen.value = true
}

async function onFormSubmit(values: AddressInput) {
  saving.value = true
  // Normalize optional empties to null for the wire (matches the API's nullable
  // optional fields).
  const payload = {
    label: values.label?.trim() || null,
    recipient_name: values.recipient_name.trim(),
    street: values.street.trim(),
    city: values.city.trim(),
    postal_code: values.postal_code.trim(),
    country: values.country,
    state: values.state?.trim() || null,
    phone: values.phone?.trim() || null,
    is_default_shipping: values.is_default_shipping,
    is_default_billing: values.is_default_billing,
  }
  try {
    if (editTarget.value) {
      await updateAddress({ id: editTarget.value.id, body: payload as AddressUpdate })
      toast.add({ title: t('account.settings.addresses.updated'), color: 'success' })
    }
    else {
      await createAddress(payload as AddressCreate)
      toast.add({ title: t('account.settings.addresses.created'), color: 'success' })
    }
    formOpen.value = false
    editTarget.value = null
  }
  catch {
    toast.add({ title: t('account.settings.addresses.saveError'), color: 'error' })
  }
  finally {
    saving.value = false
  }
}

// ---- Set default shipping / billing ----

const settingDefaultId = ref<number | null>(null)

async function onSetDefaultShipping(address: Address) {
  settingDefaultId.value = address.id
  try {
    await updateAddress({ id: address.id, body: { is_default_shipping: true } })
    toast.add({ title: t('account.settings.addresses.defaultShippingSet'), color: 'success' })
  }
  catch {
    toast.add({ title: t('account.settings.addresses.saveError'), color: 'error' })
  }
  finally {
    settingDefaultId.value = null
  }
}

async function onSetDefaultBilling(address: Address) {
  settingDefaultId.value = address.id
  try {
    await updateAddress({ id: address.id, body: { is_default_billing: true } })
    toast.add({ title: t('account.settings.addresses.defaultBillingSet'), color: 'success' })
  }
  catch {
    toast.add({ title: t('account.settings.addresses.saveError'), color: 'error' })
  }
  finally {
    settingDefaultId.value = null
  }
}

// ---- Delete (confirm modal) ----

const deleteOpen = ref(false)
const deleteTarget = ref<Address | null>(null)
const deletingId = ref<number | null>(null)

function onDeleteRequest(address: Address) {
  deleteTarget.value = address
  deleteOpen.value = true
}

async function onConfirmDelete() {
  const target = deleteTarget.value
  if (!target) return
  deletingId.value = target.id
  try {
    await deleteAddress(target.id)
    toast.add({ title: t('account.settings.addresses.deleted'), color: 'success' })
    deleteOpen.value = false
    deleteTarget.value = null
  }
  catch {
    toast.add({ title: t('account.settings.addresses.deleteError'), color: 'error' })
  }
  finally {
    deletingId.value = null
  }
}
</script>

<template>
  <NuxtLayout>
    <div class="c-account-addresses p-6 max-w-2xl mx-auto space-y-6">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h1 class="text-2xl font-bold">
            {{ t('account.settings.addresses.title') }}
          </h1>
          <p class="text-gray-600 dark:text-gray-400">
            {{ t('account.settings.addresses.subtitle') }}
          </p>
        </div>
        <UButton
          color="primary"
          icon="i-lucide-plus"
          @click="onAddRequest"
        >
          {{ t('account.settings.addresses.add') }}
        </UButton>
      </div>

      <ClientOnly>
        <div
          v-if="isLoading && (addresses?.length ?? 0) === 0"
          class="py-8 text-center text-gray-500"
        >
          {{ t('account.settings.addresses.loading') }}
        </div>

        <div
          v-else-if="(addresses?.length ?? 0) === 0"
          class="rounded-lg border border-dashed border-gray-300 py-12 text-center dark:border-gray-700"
        >
          <UIcon
            name="i-lucide-map-pin"
            class="mx-auto mb-2 size-8 text-gray-400"
          />
          <p class="text-gray-600 dark:text-gray-400">
            {{ t('account.settings.addresses.empty') }}
          </p>
        </div>

        <div
          v-else
          class="space-y-4"
        >
          <AccountAddressesAddressCard
            v-for="address in addresses"
            :key="address.id"
            :address="address"
            :busy="settingDefaultId === address.id || deletingId === address.id"
            @edit="onEditRequest"
            @delete="onDeleteRequest"
            @set-default-shipping="onSetDefaultShipping"
            @set-default-billing="onSetDefaultBilling"
          />
        </div>

        <template #fallback>
          <div class="py-8 text-center text-gray-500">
            {{ t('account.settings.addresses.loading') }}
          </div>
        </template>
      </ClientOnly>
    </div>

    <!-- Add / edit form -->
    <UModal
      v-model:open="formOpen"
      :title="editTarget
        ? t('account.settings.addresses.editTitle')
        : t('account.settings.addresses.addTitle')"
      :dismissible="!saving"
    >
      <template #body>
        <AccountAddressesAddressForm
          :key="editTarget?.id ?? 'new'"
          :address="editTarget"
          :loading="saving"
          @submit="onFormSubmit"
          @cancel="formOpen = false"
        />
      </template>
    </UModal>

    <!-- Delete confirmation -->
    <UModal
      v-model:open="deleteOpen"
      :title="t('account.settings.addresses.deleteConfirmTitle')"
      :dismissible="deletingId === null"
    >
      <template #body>
        <p class="text-sm">
          {{ t('account.settings.addresses.deleteConfirmBody') }}
        </p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton
            color="neutral"
            variant="soft"
            :disabled="deletingId !== null"
            @click="deleteOpen = false"
          >
            {{ t('account.settings.addresses.cancel') }}
          </UButton>
          <UButton
            color="error"
            :loading="deletingId !== null"
            @click="onConfirmDelete"
          >
            {{ t('account.settings.addresses.delete') }}
          </UButton>
        </div>
      </template>
    </UModal>
  </NuxtLayout>
</template>
