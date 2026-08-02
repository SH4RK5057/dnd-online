# D&D Online — Project Roadmap

A web-based virtual tabletop (VTT) for playing D&D 5e (and similar systems) remotely.
DM hosts a session from their own machine; players join with a code. Voice happens
externally (Discord/Google Meet); this app handles the game itself — maps, tokens,
character sheets, dice, and rules content.

## Decisions locked in (2026-07-18)

- **Hosting model:** DM-hosted. The DM's machine is the authoritative source of
  truth for a campaign; players connect to it directly, not to a always-on cloud
  server. No hosting bills, but the game only runs while the DM is online.
- **Voice/video:** Out of scope — use Discord or Google Meet alongside the app.
  Built-in text chat is in scope.
- **Budget:** Free. Every piece of the stack must have a no-cost tier that's good
  enough for a friend-group-sized game (handful of players per session).
- **Content:** Pull rules/monster/spell/item data from 5etools where licensing
  allows; support homebrew content as a fallback/complement.

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend framework | React + TypeScript (Vite) | Free, huge ecosystem, fast dev loop |
| Map/canvas rendering | PixiJS (WebGL) | Free, fast enough for tokens + fog + lighting at battle-map scale |
| Shared state / sync | Yjs (CRDT) | Free, open-source; gives conflict-free shared state (token positions, fog, initiative) essentially for free instead of hand-rolling a sync protocol |
| Networking transport | WebRTC via `y-webrtc`, DM's client as host | Peer-to-peer — no always-on server to pay for or maintain |
| Signaling (room codes / connection setup) | Small Node.js WS relay, deployed free (Render/Fly.io free tier) | WebRTC still needs a rendezvous point to exchange connection info before peers can talk directly |
| Local persistence | IndexedDB via `y-indexeddb` | Campaign data lives on the DM's machine, survives restarts, no cloud DB needed |
| Character sheets / rules data | JSON schema, sourced from 5etools data where license allows | Need to confirm 5etools data licensing before building around it (see Phase 5) |

This stack is 100% JS/TS, runs in the browser, and every dependency has a free tier
or is fully open-source — nothing here requires a credit card.

## Why this order (hardest-first, then dependency order)

The riskiest, most architecturally load-bearing piece is **getting the DM's
machine and players' browsers talking to each other reliably with no paid
server in the middle.** Everything else (rendering, sheets, content) is more
tractable and easier to de-risk later. So networking (Phase 1), the map/token
engine (Phase 2), and fog/lighting (Phase 3) come first, even before anything
visually impressive on the character/rules side exists.

From Phase 4 on, the order follows what each phase actually needs to exist
first, not difficulty:
- **Phase 4** (sheets, dice, initiative) has no dependency on rules content —
  you can run a real session on manually-entered stats alone — so it ships
  before the content pipeline.
- **Phase 5** (5etools content) comes next because Phase 6's encounter
  builder and Phase 4's monster-stat-block dragging both need a source of
  monster/spell/item data to be useful, not just a UI shell.
- **Phase 6** (DM tools) leans on both: initiative (4) and monster data (5).
- **Phase 7** (player tools) leans on Phase 4 (inventory needs a character
  sheet to attach to; private/public rolls need the dice roller) — it's
  scheduled after the DM-facing tools since this is a DM-hosted app where DM
  tooling amplifies every session, but nothing in it blocks on Phase 5/6.
- **Phase 8** is explicitly speculative/stretch, so it's always last.

---

## Phase 1 — Networking & session hosting (hardest, do first)
- [x] DM can start a session and get a shareable join code
- [x] Players can join via code, WebRTC connection established DM ↔ each player
- [ ] Signaling relay deployed (free tier) to bootstrap connections — code is deploy-ready
      (`server/README.md`), actual Render/Fly.io deploy is a manual step for you
- [x] Shared session state synced via Yjs over the WebRTC data channel
- [x] Reconnect handling (player drops wifi, DM restarts app, etc.)
- [x] Fallback/error messaging when a connection can't be established (strict NAT/firewall)

## Phase 2 — Core map & token engine
- [x] DM uploads a custom map image
- [x] Grid overlay (square, snap-to-grid), configurable grid size
- [x] Token placement, custom token art upload, drag-to-move
- [x] Token size scaling by creature size category
- [x] Token moves sync live to all connected players
- [x] Multiple scenes per campaign, DM can switch active scene

## Phase 3 — Fog of war & dynamic lighting
- [x] Wall/obstruction drawing tool for the DM
- [x] Line-of-sight-based fog of war (players only see what their token can see)
- [x] Dynamic light sources (torches, spells) affecting visibility
- [x] GM-only reveal/hide controls

## Phase 3.5 — Fixes & polish (playtesting punch list)

Surfaced playtesting Phase 3. Complete.

**Bugs**
- [x] Right-clicking starts a new wall in Draw Walls mode (should only cancel
      the in-progress chain, not start a new one)
- [x] Can't move existing wall points or lights (drag-to-reposition doesn't work)
- [x] Grid, walls, and lights don't render when a scene has no map image

**Map & scene UX**
- [x] Hide join code and link once a session is underway
- [x] Presets for scenes
- [x] Make the map canvas bigger
- [x] Let the DM zoom on the map
- [x] Move token-adding controls up next to map creation
- [x] Reset scene (clear it back to blank state)
- [x] Erase all tokens (bulk action)
- [x] Option for walls to grid-snap
- [x] Hexagon grid option
- [x] Map resolution feels low — investigate upscaling/quality
- [x] Make map private/hidden until the DM has finished setting it up

