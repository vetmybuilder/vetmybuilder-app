import { useAuth } from '@/utils/auth'
import { useRouter } from 'next/router'
import { useEffect } from 'react'

export default function AuthedOnly({ children }: { children: React.ReactNode }){
  const { user, loading } = useAuth()
  const router = useRouter()
  useEffect(() => {
    if(!loading && !user){
      router.replace('/login')
    }
  }, [loading, user, router])
  if(loading) return <p>Loading...</p>
  if(!user) return null
  return <>{children}</>
}
