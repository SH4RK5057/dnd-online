import { useRef } from 'react'
import { useSoundboard } from '../dmtools/useSoundboard'

/** DM-only, local playback only — see useSoundboard.ts for why this never
 * syncs to players. Works the same across every campaign since clips are
 * stored in Global Settings, not the per-campaign doc. */
export function SoundboardPanel() {
  const { clips, addClip, removeClip, play, stop, stopAll, playingIds } = useSoundboard()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleUpload = async (file: File | undefined) => {
    if (!file) return
    await addClip(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="soundboard-panel">
      <p className="compendium-drawer__hint">
        Plays on this device only — not sent to players. Use it alongside your own speakers, same as playing music
        from a phone at the table.
      </p>
      <div className="dm-notes-panel__new">
        <input ref={fileInputRef} type="file" accept="audio/*" onChange={(e) => void handleUpload(e.target.files?.[0])} />
        <button type="button" onClick={stopAll} disabled={playingIds.size === 0}>
          Stop all
        </button>
      </div>
      <ul className="soundboard-panel__list">
        {clips.map((clip) => {
          const isPlaying = playingIds.has(clip.id)
          return (
            <li key={clip.id}>
              <span>{clip.name}</span>
              {isPlaying ? (
                <button type="button" onClick={() => stop(clip.id)}>
                  Stop
                </button>
              ) : (
                <>
                  <button type="button" onClick={() => void play(clip.id, { loop: false })}>
                    Play once
                  </button>
                  <button type="button" onClick={() => void play(clip.id, { loop: true })}>
                    Loop
                  </button>
                </>
              )}
              <button type="button" onClick={() => removeClip(clip.id)}>
                Delete
              </button>
            </li>
          )
        })}
        {clips.length === 0 && <li className="character-sheet__hint">No clips yet.</li>}
      </ul>
    </div>
  )
}
