import { useSession } from '../session/useSession'
import { useConnectionStatus } from '../session/useConnectionStatus'
import { useCharacters } from '../character/useCharacters'
import { useTokens } from '../map/useTokens'
import type { PendingTokenPlacement } from '../screens/pendingTokenPlacement'

/** DM-only: lists every character bound to this campaign (player characters
 * and DM-authored NPC sheets alike) with a one-click "Place token" action —
 * the character-roster equivalent of the compendium's monster "Add to
 * scene" button. Placing pre-links the token to the character (HP then
 * lives on the sheet, see character/rules.ts resolveTokenHp) and, for
 * player-owned characters, assigns the token's owner too so that player's
 * fog-of-war comes online immediately without a separate Token Ownership
 * step. Renders nothing of its own while a placement is pending — the
 * shared "click the map to place X (or cancel)" banner is TokenUploadButton's
 * job, since both tools live in the same Token Placement tab. */
export function CharacterTokenMenu({
  sceneId,
  pendingPlacement,
  onRequestPlacement,
}: {
  sceneId: string
  pendingPlacement: PendingTokenPlacement | null
  onRequestPlacement: (placement: PendingTokenPlacement) => void
}) {
  const { session } = useSession()
  const doc = session?.doc ?? null
  const { peers } = useConnectionStatus(session)
  const { characters } = useCharacters(doc)
  const { tokens } = useTokens(doc, sceneId)

  if (pendingPlacement || characters.length === 0) return null

  const onSceneCharacterIds = new Set(tokens.filter((t) => t.characterId).map((t) => t.characterId))

  const ownerLabel = (ownerId: string) => {
    if (ownerId === 'npc') return 'NPC'
    return peers.find((p) => p.playerId === ownerId)?.name ?? 'Player'
  }

  return (
    <div className="character-token-menu">
      <h3>Characters</h3>
      <ul className="character-token-menu__list">
        {characters.map((character) => (
          <li key={character.id} className="character-token-menu__item">
            <span>
              {character.name} <span className="character-token-menu__owner">({ownerLabel(character.ownerId)})</span>
              {onSceneCharacterIds.has(character.id) && (
                <span className="character-token-menu__badge">on this scene</span>
              )}
            </span>
            <button
              type="button"
              onClick={() =>
                onRequestPlacement({
                  name: character.name,
                  sizeCategory: 'medium',
                  file: null,
                  modelFile: null,
                  monsterInit: null,
                  characterInit: { characterId: character.id, ownerId: character.ownerId },
                  hazardSize: null,
                  trapEffect: null,
                  containerInit: null,
                })
              }
            >
              Place token
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
