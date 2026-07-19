import { useState } from 'react'

export function CopyJoinCode({ code }: { code: string }) {
  const [copiedField, setCopiedField] = useState<'code' | 'link' | null>(null)

  const shareLink = `${window.location.origin}${window.location.pathname}?join=${encodeURIComponent(code)}`

  const copy = async (text: string, field: 'code' | 'link') => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(field)
      setTimeout(() => setCopiedField((current) => (current === field ? null : current)), 2000)
    } catch {
      // Clipboard API can be unavailable (permissions, insecure context) — the code/link
      // are still shown on screen for the user to select and copy manually.
    }
  }

  return (
    <div className="copy-join-code">
      <div className="copy-join-code__row">
        <span className="copy-join-code__code">{code}</span>
        <button type="button" onClick={() => copy(code, 'code')}>
          {copiedField === 'code' ? 'Copied!' : 'Copy code'}
        </button>
      </div>
      <div className="copy-join-code__row">
        <span className="copy-join-code__link">{shareLink}</span>
        <button type="button" onClick={() => copy(shareLink, 'link')}>
          {copiedField === 'link' ? 'Copied!' : 'Copy link'}
        </button>
      </div>
    </div>
  )
}
