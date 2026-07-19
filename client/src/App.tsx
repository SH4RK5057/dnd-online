import { useEffect, useState } from 'react'
import { SessionProvider } from './session/SessionContext'
import { useSession } from './session/useSession'
import { loadLastSession } from './session/lastSession'
import { LandingScreen } from './screens/LandingScreen'
import { HostSetupScreen } from './screens/HostSetupScreen'
import { JoinSetupScreen } from './screens/JoinSetupScreen'
import { SessionScreen } from './screens/SessionScreen'
import type { LastSession } from './session/types'
import './App.css'

type Screen = 'landing' | 'host-form' | 'join-form'

function Shell() {
  const { session, startSession, joinSession } = useSession()
  const [screen, setScreen] = useState<Screen>('landing')
  const [prefillCode, setPrefillCode] = useState<string | undefined>(undefined)
  const [lastSession, setLastSession] = useState<LastSession | null>(null)

  useEffect(() => {
    setLastSession(loadLastSession())
    const params = new URLSearchParams(window.location.search)
    const join = params.get('join')
    if (join) {
      setPrefillCode(join)
      setScreen('join-form')
    }
  }, [])

  if (session) return <SessionScreen />

  switch (screen) {
    case 'host-form':
      return <HostSetupScreen onSubmit={startSession} onBack={() => setScreen('landing')} />
    case 'join-form':
      return (
        <JoinSetupScreen
          initialCode={prefillCode}
          onSubmit={joinSession}
          onBack={() => setScreen('landing')}
        />
      )
    default:
      return (
        <LandingScreen
          lastSession={lastSession}
          onHost={() => setScreen('host-form')}
          onJoin={() => setScreen('join-form')}
          onResume={(saved) =>
            startSession(saved.dmName, { reuseCode: saved.code, sessionName: saved.sessionName })
          }
        />
      )
  }
}

function App() {
  return (
    <SessionProvider>
      <Shell />
    </SessionProvider>
  )
}

export default App
