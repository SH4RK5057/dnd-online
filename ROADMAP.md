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
- [ ] Full 5e character sheet (stats, skills, inventory, spells, feats)
- [ ] Dice roller: standard notation, advantage/disadvantage, macros
- [ ] Roll results broadcast to a shared roll log (its own simple feed —
      doesn't depend on Phase 7's full IC/OOC text chat)
- [ ] Initiative tracker / turn order, HP and status/condition tracking on tokens

## Phase 5 — 5etools content integration
- [ ] **Confirm what's actually redistributable** from 5etools' data (it's
      largely community-compiled OGL/community content, not an official WotC
      API — needs a license check before we build a hard dependency on it)
- [ ] Spell/monster/item lookup and quick reference
- [ ] Drag monster stat blocks straight into encounters
- [ ] Homebrew content editor as a parallel path (doesn't depend on licensing outcome)
- [ ] Actual rules description shown when the DM clicks an enemy or player token
      (pulled from the monster/character stat lookup above)
- [ ] DM-entered description shown when a player clicks an enemy token
      (freeform DM text, distinct from the rules lookup — surfaced here since
      both live on the same token-click UI)

## Phase 6 — DM tools
- [ ] Encounter builder (assemble monsters, auto-populate initiative)
- [ ] NPC/monster stat blocks the DM can drag onto the map (pulls from the
      Phase 5 content lookup, or a homebrew entry, into the encounter builder)
- [ ] Hidden DM notes / session journal
- [ ] Handouts (share an image/doc to players on demand)
- [ ] Random generators (loot, NPC names)
- [ ] Soundboard / ambience music
- [ ] Campaign export/import as a local file (download the Yjs doc state as a
      single file, re-import it later or on another machine) — backup/
      portability on top of the existing IndexedDB persistence, which can be
      cleared by the browser. Local file only, never uploaded anywhere — no
      new server-storage surface, matches the DM-hosted decision in Phase 1.

## Phase 7 — Player tools & polish
- [ ] Personal inventory management, spell slot/resource tracking
- [ ] Private vs. public rolls
- [ ] Built-in text chat (IC/OOC channels), map pings/emotes, and temporary
      annotations/drawing on the map
- [ ] Mobile/responsive pass (DM stays locked to computer/tablet — this is
      about the player-facing layout)
- [ ] Let players enter their intended moves; if moving as a group, vote on it

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

**Core infra:** campaign save/load (see Phase 6 — local file only, not
server-hosted)
**Maps:** drawing/measurement tools, ruler
**Rules:** automated attack/save/damage resolution
**Technical:** desktop-app packaging (Electron) if browser-only proves limiting
