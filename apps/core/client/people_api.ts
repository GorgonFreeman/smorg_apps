import { customFetch, type MineralResponse } from '@smorg/ui'

export type Person = {
  id: string
  handle: string
  firstName: string | null
  middleName: string | null
  lastName: string | null
  email: string | null
  phone: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export type PersonInput = {
  handle: string
  firstName?: string
  middleName?: string
  lastName?: string
  email?: string
  phone?: string
  notes?: string
}

export async function listPeople(q = ''): Promise<MineralResponse<Person[]>> {
  return customFetch<Person[]>('/api/apps/core/people', {
    params: q ? { q } : undefined,
  })
}

export async function createPerson(body: PersonInput) {
  return customFetch<Person>('/api/apps/core/people', {
    method: 'post',
    body,
  })
}

export async function updatePerson(id: string, body: Partial<PersonInput>) {
  return customFetch<Person>(`/api/apps/core/people/${ id }`, {
    method: 'patch',
    body,
  })
}

export async function deletePerson(id: string) {
  return customFetch(`/api/apps/core/people/${ id }`, {
    method: 'delete',
  })
}
