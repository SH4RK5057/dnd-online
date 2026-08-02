/** Small "jump to section" pill row for a tool tab that combines multiple
 * previously-separate tools into one — each part still renders fully
 * (stacked, same as before the merge), this just scrolls the panel to a
 * given part's anchor instead of making the DM scroll past the others to
 * find it. Not a tab switcher: nothing is hidden, clicking a pill just
 * jumps the scroll position. */
export function SubTabNav({ parts }: { parts: { id: string; label: string }[] }) {
  const jumpTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="sub-tab-nav">
      {parts.map((part) => (
        <button key={part.id} type="button" className="sub-tab-nav__pill" onClick={() => jumpTo(part.id)}>
          {part.label}
        </button>
      ))}
    </div>
  )
}
