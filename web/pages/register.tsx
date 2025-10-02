import Layout from '@/components/Layout'
import { initFirebase } from '@/utils/firebase'
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { useRouter } from 'next/router'
import { useState } from 'react'

export default function Register(){
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
      await createUserWithEmailAndPassword(auth, email, password)
      router.replace('/projects')
    } catch (e: any) {
      setErr(e.message || 'Failed to register')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Layout>
      <div className="card max-w-md mx-auto">
        <h1 className="text-xl font-semibold mb-4">Register</h1>
        <form onSubmit={onSubmit} className="space-y-3">
          <input className="input" placeholder="Email" type="email" value={email} onChange={e=>setEmail(e.target.value)} required />
          <input className="input" placeholder="Password (min 6)" type="password" value={password} onChange={e=>setPassword(e.target.value)} required />
          {err && <p className="text-red-400 text-sm">{err}</p>}
          <button className="btn w-full" disabled={busy}>{busy ? 'Creating...' : 'Create account'}</button>
        </form>
      </div>
    </Layout>
  )
}
