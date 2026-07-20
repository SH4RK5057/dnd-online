import { useCallback, useEffect, useState } from 'react'
import * as Y from 'yjs'
import type { RuleOverrideRecord } from './ruleOverrides'

function overridesMap(doc: Y.Doc) {
  return doc.getMap<RuleOverrideRecord>('ruleOverrides')
}

export interface CreateRuleOverrideInput {
  scope: RuleOverrideRecord['scope']
  sceneId: string | null
  targetType: RuleOverrideRecord['targetType']
  targetKey: string
  statPath: string | null
  label: string
  value: string
}

export interface UseRuleOverridesResult {
  ruleOverrides: RuleOverrideRecord[]
  createRuleOverride: (input: CreateRuleOverrideInput) => string
  updateRuleOverride: (id: string, patch: Partial<CreateRuleOverrideInput>) => void
  deleteRuleOverride: (id: string) => void
}

/** DM-only by UI convention (same as every other entity in this app — Yjs
 * itself enforces no write permissions). Flat `doc.getMap('ruleOverrides')`,
 * one record per override, no nested collections. */
export function useRuleOverrides(doc: Y.Doc | null): UseRuleOverridesResult {
  const [ruleOverrides, setRuleOverrides] = useState<RuleOverrideRecord[]>([])

  useEffect(() => {
    if (!doc) {
      setRuleOverrides([])
      return
    }
    const m = overridesMap(doc)
    const sync = () => setRuleOverrides(Array.from(m.values()))
    sync()
    m.observe(sync)
    return () => m.unobserve(sync)
  }, [doc])

  const createRuleOverride = useCallback(
    (input: CreateRuleOverrideInput): string => {
      if (!doc) throw new Error('No active session.')
      const id = crypto.randomUUID()
      const record: RuleOverrideRecord = { ...input, id, createdAt: Date.now() }
      overridesMap(doc).set(id, record)
      return id
    },
    [doc],
  )

  const updateRuleOverride = useCallback(
    (id: string, patch: Partial<CreateRuleOverrideInput>) => {
      if (!doc) return
      const m = overridesMap(doc)
      const record = m.get(id)
      if (!record) return
      m.set(id, { ...record, ...patch })
    },
    [doc],
  )

  const deleteRuleOverride = useCallback(
    (id: string) => {
      if (!doc) return
      overridesMap(doc).delete(id)
    },
    [doc],
  )

  return { ruleOverrides, createRuleOverride, updateRuleOverride, deleteRuleOverride }
}