**Gameplay/DM tools**
- [x] Remove fog from all places a player has already seen — map fills in
      permanently as they explore, instead of recomputing fresh each frame
      (this is the "persistent fog-of-exploration" mode flagged as deferred
      scope in Phase 3's plan). Also folded in a unified ambient-brightness
      lighting model (SceneRecord.ambientBrightness) and fixed wall
      visibility to respect the same fog mask as the map/tokens.

**Post-hoc fixes (found during Phase 4 planning/playtesting, done as
"Phase 4 Part A" before Phase 4's own scope — noted here since they're
fixes to already-checked-off items above, not new Phase 4 features):**
- [x] Persistent-fog "remembered" areas were dim; now full brightness once explored
- [x] Persistent fog can be toggled on/off per scene without losing explored data
- [x] "Reset players' memory of this scene" button (wipes explored-area data only)
- [x] Wall endpoint magnetism — nearby chain/drag points snap to an exact
      existing endpoint, preventing corner light-leaks from near-miss clicks
- [x] Click-to-place a new token's starting location, instead of always
      dropping it at the map corner
- [x] Reorganize the scene toolbar into labeled Scene/Map/Grid/Fog & Lighting
      sections instead of one cramped, overlapping row of controls

## Phase 4 — Character sheets, dice, initiative

Complete.

**Character sheet & files**
- [x] Full 5e character sheet (stats, skills, inventory, spells, feats)
- [x] Standalone character editor — full character creation/editing decoupled
      from any active campaign; export/download a character as a local file,
      re-upload it later to keep editing it standalone
- [x] Campaign binding & character locking — joining a campaign imports a
      player's character file; the campaign clones and locks the core
      blueprint (stats, level, class) so it can't be edited mid-session;
      rejoining automatically reconnects the player to their assigned
      campaign character (builds on Phase 1's reconnect handling)

**Dice & rolls**
- [x] Dice roller: standard notation, advantage/disadvantage, macros (macros
      = the character sheet's quick-roll buttons, a thin layer over the same
      roll pipeline — not a separate named-macro CRUD feature)
- [x] DM-requested rolls — players communicate intent via chat/voice outside
      the app, and the DM sends an official roll prompt/request to a specific
      player through the app UI (for non-battle checks and similar)
- [x] Roll results broadcast to a shared roll log (its own simple feed —
      doesn't depend on Phase 7's full IC/OOC text chat)
- [x] Expandable roll breakdown — each roll log entry can expand to show the
      underlying math (natural die result vs. each compound bonus/modifier)

**Initiative & combat**
- [x] Initiative tracker / turn order, HP and status/condition tracking on tokens
- [x] Automatic initiative rolling on encounter start, with a DM toggle
      between Individual Monster Initiative (each monster rolls its own) and
      Group Monster Initiative (grouped by enemy type, one roll per group)
- [x] Turn-by-turn combat loop — active-turn sequencing that
      restricts/enables each player's action menu based on whose turn it is
- [x] Automated status-effect evaluation — active conditions (Poisoned,
      Blinded, etc.) are mechanically applied during rolls and targeted
      actions, not just displayed as labels. Ships now as a small hardcoded
      condition-effects table (dice/conditions.ts) rather than waiting on
      Phase 5's full rules content — richer/data-driven condition data can
      replace it later without changing the mechanism.

## Phase 5 — 5etools content integration
- [ ] **Confirm what's actually redistributable** from 5etools' data (it's
      largely community-compiled OGL/community content, not an official WotC
      API — needs a license check before we build a hard dependency on it).
      Still unresolved — a human legal call, not something code can settle —
      but the implementation below sidesteps it entirely: nothing except the
      hand-authored SRD 5.1 (CC-BY-4.0) fallback data is bundled in this
      repo; full-size 5etools-shaped content only ever comes from a DM's own
      private local files or self-hosted mirror URL, imported at runtime
      client-side and cached in the browser's IndexedDB, never committed.
- [x] Spell/monster/item lookup and quick reference — searchable/filterable
      compendium drawer (name/level/school for spells, name/CR/type for
      monsters, name/type for items), merging the SRD fallback, private
      mirror import, and homebrew content into one browsable list.
      `{@dice}`/`{@damage}`/`{@save}`/`{@condition}`/etc. 5etools inline tag
      syntax is parsed and rendered as styled stat-block text.
- [x] Drag monster stat blocks straight into encounters — "drag" implemented
      as click-to-place (consistent with this app's existing wall/light/
      token placement UX rather than native HTML drag-and-drop): DM clicks
      "Add to scene" on a monster card, then clicks the map; the new token's
      HP/AC/speed are initialized from the stat block and it remembers which
      compendium entry it came from for the rules lookup below.
- [x] Homebrew content editor as a parallel path (doesn't depend on
      licensing outcome) — create/edit/delete custom spells, monsters, and
      items, saved flat into the campaign's shared doc so they sync to
      players and appear in the compendium alongside SRD/mirror content.
- [x] DM homebrew rule overrides — a rule-modifier engine letting the DM
      apply custom campaign/scene modifiers that override default 5e rules or
      an individual character's stats (builds on the homebrew content editor
      above). Ships as a generic named-override registry + resolver
      (scene-scoped overrides win over campaign-wide for the same key) —
      not a simulator wired into every 5e rule, but the place a DM records
      "this is different in my game" as data other systems can consult.
- [x] Actual rules description shown when the DM clicks an enemy or player token
      (pulled from the monster/character stat lookup above)
- [x] DM-entered description shown when a player clicks an enemy token
      (freeform DM text, distinct from the rules lookup — surfaced here since
      both live on the same token-click UI)

## Phase 6 — DM tools

**Encounters**
- [x] Encounter builder (assemble monsters, auto-populate initiative) —
      the pre-combat panel InitiativeTracker shows whenever combat isn't
      active, checklist of scene tokens feeding the existing Phase 4
      startCombat/initiative-rolling pipeline
- [x] Start an encounter anytime — DM can trigger combat at any point, either
      pulling in tokens already on the scene or dynamically spawning new
      enemies from the encounter builder
- [x] Split-party / selective encounters — if players are geographically
      split on the map, the DM can trigger an encounter for just a subset of
      them (uncheck anyone not involved in the encounter builder); every
      connected player still gets a global notification that an encounter
      has started and where. Ships as its own small self-contained
      notification (a toast banner watching every scene's combat state),
      not wired through Phase 7's chat/pings since that doesn't exist yet
- [x] NPC/monster stat blocks the DM can drag onto the map (pulls from the
      Phase 5 content lookup, or a homebrew entry, into the encounter builder)
      — shipped as part of Phase 5's compendium drawer

**Advanced tokens**
- [x] Per-token hidden/visible toggle — DM can place a token (trap, mimic,
      stealthy enemy) fully hidden from players until revealed, independent
      of fog-of-war
- [x] Token altitude (Z-axis) — optional Z-position stored on token records
      for flying/elevated creatures; not actively rendered in 3D, but visible
      when inspecting a token and usable for range/line-of-sight calculations
      (map/distance3D.ts)

**Session tools**
- [x] Hidden DM notes / session journal
- [x] Handouts (share an image/doc to players on demand)
- [x] Random generators (loot, NPC names) — original procedural name
      synthesis and flavor text, not any published table; loot can also
      pull real items from whatever compendium content is loaded
- [x] Soundboard / ambience music — DM-local playback only (this app has no
      audio-streaming infrastructure and voice/video is explicitly out of
      scope per the Decisions section), clip library lives in the new
      cross-campaign Global Settings store

**DM file ecosystem**
- [x] Modular, DM-managed record types beyond the whole-campaign blob below —
      Campaigns, Global Settings (portable DM preferences applied across
      campaigns), Scenes, Enemies, Spells, and Items — each independently
      saved/loaded/shared. Global Settings shipped as a new localStorage
      store (currently housing the soundboard library); Enemies/Spells/Items
      already independently exportable/importable via the Phase 5 homebrew
      editor; Scenes independently exportable/importable as JSON (settings +
      tokens + walls + lights — map/token art doesn't travel, re-upload
      after import, a deliberate v1 scope limit)
- [x] Campaign export/import as a local file (download the Yjs doc state as a
      single file, re-import it later or on another machine) — backup/
      portability on top of the existing IndexedDB persistence, which can be
      cleared by the browser. Local file only, never uploaded anywhere — no
      new server-storage surface, matches the DM-hosted decision in Phase 1.

## Phase 7 — Player tools & polish

**Inventory & resources**
- [x] Personal inventory management, spell slot/resource tracking
- [x] Inventory history tab — a log of every item transfer, addition, and
      deletion between players and the DM, visible alongside the inventory itself
- [x] Automated rest states — native Short Rest / Long Rest recovery
      triggers, usable by a player anytime unless the DM has temporarily
      disabled them (the DM-side toggle lives in Phase 6)

**Rolls & communication**
- [x] Private vs. public rolls
- [x] Built-in text chat (IC/OOC channels), map pings/emotes, and temporary
      annotations/drawing on the map

**Multi-scale scene navigation** (replaces the old single "vote on group
movement" bullet with a full DM-configurable navigation mode per scene)
- [x] Town scenes: DM chooses Group or Individual navigation, smooth
      scene-transition overlays between locations, Point-of-Interest (POI) pathing
- [x] Landscape scenes: Group-only navigation driven by POIs; DM chooses the
      party's movement-consensus mode — Democratic Voting (majority choice)
      or Leader Appointment (one designated player moves the party)
- [x] Dungeon scenes: individual token movement (the existing Phase 2/3
      battle-map behavior) with dynamic line-of-sight and fog of war
- [x] Location Ping System — players flash a visual ripple/label on the map
      for their peers (a more specific, targeted version of the general map
      pings/emotes bullet above)

**Polish**
- [x] Mobile/responsive pass (DM stays locked to computer/tablet — this is
      about the player-facing layout)

## Phase 8 — Tactical combat depth & campaign-life features

Complete. Two batches of work, both aimed at closing the gap between "a VTT
with dice and fog of war" and "feels like sitting at the table" — the first
batch closes out core combat resolution, the second adds reaction/targeting
depth plus a few things a physical table can't do at all.

**Combat resolution**
- [x] Weapon-based attack rolls — pick a weapon and a target, roll
      1d20 + ability mod + proficiency
- [x] DM toggle between auto-resolving a hit (compare the roll to the
      target's AC automatically) and deciding hit/miss manually from the
      roll log
- [x] A confirmed hit's damage roll applies straight to the target's HP
      (character-linked or token-only, same split resolveTokenHp already
      uses)
- [x] Death saving throws — tracker appears once HP hits 0, natural 20
      heals to 1, natural 1 counts double, 3/3 stabilizes or kills
- [x] Concentration tracking — a damage hit while concentrating flags a
      Constitution save at the standard DC (max(10, floor(damage/2)))
- [x] Full player-style character sheets a DM can attach to NPC tokens,
      alongside the existing monster-stat-block link — a DM-created NPC
      gets abilities/inventory/spells/weapons like any player character
- [x] Map measuring tool + circle/cone AoE template preview (Ctrl-drag,
      Ctrl+Shift-drag, Ctrl+Alt-drag) — personal/local to each viewer, works
      for the DM and players alike

**Reactions, targeting, and party logistics**
- [x] Reaction economy — each combatant's reaction resets at the start of
      their own turn; an attack rolled outside your turn (an opportunity
      attack) consumes it automatically, or a DM/owner can mark it used
      manually from the initiative tracker for a non-attack reaction (a
      readied spell, Shield, etc. — narrated outside the app, this just
      tracks whether it's still available)
- [x] Line of sight for attacks — a wall between attacker and target blocks
      the Roll Attack button, reusing the same ray/segment math the fog-of-
      war visibility polygon is built from
- [x] Shared party loot pool + pooled coin purse — anyone can drop found
      items into the pool, any player can claim one into their own
      inventory (or the DM assigns it), and a "split evenly" action divides
      the purse across the party's characters, remainder staying pooled
- [x] Spell casting with an auto-sized AoE template — a small hand-authored
      table of common SRD spells (Fireball, Burning Hands, Thunderwave,
      Shatter, Cone of Cold, Lightning Bolt, Spirit Guardians, Sunbeam)
      drives the template's exact shape/size once armed and dragged onto
      the map, auto-computes the save DC, rolls damage once, and resolves
      each manually-checked target's save against it (the template is a
      visual aid, not hit-tested geometry — the DM/caster judges who was
      caught, same trust model as everywhere else in this app)
- [x] Custom-size hazard/trap tokens — a DM places a token sized in grid
      cells (not a fixed creature size category), starts hidden by
      default; the first time another token's footprint overlaps it, it
      auto-reveals (the DM resolves the actual trap effect manually with
      existing tools — a save, damage, whatever the trap does — same as
      any other damage/save flow)
- [x] Passive perception — a per-scene/campaign DM toggle
      (`passivePerceptionEnabled`); a hidden token can carry an optional
      `perceptionDc` the DM sets (this app doesn't model a Stealth roll,
      the DM just decides the number). When the toggle is on, the moment a
      player's own live sight newly reaches a hidden token with a DC set
      (reusing the fog layer's existing "cells newly explored this frame"
      output — no separate visibility recompute needed), their passive
      Perception (`10 + Perception bonus`, shown on every character sheet
      regardless of the toggle) is compared against it and the token
      auto-reveals on success. A token with no DC set never auto-reveals,
      even with the toggle on — the DM opts in per hidden thing.
- [x] Session recap — merges the roll log, chat log, and a small new
      combat-start/combat-end event log (`sessionLog/useSessionEvents.ts`,
      logged from `InitiativeTracker`'s existing start/end handlers) into
      one chronological, oldest-first timeline. Deliberately the raw merged
      history rather than a written-prose summary — see the rejected
      AI-tools entry below for why this app doesn't reach for text
      generation to produce one.

**Combat smoothness, round 2**
- [x] Condition-vs-target advantage/disadvantage — attacks against a
      conditioned target now grant the attacker advantage or disadvantage
      depending on the condition and whether the weapon is melee or ranged
      (`dice/conditions.ts` `TARGET_CONDITION_ROLL_EFFECTS` +
      `resolveAttackMode`, e.g. a Prone target is easier to hit in melee but
      harder at range; Blinded/Paralyzed/Petrified/Restrained/Stunned/
      Unconscious grant advantage either way, Invisible grants disadvantage
      either way). Required adding a melee/ranged `attackType` to
      `WeaponEntry`. Auto-crit rules some of these conditions also grant
      (a hit on a Paralyzed/Unconscious target from within 5 ft. is a
      critical) aren't modeled — advantage/disadvantage only.
- [x] Condition duration tracking — a token's conditions are now
      `{name, roundsRemaining}` pairs instead of bare names
      (`map/types.ts` `ActiveCondition`); the DM/owner optionally sets a
      round count when applying one from the token editor, decremented by 1
      each time combat's round counter advances and auto-cleared at 0
      (`combat/useCombat.ts` advanceTurn's `onRoundIncremented` callback,
      wired from `InitiativeTracker`). This ticks once per full round, not
      per-creature-relative like 5e's actual "until the start of your next
      turn" wording — a deliberate simplification. Leaving the duration
      blank keeps the old behavior: indefinite, cleared manually.
- [x] Group/bulk roll requests — the DM's "Request a roll" form gained an
      "Everyone" checkbox that fans a single request out to every connected
      player at once (e.g. "everyone roll a Dex save, DC 15"), reusing the
      existing single-target `RollRequestRecord` plumbing unchanged rather
      than adding a second request data shape.
- [x] On-deck indicator — the initiative tracker now labels whoever's turn
      is coming up next, computed client-side from the same derived
      initiative order used for "current turn." No turn timer was added
      (deliberately rejected — see below).
- [x] DM undo/redo — a misclick safety net for moved tokens, misplaced
      walls/lights, and fat-fingered HP edits, built on Yjs's own
      `Y.UndoManager` (`undo/useUndoManager.ts`) scoped to the tokens/walls/
      lights/characters maps. Works because Y.UndoManager only tracks local
      transactions on this browser's own Y.Doc, so it can never undo another
      connected peer's edits. DM-only, with an Escape-hatch-free Ctrl+Z /
      Ctrl+Shift+Z shortcut (ignored while focus is in a text field, so it
      doesn't hijack normal text-undo).

## Phase 9 — Explicitly rejected

Decided against, not just deprioritized — don't re-propose these without a
real change in constraints.

- **AI-assisted DM tools** (NPC dialogue, encounter suggestions, generated
  prose recaps, etc.) — not on this roadmap at any priority.
- **Built-in voice/video** — out of scope per the original Decisions
  section; Discord/Google Meet alongside the app remains the answer.
- **Encounter difficulty calculator** — 5e's DMG CR/XP-budget method was a
  clean, cheap addition (no new data model, just a pure function over
  numbers this app already has), but rejected on its own terms, not for
  feasibility reasons.
- **Play-by-post mode** — most of the plumbing already works today (state
  lives in the DM's IndexedDB-backed Yjs doc regardless of who's online),
  but rejected as a supported mode; this app targets live sessions.
- **Turn timer** — an on-deck indicator (who's up next) shipped in Phase 8's
  second combat-smoothness batch, but a countdown clock on the current turn
  was rejected alongside it; this app doesn't pressure table pacing.
- **Multiclassing** — `CharacterRecord` stays single-class
  (`className` + `level`, see its own v1-limitation doc comment in
  `character/types.ts`). Rejected, not deferred: the rework it would take
  (a `classes[]` array, per-class HP dice, the multiclass spell-slot
  formula, first-class-only save proficiencies, per-class ASI
  breakpoints, and a level-up/character-sheet UI overhaul to manage a list
  of classes instead of one) isn't worth taking on for this app.
- **Feat prerequisites** — `FeatEntry` stays freeform (`name` + `notes`).
  The SRD 5.1 (this app's only bundled content) doesn't include feats at
  all — they were never OGL-published — so unlike races/classes/spells/
  items there's no official list to hand-author into the compendium and
  validate against. Building a structured feat data model just to check
  prerequisites against user-typed homebrew entries isn't worth it; feats
  stay a plain reference field, same as before.

## Phase 10 — Stretch goals
- [x] 3D dice roll animations — a lightweight CSS 3D die (no WebGL/three.js
      dependency) tumbles for ~900ms then reveals the real rolled value —
      never a separate fake number, always the same die-term result that
      just got written to the shared roll log (`dice/diceAnimationBus.ts`,
      triggered from the single choke point every roll already passes
      through, `dice/useRollLog.ts`'s `pushRoll`). Deliberately local-only:
      it plays for whichever client just rolled, not broadcast to everyone
      via the Yjs doc — sidesteps P2P timing/ordering questions for what's
      a purely cosmetic flourish; every other viewer still sees the result
      land in the shared log exactly as before, just without the animation.
- [x] 3D flat-plane view with STL miniatures — a personal, per-viewer toggle
      (each player/DM switches their own screen, not synced) swaps the 2D
      map (`canvas/MapCanvas.tsx`) for a three.js scene
      (`canvas3d/Scene3D.tsx`): the scene's map image becomes a textured
      flat tabletop plane, and any token with an uploaded STL
      (`TokenRecord.modelAssetId`, uploaded via the same chunked asset
      pipeline as map/token images — no size cap) stands on it as a real 3D
      mini instead of a flat sprite; tokens without one get a plain
      placeholder cone (or a flat box for hazard/trap tokens). Dragging a
      mini is fully interactive but DM-only, matching the 2D view's existing
      drag convention. STL files are assumed Z-up (the near-universal
      convention for 3D-printable miniature files) and auto-normalized to
      stand upright at the correct scale regardless of the original file's
      real-world dimensions (`canvas3d/modelCache.ts`). Standing height is
      automatic by sizeCategory by default, but each token can override it
      directly (`TokenRecord.modelHeightCells`, grid-cell world units — an
      exact size, not a scale multiplier, so an oddly-proportioned STL
      doesn't need scale-factor math) via the token editor. Absent an
      override, a model is also auto-scaled down (never up) to stay within
      its own token's grid footprint if its natural width/depth would
      otherwise spill into neighboring cells (`resolveStlScale` in
      `map/sizeCategory.ts`, takes the smallest of the height target and
      the two footprint-fit ratios). Token name/image/model can all be
      edited after creation, not just at placement time
      (`components/TokenHpConditionEditor.tsx`).
      **v1 limitations, deliberately scoped out:** no fog-of-war/line-of-
      sight masking (every non-hidden token is visible to everyone
      regardless of vision — hidden tokens still stay DM-only); a drag only
      writes the final position on release, not a continuously-broadcast
      live position like 2D's throttled dragging; no visual selection
      highlight on the mini itself (clicking still opens the same HP/
      condition/inspector side panels as 2D); walls, lights, annotations,
      and measuring have no 3D equivalent — this view is map + tokens only.
      The 3D plane also renders the scene's grid lines now (square or hex,
      matching the 2D view exactly), whether or not a map image is set —
      previously it only ever showed the raw map texture with no grid at
      all (`canvas3d/gridTexture.ts`, baked into the plane's texture
      alongside the map image since a material only has one `map`).
- [x] Live-resizable play area past a map image's own edges — the DM's
      existing blank-canvas size control (previously hidden once a map
      image was set) now always shows, and doubles as a floor: leaving it
      untouched keeps a scene's play area exactly matching its map image
      (unchanged default behavior), but setting it larger extends the grid
      (and, in 3D, the plane) past the image's edges so a fight can spill
      off a drawn map without the DM needing a bigger source image
      (`map/canvasSize.ts`'s `resolveCanvasSizeCells`, shared by both the
      2D and 3D views so they always agree on the board size).
- [x] Reorderable, collapsible side-panel sections — each viewer (DM or
      player) can collapse any section and move it up/down within their own
      panel; order and collapsed state persist per-role in `localStorage`
      (`screens/usePanelOrder.ts`, `components/PanelSection.tsx`), not
      synced through the Yjs doc since it's a personal display preference,
      not shared session state.
- [x] Search-to-add for spells and items on the character sheet — typing in
      `CharacterSpells`/`CharacterInventory` filters the loaded compendium
      (SRD + mirror + homebrew, via the existing `content/search.ts`
      filters) and adds a matching entry with one click, alongside the
      original freeform "add custom" fallback for anything not in the
      compendium. Monster search-to-add already existed via
      `CompendiumDrawer`.
- [x] Compendium as its own full-screen view — split out of the side panel
      the same way Scene Builder/Character Manager already swap the whole
      screen (`screens/CompendiumScreen.tsx`), so looking something up
      doesn't mean scrolling past every other DM tool panel to reach it.
      Audited the rest of the sidebar for the same treatment: everything
      else (Fog & Lighting, Token Placement, Dice Roller, Chat, etc.) is
      short enough or used often enough alongside the map that a full-
      screen swap would cost more (losing the map/chat context) than it
      saves — Compendium was the one section long enough, and looked-up
      independently enough of the current map state, to be worth it.
- [x] Drag-resizable, repositionable side panel — the DM/player panel can
      be dragged to grow/shrink (`components/SidebarResizeHandle.tsx`) and
      moved to any of the four sides of the map (left/right/top/bottom, via
      a `<select>` in the header), not just a fixed-width left column.
      Personal per-viewer preference, `localStorage`-persisted like the
      panel section order (`screens/useSidebarLayout.ts`), not synced
      through the Yjs doc.
- [x] First-person mode in the 3D view — a player-only toggle
      (`canvas3d/Scene3D.tsx`'s `perspectiveMode` prop, ignored for the DM,
      who always keeps the free-orbit board view) that pins the camera
      directly above the viewer's own token — no horizontal offset, no
      chase-cam — and only lets the player rotate their view, never move
      it: OrbitControls is repurposed with pan/zoom disabled and its
      camera-to-target distance locked to a small constant, and every
      frame the camera is re-pinned to the token's current hover spot while
      the just-dragged look direction is carried over (see the animate()
      loop's `hoverPos` block for the full trick — effectively inverts
      OrbitControls' usual "orbit the camera around a fixed target" into
      "rotate the look direction from a fixed camera"). The viewer's own
      mini is hidden (nothing to see looking at yourself), walls get real
      3D extrusion, tall enough to actually read as walls from this
      close-up view (`WALL_HEIGHT_CELLS`), instead of just flat lines baked
      into the plane texture, and lights become real three.js `PointLight`s
      with distance falloff (position resolved from the attached token when
      applicable, mirroring `canvas/LightLayer.ts`'s `resolvePosition`)
      instead of only the flat glow already baked into the plane. Toggle
      lives next to the existing 2D/3D switch in `screens/SessionScreen.tsx`,
      same personal/`localStorage`-only convention as `view3d`.
- [x] Partial fix: switching *from* Tokens *to* Walls/Lights while a stale
      staged token placement was still armed silently kept routing map
      clicks to token placement instead — selecting Walls or Lights in the
      rail visually looked like it worked (icon lit up, details panel
      changed) but `SceneBuilderScreen`'s `effectiveToolMode` stayed
      pinned to `'place-tokens'` because it prioritizes any pending
      placement over the selected tool. Fixed by cancelling a pending
      placement the moment an exclusive tool is selected
      (`components/MapToolRail.tsx`'s `selectMode`). **The reverse
      direction is still broken** (see the DM tooling/UX backlog entry
      below) — this fix only covers stale-token-placement-blocks-walls/
      lights, not walls/lights-blocks-tokens.
- [x] Fix: a light's placement-radius circle (`canvas/LightLayer.ts`, a
      DM-only editing aid showing where a light is and how far it reaches)
      was rendered completely unmasked for every viewer, so a player could
      see a light's full radius regardless of their own fog-of-war/line-
      of-sight — the *actual* in-game illumination (`FogLayer`) was always
      correctly masked; only this schematic overlay leaked. Fixed by
      hiding `LightLayer.container` outright for anyone who isn't the
      unmasked DM (`container.visible = isDmUnmasked`, threaded through
      `update()`).
- [x] Doors — a wall segment that can be toggled open/closed instead of
      only drawn or deleted (`WallRecord.isDoor`/`open`), blocking line-of-
      sight, fog, and attack targeting only while closed
      (`map/wallBlocking.ts`'s `blockingWalls` filters them out of every
      caller that feeds wall segments into `map/visibility.ts`'s generic,
      door-agnostic geometry). Drawn via a "Draw as door" checkbox in the
      Walls panel (a brush setting applied to whatever gets drawn next,
      same as thickness/snap-to-grid) and rendered in a distinct brown, at
      reduced alpha while open as a visual "not blocking" cue
      (`canvas/WallLayer.ts`); a stationary click directly on an existing
      door toggles it instead of starting a new wall chain there. The 3D
      flat-plane view's wall extrusion (`canvas3d/Scene3D.tsx`) skips the
      mesh entirely for an open door so perspective mode's camera can
      actually see/pass through the opening, and renders a closed one in
      the same distinct color as the 2D view. v1 is DM-toggle-only via the
      Walls tool, matching this app's existing DM-authoritative editing
      convention for walls/lights — not yet toggleable by players
      themselves.
- [x] Fix: switching *to* the token tool while Walls or Lights was active
      didn't disable that tool — clicking the Tokens icon in
      `components/MapToolRail.tsx` only opened the tokens popout, it never
      called `onToolModeChange`, so `toolMode` stayed `'draw-walls'`/
      `'place-lights'` and map clicks kept drawing walls/placing lights
      right up until a token placement was actually staged. Fixed by
      having `toggleNonExclusive` call `onToolModeChange('move')` whenever
      it opens the tokens panel.
- [x] Ability Score Improvement (level-up) can no longer push a score above
      the 20 hard cap — `isValidAbilityScoreImprovement` now takes the
      character's current base scores and rejects a change that would
      exceed 20 for any ability, and `applyAbilityScoreImprovement` clamps
      at 20 as a second line of defense. (Manual/point-buy free-text entry
      was already bounded to [3,18]/[8,15] from an earlier pass — this
      closes the other route to an over-20 score, via repeated ASIs.)
- [x] Character speed is now capped (`character/rules.ts`'s `MAX_SPEED_FT`
      = 300 ft, generous headroom above any SRD creature's base speed) —
      previously a free-text field with no bound at all.
- [x] Party loot currency is now capped per denomination
      (`loot/usePartyLoot.ts`'s `MAX_CURRENCY_PER_DENOMINATION`,
      999,999) — the "+"/"−" steppers had no other limit before this.
- [x] Custom weapon damage dice are now bounded — `dice/notation.ts`'s
      `parseNotation` (used by every dice-rolling path in the app: weapon
      damage, spell damage, the freeform roller, not just custom weapons)
      rejects a dice term over 100 dice or 1000 sides, which also closes a
      real perf/hang risk (an absurd term like "999999d999999" would
      previously have tried to actually roll and broadcast millions of
      results to every viewer). `components/CharacterSheet.tsx`'s weapon
      damage-dice field also shows a red outline + tooltip while its
      current text doesn't parse, so a player sees the problem while
      editing rather than discovering it as a silently-no-op damage roll
      during combat.
- [x] Delete a single token — a "Delete token" button (DM-only, confirm
      dialog) in `components/TokenHpConditionEditor.tsx`'s header, wired to
      `deleteToken` (which already existed in `map/useTokens.ts` but had no
      UI caller) — previously the only token-removal control anywhere was
      the DM's bulk "Erase all tokens" button.
- [x] Spell slot totals are now bounded to [0,9] per level when they're
      freely editable (an unrecognized/non-caster class — a recognized
      caster's totals are already computed and locked). The input's own
      min/max were only ever a UI hint; `CharacterSpells.tsx`'s `setSlot`
      now actually clamps.
- [x] A custom inventory item name that exactly matches an existing
      compendium item now gets a red outline + tooltip in
      `components/CharacterInventory.tsx` — not blocked outright (typing
      toward a different name that happens to share a prefix shouldn't be
      fought character-by-character), just flagged so the ambiguity is
      visible and the player can use "Search compendium items to add"
      instead, or rename.
- [x] DM-set campaign level cap — `character/useCampaignSettings.ts`'s new
      `levelCap` (null = no cap, the default), with a checkbox + number
      input next to the other campaign toggles in `components/
      CharacterPanel.tsx`. Gates `CharacterSheet.tsx`'s level-up wizard
      (`canLevelUp`) without retroactively lowering an already-higher-level
      character.
- [x] DM can now explicitly share a specific monster's full stat block with
      players, not just the freeform description — `TokenRecord
      .statBlockShared` (per-token, DM opt-in, default false), a checkbox
      in `components/TokenInspector.tsx` next to the DM's own stat-block
      view. Player-facing visibility stays otherwise all-or-nothing per
      token, deliberately: the DM picks what to reveal, not a
      partial/redacted view.
- [x] Darkvision now has a real (if simplified) mechanical effect —
      `character/rules.ts`'s `darkvisionRadiusFt` parses the "Darkvision X
      ft." race trait string, and `MapCanvas.tsx` extends that specific
      character-linked token's personal-vision bubble to at least that
      radius (`canvas/FogLayer.ts`'s new per-token
      `darkvisionRadiusCellsByTokenId` override). v1 simplification: full
      brightness within the radius, not 5e's actual "shades of gray beyond
      dim light" — this app's fog model doesn't track light *color*, only
      brightness, and adding that distinction would mean a larger FogLayer
      rework.
- [x] Attunement limit — `character/rules.ts`'s `MAX_ATTUNED_ITEMS` (3, the
      5e standard), checked in `components/CharacterInventory.tsx` against
      `InventoryItem.attuned`: a 4th item's checkbox disables itself once
      the cap is hit, with a tooltip explaining why. Doesn't model *which*
      items require attunement or the short-rest ritual, just the numeric
      cap.
- [x] Item weight/carry — `InventoryItem.weight` (lb per unit, auto-filled
      from a compendium item's own weight string via `rules.ts`'s
      `parseItemWeightLb` when added via search-to-add, editable by hand
      otherwise). `CharacterInventory.tsx` sums carried weight
      (`computeCarriedWeightLb`) against 5e's standard Strength×15
      capacity (`computeCarryCapacityLb`) and shows a red "over capacity"
      hint when exceeded — a non-blocking visual warning, same trust model
      as hazards/traps and every other rules edge this app flags rather
      than enforces: no automatic speed penalty, the DM narrates the
      consequence.
- [x] DM broadcast tool, targeted-handouts half — `dmtools/types.ts`'s
      `HandoutRecord.visibleToPlayerId` (null = everyone, the original
      behavior) lets the DM narrow an already-shown handout to one
      connected player instead of broadcasting to the whole party
      (`components/HandoutsPanel.tsx`'s new "Visible to" dropdown, same
      peer-list pattern `TokenOwnerAssign`/group-roll-requests already use).
      DM Notes stays DM-only by design (its own panel explicitly warns
      notes still sync to every player's browser even though only the
      DM's UI shows them) — not turned into a third broadcast channel.
- [x] DM broadcast tool, "push to everyone right now" half — a new
      `dmtools/useBroadcast.ts` (single-record Yjs map, same baseline-
      then-diff "only fire on a genuinely new send" logic as
      `combat/useEncounterNotifications.ts`) lets the DM compose a note
      and/or attach a compendium monster's stat block
      (`components/BroadcastComposer.tsx`, a new DM-only sidebar section)
      and push it to every connected viewer as a transient, dismissible
      banner (`components/BroadcastNotificationBanner.tsx`, rendered next
      to the existing encounter-start banner in `SessionScreen.tsx`) —
      distinct from a Handout's persistently-toggled-visible sharing:
      this is one-shot, not a standing state a late joiner would replay.
      `dismiss()` is purely local per-viewer, so a late-joining player
      still sees the current broadcast once before it's gone.
- [x] Battle-specific menu mode, both halves — `InitiativeTracker.tsx`
      gained a DM-only "Info" toggle per monster-linked combatant (expands
      the same `StatBlockCard` the compendium drawer/token inspector
      already use) and a DM-only "Quick actions" toggle for whoever's turn
      it currently is, when that combatant has a linked character sheet
      (an NPC full sheet, per the earlier NPC-on-token feature). Quick
      actions embeds `AttackRollPanel` and `SpellCastPanel` exactly as
      `TokenInspector` already does for a DM-run NPC — same props, same
      roll pipeline — so the DM can resolve a monster's attack or spell
      without leaving the initiative list to click its token first. Only
      shown for the current-turn combatant (not every row) to avoid
      clutter; a bare monsterKey-only token with no linked sheet still
      only gets the Info toggle, since it has no structured weapon/spell
      data to roll from.
- [x] Multiple floors/levels per scene — `SceneRecord.floorGroup` (empty =
      not part of a group, the default) and `floorOrder` (sort position
      within the group, ties broken by `createdAt`) let a DM link several
      scenes as floors of one location by giving them the same floor group
      name, set from a new "Floor" section in `SceneToolbar.tsx`. A DM-only
      `components/FloorSwitcher.tsx` tab strip — rendered above the map in
      `SessionScreen.tsx`, using each grouped scene's own `name` as its tab
      label — lets the DM flip floors with one click during live play
      instead of leaving for Scene Builder's full scene dropdown; it
      reuses `switchToScene` unchanged and renders nothing for an
      ungrouped scene or a "group" of one. Deliberately the lightweight
      option over the two heavier alternatives: POIs already handle
      scene-to-scene links but are travel/consensus-flavored and gated off
      dungeon-scale scenes (wrong semantics for "flip between views of the
      same building"), and true vertical 3D floor-stacking would be a much
      larger render-multiple-maps-at-once feature this app's flat-plane 3D
      view isn't built for. Exact-string-match grouping, same DM-trusted,
      no-referential-integrity convention already used everywhere else in
      this app (scene names, homebrew content, etc.) — no group-rename
      flow, a typo just splits a scene off silently. Pure grouping/sort
      logic lives in `map/floorGroups.ts` (`floorSiblings`, unit tested)
      so `SceneToolbar` and `FloorSwitcher` share one implementation.
      Tokens/walls/lights/fog per floor stay fully independent, same as
      any other two scenes — nothing here changes that.
- [x] Performance pass — three changes, chosen after reading the actual code
      rather than guessing:
      - **Mirror import** (the real fix for "large files are slow to
        ingest," profiled rather than assumed): `content/mirrorStorage.ts`'s
        `fetchMirrorFromUrl`/`fetchGithubRepo`/`fetchIndexedFamily` were
        fetching every source file **sequentially** (`for` + `await`) even
        though each file is independent — for a mirror with dozens of
        spell/bestiary/class source files, that's dozens of network round
        trips paid one at a time. JSON parsing/normalization was never the
        bottleneck; it's synchronous and fast. Switched every such loop to
        `Promise.all(...)`, so all of a family's (or a GitHub repo's) files
        fetch concurrently — the `content`/`errors` mutations stay race-free
        since JS's single-threaded event loop still runs each fetch's
        `.then` callback to completion before the next one starts.
      - **3D view code-splitting**: `canvas3d/Scene3D.tsx` (three.js +
        OrbitControls) was statically imported in `SessionScreen.tsx`, so
        every viewer downloaded that weight on page load whether or not
        they ever open the 3D toggle. Switched to `React.lazy` +
        `Suspense`, splitting it into its own chunk fetched on first use —
        cut the main bundle from ~1.43 MB to ~740 KB (390 KB to 213 KB
        gzipped) in the production build. Purely a module-loading-timing
        change; the component's own logic (texture handling, STL caching,
        raycasting, etc.) is untouched.
      - **Stale diagnostic logging removed**: `MapCanvas.tsx`'s `extract()`
        and `Scene3D.tsx`'s `refreshBoard()` each had a `console.warn`
        (throttled to ~1/sec, but still computing `performance.now()` and
        building a template string on every ~200ms board refresh) left over
        from tracking down a since-fixed Chromium GPU-compositor race —
        both were explicitly marked "TEMPORARY... remove once the mismatch
        is found," and the fix (recreate-not-mutate CanvasTexture, deferred
        upload, `willReadFrequently`) has been shipped and stable since.
        Deliberately did **not** touch any of that actual fix logic, or the
        per-refresh CanvasTexture recreation it depends on — both are
        hard-won correctness tradeoffs, not naive slowness, and the whole
        point of this pass was not to break the 3D view. Live-verified
        after all three changes: toggling 3D on/off/on repeatedly still
        mounts a healthy WebGL context with no console errors.
- [x] Side panel tool-select-first layout — replaced the old stacked,
      collapsible-accordion section list (`components/PanelSection.tsx`,
      now deleted) with a tab strip (`session-screen__tool-tabs`) that
      shows exactly one tool's detail panel at a time
      (`session-screen__tool-detail`), so picking a tool no longer means
      scrolling past every other DM/player panel to reach it. Tab order is
      still a personal, per-role, `localStorage`-persisted preference via
      the existing `screens/usePanelOrder.ts` (unchanged) — reordering
      moved from per-section ↑/↓ buttons to a single ←/→ pair in the active
      tab's own detail header, since a row of small tab chips doesn't have
      room for inline move buttons per item. Per-tool collapse state is
      gone too (a tool is either the one selected tab or not rendered at
      all) — that concept only existed to manage a tall stacked column,
      which no longer exists.
- [x] Fixed: encounter monster/item placement was broken during live play —
      `screens/CompendiumScreen.tsx` never forwarded `onAddMonsterToScene`
      to `CompendiumDrawer`, so the "Add to scene" button (working correctly
      in Scene Builder) never rendered when the DM opened the Compendium
      from a live session, and `SessionScreen.tsx`'s own `handlePlaceToken`
      didn't destructure/apply `monsterInit` even when a placement did get
      armed some other way — so a monster token placed live never got its
      `monsterKey`/HP/AC/speed seeded. Fixed by threading
      `onAddMonsterToScene`/`onAddItemToScene` callbacks from
      `SessionScreen.tsx` through `CompendiumScreen.tsx` (arming a
      placement then closing the compendium back to the map so the DM can
      click where to drop it) and applying `monsterInit` in
      `handlePlaceToken`, matching `SceneBuilderScreen.tsx`'s already-
      correct equivalent.
- [x] Item token placement from the compendium — `components/
      CompendiumDrawer.tsx` gained an `onAddItemToScene` prop and an "Add
      to scene" button on the Items tab (previously monsters-only), wired
      through the same click-to-place flow as monsters in both
      `SessionScreen.tsx` and `SceneBuilderScreen.tsx`. An item placement
      carries no `monsterInit` and defaults to `sizeCategory: 'tiny'`
      (a potion or scroll doesn't need a stat block, just a marker on the
      map).
- [x] Attach a monster stat block to an already-placed token —
      `map/useTokens.ts` gained `setTokenMonsterKey` (clears/sets
      `TokenRecord.monsterKey` without touching `hp`/`ac`/`speed`, since a
      DM may have hand-edited those since attaching and detaching
      shouldn't discard that tracking) alongside the existing
      `initTokenFromMonster` (already used for encounter drag-and-drop,
      now reused here for a fresh attach). `components/
      TokenHpConditionEditor.tsx` gained a DM-only "Monster stat block"
      section — search-and-attach when nothing's linked (same
      `filterMonsters` search-result pattern `BroadcastComposer.tsx`
      already uses), or an "Attached: X — Detach" line once one is.
- [x] Place a token directly from the character roster — a new DM-only
      `components/CharacterTokenMenu.tsx` (rendered in the Token Placement
      tab, alongside `TokenUploadButton`) lists every `CharacterRecord`
      bound to the campaign — player characters and DM-authored NPC
      sheets alike, via the existing `useCharacters` hook — each with a
      "Place token" button that arms a placement exactly like the
      compendium's monster "Add to scene" does. `PendingTokenPlacement`
      gained a `characterInit: {characterId, ownerId} | null` field
      (parallel to `monsterInit`); on placement `handlePlaceToken` calls
      the existing `linkCharacter` (HP then reads from the character sheet,
      see `character/rules.ts` `resolveTokenHp`) and `assignOwner` (so a
      player-owned character's fog-of-war comes online immediately,
      without a separate Token Ownership step) setters. Each roster row
      shows its owner (a connected player's name, or "NPC") and an "on
      this scene" badge if that character already has a token here — a
      hint, not a block, since the DM may genuinely want a second one.
- [x] D&D-themed favicon — replaced the generic abstract purple/blue
      geometric logo (`public/favicon.svg`, the framework-default-looking
      graphic this project shipped with from the start) with a simple d20
      die icon (hexagonal outline, faceted lines, a bold "20") in warm
      gold-on-brown, matching this app's parchment/fantasy theme.
- [x] Targeted messaging to a subset of players, not just one-or-everyone —
      `HandoutRecord`/`BroadcastRecord` both changed their single
      `visibleToPlayerId: string | null` field to `visibleToPlayerIds:
      string[] | null` (null = everyone, unchanged default behavior; a
      non-empty array = just those players). A new shared
      `components/PlayerRecipientPicker.tsx` (an "Everyone" checkbox plus
      one per connected player; unchecking the last specific player falls
      back to "Everyone" rather than leaving a silent visible-to-no-one
      state) replaces the old single-player `<select>` in both
      `HandoutsPanel.tsx` and `BroadcastComposer.tsx`. `useBroadcast.ts`'s
      `send` now takes the target list, and its per-viewer `notification`
      only fires for a viewer who's targeted (or the sending DM, always,
      as confirmation it went out, or everyone when untargeted) — the
      existing baseline-then-diff dedup (`seenSentAtRef`) still tracks
      every record's `sentAt` unconditionally so a viewer who wasn't shown
      one broadcast still correctly detects the next new one.
- [x] Handouts + Broadcast merged into one "Messages" tab, on both sides —
      both are "DM composes something, targets some/all players, shares
      it," just with different lifetimes (one-shot transient banner vs. a
      persistent, revisitable, toggle-visible list), so a new
      `components/MessagesPanel.tsx` combines them as labeled sub-sections
      under a single DM-only tab instead of two separate ones, and a new
      `components/PlayerMessagesView.tsx` gives players the matching tab
      (renamed from the old player-only "Handouts" tab). Deliberately a
      UI-only merge — `BroadcastRecord` and `HandoutRecord` stay their own
      distinct data shapes/hooks, nothing about the underlying
      send-now-vs-persistent-share semantics changed.
- [x] Persistent broadcast message log, so dismissing (or missing) the
      transient banner doesn't lose it — `useBroadcast.ts` moved off a
      single overwritten `'current'` record to a real `doc.getMap` keyed by
      id (same shape dice/useRollLog.ts already uses: capped at
      `MAX_BROADCAST_LOG_ENTRIES` = 100, oldest trimmed by the DM's client
      only). The hook now also returns `history` — every broadcast this
      viewer was allowed to see (respecting `visibleToPlayerIds`), newest
      first. A new `components/BroadcastLog.tsx` renders it (with the
      attached monster stat block, same as the banner) and is shared by
      both `MessagesPanel` (DM's own "Sent messages" section, sees
      everything they sent) and `PlayerMessagesView` (a player's own "DM
      messages" section, filtered to them).
- [x] Two more tool-tab combinations, matching the reasoning that already
      merged Handouts+Broadcast: **Tokens** (`components/TokensPanel.tsx`)
      combines the old separate Token Ownership / Preview As / Token
      Placement tabs — all DM map/token setup with no strong reason to be
      split — and **DM Toolbox** (`components/DmToolboxPanel.tsx`)
      combines Random Generators / Soundboard / Campaign Files, three
      low-frequency utilities that don't each need a dedicated tab. Unlike
      Messages, both of these get a "jump to section" pill row
      (`components/SubTabNav.tsx`) at the top — a genuinely multi-part
      combined tool benefits from one, a two-or-three-short-section one
      like Messages doesn't. `SubTabNav` doesn't hide/switch content (every
      part still renders, stacked, exactly as before); clicking a pill just
      scrolls to that part's anchor.
- [x] Fixed: 3D perspective (first-person) mode's camera hovered absurdly
      high above the followed token (`PERSPECTIVE_HOVER_HEIGHT_CELLS` was
      3.5 grid cells — at a typical 5 ft./cell grid, over 17 feet up),
      reading as a disorienting "floating drone" viewpoint rather than a
      personal one. Lowered to 1.5 cells, roughly a standing creature's own
      eye level (`canvas3d/Scene3D.tsx`). The viewer's own mini still stays
      hidden while in perspective mode specifically (unchanged — the camera
      sits close enough above the token that showing it would mean looking
      at the inside of your own model) but, as before, is always shown in
      the standard free-orbit board view, same as every other in-sight
      token.
- [ ] Support for non-5e systems (generalize the rules engine)

---

## Full feature backlog (unsorted reference)

Kept here so nothing gets lost even before it's scheduled into a phase above.
Pruned periodically as items get scheduled into a phase or turn out to
already be covered by something shipped.

**Technical:** desktop-app packaging (Electron) if browser-only proves limiting

