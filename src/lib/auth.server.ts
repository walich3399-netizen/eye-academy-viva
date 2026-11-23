import { createRemoteJWKSet, jwtVerify } from 'jose'

const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
)

JWKS.reload().catch(() => {})

export async function requireUid(idToken: string): Promise<string> {
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID
  if (!projectId) throw new Error('Server is missing VITE_FIREBASE_PROJECT_ID')
  if (!idToken) throw new Error('Not signed in')
  const { payload } = await jwtVerify(idToken, JWKS, {
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
  })
  if (!payload.sub) throw new Error('Invalid token')
  return payload.sub
}
