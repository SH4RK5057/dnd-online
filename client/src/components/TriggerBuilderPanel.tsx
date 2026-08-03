import { useState, type FormEvent } from 'react'
import { useSession } from '../session/useSession'
import { useWalls } from '../map/useWalls'
import { useTokens } from '../map/useTokens'
import { useCompendium } from '../content/useCompendium'
import { AreaEffectFields } from './AreaEffectFields'
import type { AreaEffect } from '../map/areaEffects'
import type { TriggerAction } from '../map/types'
import type { PendingTriggerPlacement } from '../screens/pendingTriggerPlacement'

function summarizeAction(
  action: TriggerAction,
  doorNames: Map<string, string>,
  tokenNames: Map<string, string>,
  monsterNames: Map<string, string>,
): string {
  switch (action.type) {
    case 'toggleDoor':
      return `${action.open ? 'Open' : 'Close'} door "${doorNames.get(action.wallId) ?? action.wallId}"`
    case 'revealToken':
      return `Reveal "${tokenNames.get(action.tokenId) ?? action.tokenId}"`
    case 'spawnToken':
      return `Spawn ${monsterNames.get(action.monsterKey) ?? action.monsterKey} at (${action.x}, ${action.y})`
    case 'applyEffect':
      return `Apply effect: ${action.effect.damageDice} ${action.effect.savingThrow.toUpperCase()} DC ${action.effect.saveDc}`
  }
}

const ACTION_TYPE_LABELS: Record<TriggerAction['type'], string> = {
  toggleDoor: 'Toggle a door',
  revealToken: 'Reveal a hidden token',
  spawnToken: 'Spawn a monster',
  applyEffect: 'Apply a damage/save effect',
}

/** DM-only: builds a trigger zone (pressure plate/tripwire) — name, size,
 * hidden/perceptionDc/oneShot fields (same conventions as hazard tokens),
 * and a list of actions to fire, then arms the shared click-to-place flow
 * like TerrainPaintPanel. Action authoring is a small "draft" sub-form
 * (type-specific inline fields) that appends into a running action list,
 * mirroring ChestPlacementPanel's item-list pattern. */
