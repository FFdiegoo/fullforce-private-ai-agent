import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export async function getUserAndRole() {
  const supabase = createServerComponentClient({ cookies })

  const {
    data: { session },
  } = await supabase.auth.getSession()

  const user = session?.user || null

  if (!user) return { user: null, role: null }

  // Haal de rol op uit je eigen Supabase 'profiles' of 'users' tabel
  const { data, error } = await supabase
    .from('profiles') // vervang met jouw tabel als het anders heet
    .select('role')
    .eq('id', user.id)
    .single()

  if (error) {
    console.error('Rol ophalen mislukt:', error.message)
    return { user, role: null }
  }

  return { user, role: data?.role || null }
}