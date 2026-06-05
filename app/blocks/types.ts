/**
 * CMS section/block types — derived from the generated OpenAPI schema so they
 * can never drift from the backend's Pydantic discriminated union.
 *
 * `Section` is the element type of `PagePublic.layout.sections` (the published,
 * `-Output` union). We derive it from `PagePublic` rather than hand-listing the
 * member schemas: add/rename a block on the backend → regenerate → the union
 * here updates and the TS compiler flags every stale block component.
 */
import type { components } from '#shared/types/api.gen'

type PagePublic = components['schemas']['PagePublic']

/** The published layout's `sections` array element — the block discriminated union. */
export type Section = NonNullable<PagePublic['layout']['sections']>[number]

/** The discriminant `type` literal shared by every section. */
export type SectionType = Section['type']

/** Narrow a `Section` to the member with the given `type`. */
export type SectionOf<T extends SectionType> = Extract<Section, { type: T }>

/** A block's `settings` object for a given section `type` (may be undefined). */
export type SettingsOf<T extends SectionType> = SectionOf<T>['settings']
