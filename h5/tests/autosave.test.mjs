import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Autosave, SaveConflict } from '../src/autosave.ts'
const draft = () => ({ revision: 0, answers: {}, text: '', position: 0 })
const storage = () => { const map = new Map(); return { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v) } }
test('immediate local persistence preserves explicit zero and missing items, restores offline work', async () => {
  const local = storage(); let status; let online = false
  const saver = new Autosave('participant:a', draft(), local, async d => ({ ...d, revision: 1 }), s => { status = s }, () => online)
  saver.change({ answers: { s1: 0 }, text: 'note', position: 4 })
  const cached = JSON.parse(local.getItem('participant:a'))
  assert.equal(cached.answers.s1, 0); assert.equal(cached.answers.s2, undefined); assert.equal(cached.position, 4)
  assert.equal(status, 'Offline—saved on this device')
  await assert.rejects(saver.flush(), /Reconnect/)
  const restored = new Autosave('participant:a', draft(), local, async d => ({ ...d, revision: 1 }), () => {}, () => true)
  assert.equal(restored.value.text, 'note'); await restored.flush(); assert.equal(restored.value.dirty, false)
  assert.equal(local.getItem('participant:b'), null)
  online = true; saver.dispose(); restored.dispose()
})
test('serializes in-flight saves and never loses edits made while waiting', async () => {
  let release; const writes = []
  const saver = new Autosave('a', draft(), storage(), async d => {
    writes.push(d); if (writes.length === 1) await new Promise(resolve => { release = resolve })
    return { ...d, revision: d.revision + 1 }
  }, () => {}, () => true)
  saver.change({ text: 'first' }); const pending = saver.flush()
  saver.change({ text: 'second' }); release(); await pending
  assert.equal(writes.length, 2); assert.equal(writes[1].revision, 1); assert.equal(writes[1].text, 'second')
  assert.equal(saver.value.revision, 2); assert.equal(saver.value.dirty, false); saver.dispose()
})
test('revision conflicts preserve local work until explicit reapply or reload', async () => {
  const server = { ...draft(), revision: 3, text: 'other device' }
  let conflict = true
  const saver = new Autosave('a', draft(), storage(), async d => { if (conflict) throw new SaveConflict(server); return { ...d, revision: 4 } }, () => {}, () => true)
  saver.change({ text: 'my edit' }); await assert.rejects(saver.flush(), SaveConflict)
  assert.equal(saver.value.text, 'my edit'); conflict = false; saver.resolve(true); await saver.flush()
  assert.equal(saver.value.text, 'my edit'); assert.equal(saver.value.revision, 4)
  saver.conflict = server; saver.resolve(false); assert.equal(saver.value.text, 'other device'); saver.dispose()
})
test('submission retry key persists across reopening and is reused after server acknowledgement', async () => {
  const local = storage(); const saver = new Autosave('a', draft(), local, async d => d, () => {}, () => true)
  saver.change({ text: 'pending' }); await saver.flush(); const key = saver.submissionKey()
  const restored = new Autosave('a', draft(), local, async d => d, () => {}, () => true)
  assert.equal(restored.submissionKey(), key); saver.dispose(); restored.dispose()
})
test('debounces at 500ms and forces a save within two seconds of continuous changes', async () => {
  const times = []
  const saver = new Autosave('a', draft(), storage(), async d => { times.push(Date.now()); return { ...d, revision: d.revision + 1 } }, () => {}, () => true)
  const start = Date.now(); saver.change({ text: 'first' })
  await new Promise(resolve => setTimeout(resolve, 600)); assert.equal(times.length, 1)
  const continuousStart = Date.now()
  for (let i = 0; i < 6; i++) { saver.change({ text: String(i) }); await new Promise(resolve => setTimeout(resolve, 400)) }
  assert.ok(times[1] - continuousStart < 2200); assert.ok(times[0] - start >= 480)
  await saver.flush(); saver.dispose()
})
