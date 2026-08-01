import { useState, type ReactNode } from 'react'

/**
 * Collapsible, reorderable wrapper for one block of the session side panel
 * — replaces the old scattered "Show X" / "Hide X" toggle buttons with a
 * consistent header (title + collapse chevron + move up/down), so every
 * section behaves the same way. Collapse state is local/ephemeral (not
 * persisted); section ORDER is the part that's saved, via
 * screens/usePanelOrder.ts one level up, since that's the actual "let me
 * arrange my UI" preference — collapsing is just decluttering for now.
 */
export function PanelSection({
  title,
  defaultCollapsed = false,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  children,
}: {
  title: string
  defaultCollapsed?: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  children: ReactNode
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)

  return (
    <div className="panel-section">
      <div className="panel-section__header">
        <button
          type="button"
          className="panel-section__collapse-toggle"
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!collapsed}
        >
          <span className="panel-section__chevron">{collapsed ? '▸' : '▾'}</span>
          {title}
        </button>
        <div className="panel-section__move-buttons">
          <button type="button" onClick={onMoveUp} disabled={!canMoveUp} title="Move section up">
            ↑
          </button>
          <button type="button" onClick={onMoveDown} disabled={!canMoveDown} title="Move section down">
            ↓
          </button>
        </div>
      </div>
      {!collapsed && <div className="panel-section__body">{children}</div>}
    </div>
  )
}
