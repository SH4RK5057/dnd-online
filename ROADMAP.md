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

## Phase 8 — Stretch goals
- [ ] 3D dice roll animations
- [ ] Support for non-5e systems (generalize the rules engine)
- [ ] AI-assisted DM tools (NPC dialogue, encounter suggestions)
- [ ] Party shared inventory/loot

---

## Full feature backlog (unsorted reference)

Kept here so nothing gets lost even before it's scheduled into a phase above.
Pruned periodically as items get scheduled into a phase or turn out to
already be covered by something shipped.

**Maps:** drawing/measurement tools, ruler
**Rules:** automated attack/save/damage resolution
**Technical:** desktop-app packaging (Electron) if browser-only proves limiting
