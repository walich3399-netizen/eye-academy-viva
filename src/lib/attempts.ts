import { addDoc, collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore'
import { db } from './firebase'
import type { Revealed } from './findings'

export type Phase = 'examining' | 'awaiting_answer' | 'awaiting_followup_answer' | 'done'

export interface Msg {
  role: 'examiner' | 'trainee'
  text: string
  at: number
  latencyMs?: number
  serverMs?: number
}

export interface Revision {
  status: 'supported' | 'unsupported'
  message: string
  point?: string
  citation?: { page: number; chunkId: string; section: string; excerpt: string; excerptRepaired: boolean }
  retrieved: { chunkId: string; page: number; score: number; section: string }[]
  gap?: string
  query?: string
  source: 'llm' | 'fallback'
}

export interface Attempt {
  id: string
  ownerUid: string
  caseId: string
  createdAt: number
  phase: Phase
  transcript: Msg[]
  revealed: Revealed[]
  answer?: string
  followUp?: string
  followUpAnswer?: string
  revision?: Revision
}

const col = () => {
  if (!db) throw new Error('Firebase is not configured')
  return collection(db, 'attempts')
}

const clean = <T,>(o: T): T => JSON.parse(JSON.stringify(o))

export async function createAttempt(ownerUid: string, caseId: string, opening: string): Promise<string> {
  const a: Omit<Attempt, 'id'> = {
    ownerUid,
    caseId,
    createdAt: Date.now(),
    phase: 'examining',
    transcript: [{ role: 'examiner', text: opening, at: Date.now() }],
    revealed: [],
  }
  const ref = await addDoc(col(), clean(a))
  return ref.id
}

export async function saveAttempt(a: Attempt): Promise<void> {
  const { id, ...rest } = a
  await setDoc(doc(col(), id), clean(rest))
}

export async function loadAttempt(id: string): Promise<Attempt | null> {
  const s = await getDoc(doc(col(), id))
  return s.exists() ? ({ id: s.id, ...(s.data() as Omit<Attempt, 'id'>) }) : null
}

export async function listAttempts(ownerUid: string): Promise<Attempt[]> {
  const s = await getDocs(query(col(), where('ownerUid', '==', ownerUid)))
  return s.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<Attempt, 'id'>) }))
    .sort((a, b) => b.createdAt - a.createdAt)
}
