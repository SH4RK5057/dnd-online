import { ABILITY_LABELS } from '../character/types'
import type { AbilityKey } from '../character/types'
import type { AreaEffect } from '../map/areaEffects'

const ABILITY_OPTIONS = Object.keys(ABILITY_LABELS) as AbilityKey[]

const DEFAULT_EFFECT: AreaEffect = { damageDice: '2d6', savingThrow: 'dex', saveDc: 13, savingThrowEffect: 'half' }

/** Shared "deals damage on entry" checkbox + damage/save fields — the same
 * shape of payload (map/areaEffects.ts AreaEffect) is configurable on both
 * hazard tokens (TokenUploadButton) and hazardous terrain (TerrainPaintPanel),
 * so the form itself lives here once instead of twice. */
export function AreaEffectFields({
  label,
  value,
  onChange,
}: {
  label: string
  value: AreaEffect | null
  onChange: (value: AreaEffect | null) => void
}) {
  return (
    <>
      <label>
        <input type="checkbox" checked={value !== null} onChange={(event) => onChange(event.target.checked ? DEFAULT_EFFECT : null)} />
        {label}
      </label>
      {value && (
        <span className="area-effect-fields">
          <input
            value={value.damageDice}
            onChange={(event) => onChange({ ...value, damageDice: event.target.value })}
            placeholder="Damage, e.g. 2d6"
            title="Damage dice"
          />
          <select
            value={value.savingThrow}
            onChange={(event) => onChange({ ...value, savingThrow: event.target.value as AbilityKey })}
          >
            {ABILITY_OPTIONS.map((ability) => (
              <option key={ability} value={ability}>
                {ABILITY_LABELS[ability]}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={1}
            value={value.saveDc}
            onChange={(event) => onChange({ ...value, saveDc: Math.max(1, Number(event.target.value)) })}
            title="Save DC"
          />
          <select
            value={value.savingThrowEffect}
            onChange={(event) => onChange({ ...value, savingThrowEffect: event.target.value as 'half' | 'negates' })}
          >
            <option value="half">Half on save</option>
            <option value="negates">Negates on save</option>
          </select>
        </span>
      )}
    </>
  )
}
