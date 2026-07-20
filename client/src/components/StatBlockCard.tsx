import { TaggedText } from './TaggedText'
import type { CompendiumEntry } from '../content/types'

function SpellCard({ data }: { data: Extract<CompendiumEntry, { kind: 'spell' }>['data'] }) {
  return (
    <div className="stat-block-card">
      <h3>{data.name}</h3>
      <p className="stat-block-card__subtitle">
        {data.level === 0 ? 'Cantrip' : `Level ${data.level}`} — {data.school}
      </p>
      <dl className="stat-block-card__meta">
        <dt>Casting Time</dt>
        <dd>{data.castingTime}</dd>
        <dt>Range</dt>
        <dd>{data.range}</dd>
        <dt>Components</dt>
        <dd>{data.components}</dd>
        <dt>Duration</dt>
        <dd>{data.duration}</dd>
        {data.classes.length > 0 && (
          <>
            <dt>Classes</dt>
            <dd>{data.classes.join(', ')}</dd>
          </>
        )}
      </dl>
      {data.entries.map((entry, i) => (
        <p key={i}>
          <TaggedText text={entry} />
        </p>
      ))}
    </div>
  )
}

function MonsterCard({ data }: { data: Extract<CompendiumEntry, { kind: 'monster' }>['data'] }) {
  return (
    <div className="stat-block-card">
      <h3>{data.name}</h3>
      <p className="stat-block-card__subtitle">
        {data.size} {data.type}, {data.alignment}
      </p>
      <dl className="stat-block-card__meta">
        <dt>Armor Class</dt>
        <dd>
          {data.ac} {data.acNote && `(${data.acNote})`}
        </dd>
        <dt>Hit Points</dt>
        <dd>
          {data.hp} {data.hitDice && `(${data.hitDice})`}
        </dd>
        <dt>Speed</dt>
        <dd>{data.speed}</dd>
      </dl>
      <div className="stat-block-card__abilities">
        {(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).map((key) => (
          <div key={key}>
            <span className="stat-block-card__ability-label">{key.toUpperCase()}</span>
            <span>{data.abilities[key]}</span>
          </div>
        ))}
      </div>
      <dl className="stat-block-card__meta">
        {data.savingThrows && (
          <>
            <dt>Saving Throws</dt>
            <dd>{data.savingThrows}</dd>
          </>
        )}
        {data.skills && (
          <>
            <dt>Skills</dt>
            <dd>{data.skills}</dd>
          </>
        )}
        {data.damageResistances && (
          <>
            <dt>Resistances</dt>
            <dd>{data.damageResistances}</dd>
          </>
        )}
        {data.damageImmunities && (
          <>
            <dt>Damage Immunities</dt>
            <dd>{data.damageImmunities}</dd>
          </>
        )}
        {data.conditionImmunities && (
          <>
            <dt>Condition Immunities</dt>
            <dd>{data.conditionImmunities}</dd>
          </>
        )}
        <dt>Senses</dt>
        <dd>{data.senses}</dd>
        <dt>Languages</dt>
        <dd>{data.languages || '—'}</dd>
        <dt>Challenge</dt>
        <dd>{data.cr}</dd>
      </dl>
      {data.traits.length > 0 && (
        <>
          <h4>Traits</h4>
          {data.traits.map((t, i) => (
            <p key={i}>
              <strong>{t.name}.</strong>{' '}
              {t.entries.map((e, j) => (
                <TaggedText key={j} text={e} />
              ))}
            </p>
          ))}
        </>
      )}
      {data.actions.length > 0 && (
        <>
          <h4>Actions</h4>
          {data.actions.map((a, i) => (
            <p key={i}>
              <strong>{a.name}.</strong>{' '}
              {a.entries.map((e, j) => (
                <TaggedText key={j} text={e} />
              ))}
            </p>
          ))}
        </>
      )}
      {data.legendaryActions.length > 0 && (
        <>
          <h4>Legendary Actions</h4>
          {data.legendaryActions.map((a, i) => (
            <p key={i}>
              <strong>{a.name}.</strong>{' '}
              {a.entries.map((e, j) => (
                <TaggedText key={j} text={e} />
              ))}
            </p>
          ))}
        </>
      )}
    </div>
  )
}

function ItemCard({ data }: { data: Extract<CompendiumEntry, { kind: 'item' }>['data'] }) {
  return (
    <div className="stat-block-card">
      <h3>{data.name}</h3>
      <p className="stat-block-card__subtitle">
        {data.type} — {data.rarity}
      </p>
      <dl className="stat-block-card__meta">
        <dt>Weight</dt>
        <dd>{data.weight || '—'}</dd>
        <dt>Value</dt>
        <dd>{data.value || '—'}</dd>
      </dl>
      {data.entries.map((entry, i) => (
        <p key={i}>
          <TaggedText text={entry} />
        </p>
      ))}
    </div>
  )
}

/** Renders a full reference card for any compendium entry (spell, monster,
 * or item), tag-parsing every description line via TaggedText. */
export function StatBlockCard({ entry }: { entry: CompendiumEntry }) {
  if (entry.kind === 'spell') return <SpellCard data={entry.data} />
  if (entry.kind === 'monster') return <MonsterCard data={entry.data} />
  return <ItemCard data={entry.data} />
}
