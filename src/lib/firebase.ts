import { getApps, initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const cfg = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
}

export const firebaseConfigured = !!(cfg.apiKey && cfg.projectId && cfg.appId)

const app = firebaseConfigured ? (getApps()[0] ?? initializeApp(cfg)) : null
export const auth = app ? getAuth(app) : null
export const db = app ? getFirestore(app) : null
