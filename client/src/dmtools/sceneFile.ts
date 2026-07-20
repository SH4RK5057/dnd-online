import * as Y from 'yjs'
import type { LightRecord, SceneRecord, TokenRecord, WallRecord } from '../map/types'
import { downloadJson } from './fileUtils'

/** Exports one scene (its settings, tokens, walls, and lights — not the map
 * image or token art, which live in this browser's local asset cache and
 * don't travel with a JSON file; re-upload those after importing) as a
 * standalone JSON file a DM can reuse in another campaign. Campaign-specific
 * references (token ownerId/characterId, which only mean something in the
 * campaign they came from) are stripped on export; importing always
 * generates fresh ids rather than colliding with anything in the target doc. */

interface SceneFileBundle {
  formatVersion: 1
  scene: Omit<SceneRecord, 'id' | 'mapAssetId' | 'createdAt'>
  tokens: Omit<TokenRecord, 'id' | 'sceneId' | 'assetId' | 'ownerId' | 'characterId' | 'createdAt'>[]
  walls: Omit<WallRecord, 'id' | 'sceneId' | 'createdAt'>[]
  lights: Omit<LightRecord, 'id' | 'sceneId' | 'attachedTokenId' | 'createdAt'>[]
}

export function exportScene(doc: Y.Doc, sceneId: string): void {
  const scene = doc.getMap<SceneRecord>('scenes').get(sceneId)
  if (!scene) return
  const tokens = Array.from(doc.getMap<TokenRecord>('tokens').values()).filter((t) => t.sceneId === sceneId)
  const walls = Array.from(doc.getMap<WallRecord>('walls').values()).filter((w) => w.sceneId === sceneId)
  const lights = Array.from(doc.getMap<LightRecord>('lights').values()).filter((l) => l.sceneId === sceneId)

  const { id: _id, mapAssetId: _mapAssetId, createdAt: _createdAt, ...sceneRest } = scene
  const bundle: SceneFileBundle = {
    formatVersion: 1,
    scene: sceneRest,
    tokens: tokens.map(({ id: _tid, sceneId: _sid, assetId: _aid, ownerId: _oid, characterId: _cid, createdAt: _tca, ...rest }) => rest),
    walls: walls.map(({ id: _wid, sceneId: _wsid, createdAt: _wca, ...rest }) => rest),
    lights: lights.map(({ id: _lid, sceneId: _lsid, attachedTokenId: _atid, createdAt: _lca, ...rest }) => rest),
  }
  downloadJson(`${scene.name.replace(/[^a-z0-9-_]+/gi, '_') || 'scene'}.json`, bundle)
}

/** Returns the new scene's id, or null if the file wasn't recognizable. */
export function importSceneFile(doc: Y.Doc, parsed: unknown): string | null {
  if (!parsed || typeof parsed !== 'object' || (parsed as SceneFileBundle).formatVersion !== 1) return null
  const bundle = parsed as SceneFileBundle
  if (!bundle.scene || !Array.isArray(bundle.tokens) || !Array.isArray(bundle.walls) || !Array.isArray(bundle.lights)) {
    return null
  }

  const sceneId = crypto.randomUUID()
  const scenesM = doc.getMap<SceneRecord>('scenes')
  const tokensM = doc.getMap<TokenRecord>('tokens')
  const wallsM = doc.getMap<WallRecord>('walls')
  const lightsM = doc.getMap<LightRecord>('lights')

  doc.transact(() => {
    scenesM.set(sceneId, { ...bundle.scene, id: sceneId, mapAssetId: null, createdAt: Date.now() } as SceneRecord)
    for (const token of bundle.tokens) {
      const id = crypto.randomUUID()
      tokensM.set(id, { ...token, id, sceneId, assetId: null, ownerId: null, characterId: null, createdAt: Date.now() } as TokenRecord)
    }
    for (const wall of bundle.walls) {
      const id = crypto.randomUUID()
      wallsM.set(id, { ...wall, id, sceneId, createdAt: Date.now() } as WallRecord)
    }
    for (const light of bundle.lights) {
      const id = crypto.randomUUID()
      lightsM.set(id, { ...light, id, sceneId, attachedTokenId: null, createdAt: Date.now() } as LightRecord)
    }
  })

  return sceneId
}