export function TriggerBuilderPanel({
  sceneId,
  pendingPlacement,
  onRequestPlacement,
  onCancelPlacement,
}: {
  sceneId: string
  pendingPlacement: PendingTriggerPlacement | null
  onRequestPlacement: (placement: PendingTriggerPlacement) => void
  onCancelPlacement: () => void
}) {
  const { session } = useSession()
  const doc = session?.doc ?? null
  const { walls } = useWalls(doc, sceneId)
  const { tokens } = useTokens(doc, sceneId)
  const compendium = useCompendium(doc)

  const [name, setName] = useState('')
  const [widthCells, setWidthCells] = useState(1)
  const [heightCells, setHeightCells] = useState(1)
  const [hidden, setHidden] = useState(true)
  const [perceptionDc, setPerceptionDc] = useState<number | ''>('')
  const [oneShot, setOneShot] = useState(true)
  const [actions, setActions] = useState<TriggerAction[]>([])

  const doors = walls.filter((w) => w.isDoor)
  const hiddenTokens = tokens.filter((t) => t.hidden)

  const [draftType, setDraftType] = useState<TriggerAction['type']>('toggleDoor')
  const [draftDoorId, setDraftDoorId] = useState('')
  const [draftDoorOpen, setDraftDoorOpen] = useState(true)
  const [draftTokenId, setDraftTokenId] = useState('')
  const [draftMonsterKey, setDraftMonsterKey] = useState('')
  const [draftSpawnX, setDraftSpawnX] = useState(0)
  const [draftSpawnY, setDraftSpawnY] = useState(0)
  const [draftEffect, setDraftEffect] = useState<AreaEffect | null>(null)

  if (pendingPlacement) {
    return (
      <div className="token-upload token-upload--pending">
        <span>Click the map to place trigger "{pendingPlacement.name}" (or cancel)</span>
        <button type="button" onClick={onCancelPlacement}>
          Cancel
        </button>
      </div>
    )
  }

  const doorNames = new Map(doors.map((w) => [w.id, w.isDoor ? `#${w.id.slice(0, 4)}` : w.id]))
  const tokenNames = new Map(hiddenTokens.map((t) => [t.id, t.name]))
  const monsterNames = new Map(compendium.monsters.map((m) => [m.key, m.name]))

  const addAction = () => {
    if (draftType === 'toggleDoor') {
      if (!draftDoorId) return
      setActions((prev) => [...prev, { type: 'toggleDoor', wallId: draftDoorId, open: draftDoorOpen }])
    } else if (draftType === 'revealToken') {
      if (!draftTokenId) return
      setActions((prev) => [...prev, { type: 'revealToken', tokenId: draftTokenId }])
    } else if (draftType === 'spawnToken') {
      if (!draftMonsterKey) return
      setActions((prev) => [...prev, { type: 'spawnToken', monsterKey: draftMonsterKey, x: draftSpawnX, y: draftSpawnY }])
    } else if (draftType === 'applyEffect') {
      if (!draftEffect) return
      setActions((prev) => [...prev, { type: 'applyEffect', effect: draftEffect }])
    }
  }

  const removeAction = (index: number) => setActions((prev) => prev.filter((_, i) => i !== index))

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || actions.length === 0) return
    onRequestPlacement({
      name: trimmed,
      widthCells: Math.max(1, widthCells),
      heightCells: Math.max(1, heightCells),
      hidden,
      perceptionDc: perceptionDc === '' ? null : perceptionDc,
      oneShot,
      actions,
    })
    setName('')
    setActions([])
  }

  return (
    <form className="trigger-builder-panel" onSubmit={handleSubmit}>
      <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Trigger name, e.g. Pressure plate" />
      <span className="token-upload__hazard-size">
        <input
          type="number"
          min={1}
          value={widthCells}
          onChange={(event) => setWidthCells(Math.max(1, Number(event.target.value)))}
          title="Width (grid cells)"
        />
        ×
        <input
          type="number"
          min={1}
          value={heightCells}
          onChange={(event) => setHeightCells(Math.max(1, Number(event.target.value)))}
          title="Height (grid cells)"
        />
        cells
      </span>
      <label>
        <input type="checkbox" checked={hidden} onChange={(event) => setHidden(event.target.checked)} />
        Hidden until it fires
      </label>
      {hidden && (
        <label title="A player whose passive Perception meets or beats this DC auto-reveals this trigger, if the campaign's passive perception toggle is on. Leave blank to never auto-reveal.">
          Perception DC to notice (optional)
          <input
            type="number"
            value={perceptionDc}
            placeholder="Never auto-reveals"
            onChange={(event) => setPerceptionDc(event.target.value === '' ? '' : Number(event.target.value))}
          />
        </label>
      )}
      <label>
        <input type="checkbox" checked={oneShot} onChange={(event) => setOneShot(event.target.checked)} />
        Fires only once
      </label>

      <h4>Actions</h4>
      {actions.length > 0 && (
        <ul className="character-sheet__row-list">
          {actions.map((action, index) => (
            <li key={index} className="character-sheet__row">
              <span>{summarizeAction(action, doorNames, tokenNames, monsterNames)}</span>
              <button type="button" onClick={() => removeAction(index)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="trigger-builder-panel__draft">
        <select value={draftType} onChange={(event) => setDraftType(event.target.value as TriggerAction['type'])}>
          {(Object.keys(ACTION_TYPE_LABELS) as TriggerAction['type'][]).map((type) => (
            <option key={type} value={type}>
              {ACTION_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
        {draftType === 'toggleDoor' && (
          <>
            <select value={draftDoorId} onChange={(event) => setDraftDoorId(event.target.value)}>
              <option value="">Choose a door…</option>
              {doors.map((door) => (
                <option key={door.id} value={door.id}>
                  {doorNames.get(door.id)}
                </option>
              ))}
            </select>
            <select value={draftDoorOpen ? 'open' : 'close'} onChange={(event) => setDraftDoorOpen(event.target.value === 'open')}>
              <option value="open">Open it</option>
              <option value="close">Close it</option>
            </select>
          </>
        )}
        {draftType === 'revealToken' && (
          <select value={draftTokenId} onChange={(event) => setDraftTokenId(event.target.value)}>
            <option value="">Choose a hidden token…</option>
            {hiddenTokens.map((token) => (
              <option key={token.id} value={token.id}>
                {token.name}
              </option>
            ))}
          </select>
        )}
        {draftType === 'spawnToken' && (
          <>
            <select value={draftMonsterKey} onChange={(event) => setDraftMonsterKey(event.target.value)}>
              <option value="">Choose a monster…</option>
              {compendium.monsters.map((monster) => (
                <option key={monster.key} value={monster.key}>
                  {monster.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              value={draftSpawnX}
              onChange={(event) => setDraftSpawnX(Number(event.target.value))}
              title="Spawn X (grid cells)"
            />
            <input
              type="number"
              value={draftSpawnY}
              onChange={(event) => setDraftSpawnY(Number(event.target.value))}
              title="Spawn Y (grid cells)"
            />
          </>
        )}
        {draftType === 'applyEffect' && <AreaEffectFields label="Configure effect" value={draftEffect} onChange={setDraftEffect} />}
        <button type="button" onClick={addAction}>
          Add action
        </button>
      </div>

      <button type="submit" disabled={!name.trim() || actions.length === 0}>
        Place trigger
      </button>
    </form>
  )
}
