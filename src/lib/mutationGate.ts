import { writable, get } from 'svelte/store'

export const updateFrozen = writable(false)
let attempt: number | null = null
let releasedAttempt = 0
export const mutationsFrozen = () => get(updateFrozen)
export function freezeForUpdate(id: number) {
  if (id <= releasedAttempt || (attempt !== null && id < attempt)) return false
  attempt = id; updateFrozen.set(true); return true
}
export function releaseUpdateFreeze(id?: number) {
  if (id === undefined) releasedAttempt = 0
  else releasedAttempt = Math.max(releasedAttempt, id)
  if (attempt === null) return
  if (id !== undefined && id !== attempt) return
  attempt = null; updateFrozen.set(false)
}
