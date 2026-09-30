import Dexie from 'dexie'
import api from './api'

const offlineDatabase = new Dexie('vanrakshak-offline')
offlineDatabase.version(1).stores({
  sosQueue: '++id, createdAt',
})

export async function enqueueSOS(payload) {
  return offlineDatabase.sosQueue.add({
    payload,
    createdAt: new Date().toISOString(),
  })
}

export async function getPendingSOSCount() {
  return offlineDatabase.sosQueue.count()
}

export async function syncQueuedSOS() {
  if (!navigator.onLine) return { sentCount: 0, pendingCount: await getPendingSOSCount() }

  const queuedItems = await offlineDatabase.sosQueue.orderBy('createdAt').toArray()
  const sentItems = []

  for (const queuedItem of queuedItems) {
    try {
      const { data } = await api.post('/incidents', queuedItem.payload)
      await offlineDatabase.sosQueue.delete(queuedItem.id)
      sentItems.push({ queueId: queuedItem.id, data })
    } catch (error) {
      if (!error.response) break
    }
  }

  return { sentItems, pendingCount: await getPendingSOSCount() }
}