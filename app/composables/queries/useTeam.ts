/**
 * Pinia Colada query + mutations for the caller's company team roster (B2B
 * slice 5 — `company_users` membership management).
 *
 * Backed by the team router (owner-scoped to the caller's own company; the
 * company id is resolved from the JWT, never in the path):
 *   - `GET    /api/v1/companies/me/users`        → roster (any active member)
 *   - `POST   /api/v1/companies/me/users`        → invite by email + role (COMPANY_ADMIN)
 *   - `PATCH  /api/v1/companies/me/users/{id}`   → change role / status (COMPANY_ADMIN)
 *   - `DELETE /api/v1/companies/me/users/{id}`   → remove a member (COMPANY_ADMIN)
 *
 * The roster query is **client-gated** (`enabled: () => import.meta.client`):
 * it's an authed read and Pinia Colada doesn't serialize its cache across SSR,
 * so a server-run authed query throws a hydration mismatch on a hard load
 * (SSR-hydration rule #87). Every mutation is non-optimistic — it invalidates
 * the `['company','team']` namespace so the roster refetches from the server.
 *
 * Member types are read straight from the generated OpenAPI map; the hand-rolled
 * `shared/types/api` barrel is orchestrator-owned, so we alias the schemas here.
 *
 * The role / status literals + their badge colours are single-sourced off the
 * generated `CompanyMemberResponse` shape and exported from this module (the
 * team components import them) so a backend enum change surfaces as a type error
 * here rather than silently drifting in a page-local array
 * (see "Lift FE status-literal arrays to shared/utils helpers").
 */

import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import type { components } from '#shared/types/api.gen'

export type CompanyMemberResponse = components['schemas']['CompanyMemberResponse']
export type CompanyMemberInvite = components['schemas']['CompanyMemberInvite']
export type CompanyMemberUpdate = components['schemas']['CompanyMemberUpdate']
export type CompanyRole = CompanyMemberResponse['role']
export type CompanyMemberStatus = CompanyMemberResponse['status']

/** The B2B roles a member may hold — single-sourced off the generated schema. */
export const COMPANY_ROLES: CompanyRole[] = ['COMPANY_ADMIN', 'BUYER', 'APPROVER', 'VIEWER']

/** The membership lifecycle statuses. */
export const COMPANY_MEMBER_STATUSES: CompanyMemberStatus[] = ['active', 'invited', 'suspended']

type BadgeColor = 'neutral' | 'primary' | 'success' | 'info' | 'warning' | 'error'

const ROLE_COLORS: Record<CompanyRole, BadgeColor> = {
  COMPANY_ADMIN: 'primary',
  BUYER: 'info',
  APPROVER: 'warning',
  VIEWER: 'neutral',
}

const STATUS_COLORS: Record<CompanyMemberStatus, BadgeColor> = {
  active: 'success',
  invited: 'info',
  suspended: 'warning',
}

export function companyRoleColor(role: CompanyRole): BadgeColor {
  return ROLE_COLORS[role] ?? 'neutral'
}

export function companyMemberStatusColor(status: CompanyMemberStatus): BadgeColor {
  return STATUS_COLORS[status] ?? 'neutral'
}

const TEAM_NAMESPACE = ['company', 'team'] as const

/**
 * `GET /api/v1/companies/me/users` — the caller's company roster, newest first.
 * Any active member may read; the page hides mutate controls for non-admins.
 */
export function useTeamQuery() {
  const { apiFetch } = useApi()
  return useQuery({
    key: () => [...TEAM_NAMESPACE, 'list'],
    query: () => apiFetch<CompanyMemberResponse[]>('/api/v1/companies/me/users'),
    // Client-only: authed read, Colada isn't SSR-serialized (rule #87).
    enabled: () => import.meta.client,
  })
}

/**
 * `POST /api/v1/companies/me/users` (COMPANY_ADMIN) — invite by email + role.
 * The email must resolve to an existing user account (D-D-7); an unknown email
 * 404s and the page surfaces a "no account found — they must register first"
 * message. A user already in the company 409s.
 */
export function useInviteMember() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (body: CompanyMemberInvite) =>
      apiFetch<CompanyMemberResponse>('/api/v1/companies/me/users', {
        method: 'POST',
        body,
      }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...TEAM_NAMESPACE] }),
  })
}

/**
 * `PATCH /api/v1/companies/me/users/{id}` (COMPANY_ADMIN) — change a member's
 * role and/or status. The backend 409s on demoting/suspending the last active
 * COMPANY_ADMIN; the page surfaces that as a friendly message.
 */
export function useUpdateMember() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ id, patch }: { id: number, patch: CompanyMemberUpdate }) =>
      apiFetch<CompanyMemberResponse>(`/api/v1/companies/me/users/${id}`, {
        method: 'PATCH',
        body: patch,
      }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...TEAM_NAMESPACE] }),
  })
}

/**
 * `DELETE /api/v1/companies/me/users/{id}` (COMPANY_ADMIN) — remove a member
 * (204). 409s if it would remove the last active COMPANY_ADMIN.
 */
export function useRemoveMember() {
  const { apiFetch } = useApi()
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (id: number) =>
      apiFetch<unknown>(`/api/v1/companies/me/users/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryCache.invalidateQueries({ key: [...TEAM_NAMESPACE] }),
  })
}
