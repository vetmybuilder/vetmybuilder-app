import Layout from '@/components/Layout'
import { initFirebase } from '@/utils/firebase'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { useState } from 'react'
import { useRouter } from 'next/router'

export default function Login(){
  const auth = initFirebase()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string|null>(null)
  const [busy, setBusy] = useState(false)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr(null)
    try {
      await signInWithEmailAndPassword(auth, email, password)
      router.replace('/projects')
    } catch (e: any) {
      setErr(e.message || 'Failed to login')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Layout>
      <div className="card max-w-md mx-auto">
        <h1 className="text-xl font-semibold mb-4">Login</h1>
        <form onSubmit={onSubmit} className="space-y-3">
          <input className="input" placeholder="Email" type="email" value={email} onChange={e=>setEmail(e.target.value)} required />
          <input className="input" placeholder="Password" type="password" value={password} onChange={e=>setPassword(e.target.value)} required />
          {err && <p className="text-red-400 text-sm">{err}</p>}
          <button className="btn w-full" disabled={busy}>{busy ? 'Signing in...' : 'Sign in'}</button>
        </form>
      </div>
    </Layout>
  )
}
