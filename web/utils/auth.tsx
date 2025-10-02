import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { initFirebase } from './firebase'
import { onAuthStateChanged, User, getIdToken } from 'firebase/auth'

type Ctx = { user: User | null, token: string | null, loading: boolean }
const AuthCtx = createContext<Ctx>({ user: null, token: null, loading: true })

export function AuthProvider({ children }: { children: React.ReactNode }){
  const [user, setUser] = useState<User|null>(null)
  const [token, setToken] = useState<string|null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const auth = initFirebase()
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u)
      if(u){
        const t = await getIdToken(u, true)
        setToken(t)
      } else {
        setToken(null)
      }
      setLoading(false)
    })
    return () => unsub()
  }, [])

  const value = useMemo(()=>({ user, token, loading }), [user, token, loading])
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}

export function useAuth(){ return useContext(AuthCtx) }
