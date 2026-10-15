export type Draft = { revision: number; answers: Record<string, number>; text: string; position: number }
export type CachedDraft = Draft & { dirty: boolean; submissionKey?: string }
export class SaveConflict extends Error {
  draft: Draft
  constructor(draft: Draft) { super('Another device saved newer answers.'); this.draft = draft }
}

// One in-flight write keeps revisions ordered; edits made during it remain dirty.
export class Autosave {
  value: CachedDraft
  conflict: Draft | null = null
  private timer: ReturnType<typeof setTimeout> | undefined
  private deadline: ReturnType<typeof setTimeout> | undefined
  private pending: Promise<void> | undefined
  private generation = 0
  key: string
  private storage: Pick<Storage, 'getItem' | 'setItem'>
  private send: (draft: Draft) => Promise<Draft>
  private notify: (status: string) => void
  private online: () => boolean
  constructor(key: string, server: Draft, storage: Pick<Storage, 'getItem' | 'setItem'>,
    send: (draft: Draft) => Promise<Draft>, notify: (status: string) => void,
    online = () => navigator.onLine) {
    this.key = key; this.storage = storage; this.send = send; this.notify = notify; this.online = online
    this.value = { ...server, dirty: false }
    const cached = storage.getItem(key)
    if (cached) {
      try {
        const local = JSON.parse(cached) as CachedDraft
        if (local.submissionKey) this.value.submissionKey = local.submissionKey
        if (local.dirty) { this.value = local; if (local.revision !== server.revision) this.conflict = server }
      } catch { /* An invalid local cache never replaces the server draft. */ }
    }
  }
  private persist() { this.storage.setItem(this.key, JSON.stringify(this.value)) }
  change(patch: Partial<Pick<Draft, 'answers' | 'text' | 'position'>>) {
    this.value = { ...this.value, ...patch, dirty: true }
    this.generation++
    try { this.persist() } catch { this.notify('Save failed — device storage unavailable'); return }
    this.notify(this.online() ? 'Saving' : 'Offline—saved on this device')
    clearTimeout(this.timer)
    this.timer = setTimeout(() => { void this.flush().catch(() => {}) }, 500)
    this.deadline ??= setTimeout(() => { void this.flush().catch(() => {}) }, 2000)
  }
  async flush(): Promise<void> {
    clearTimeout(this.timer); clearTimeout(this.deadline); this.deadline = undefined
    if (this.pending) { await this.pending; return this.flush() }
    if (this.conflict) throw new SaveConflict(this.conflict)
    if (!this.value.dirty) return
    if (!this.online()) { this.notify('Offline—saved on this device'); throw new Error('Reconnect before submitting.') }
    const generation = this.generation
    const snapshot = { ...this.value, answers: { ...this.value.answers } }
    this.notify('Saving')
    this.pending = (async () => {
      try {
        const result = await this.send(snapshot)
        this.value = { ...this.value, revision: result.revision, dirty: generation !== this.generation }
        this.persist()
        this.notify(this.value.dirty ? 'Saving' : 'Saved on server')
      } catch (error) {
        if (error instanceof SaveConflict) this.conflict = error.draft
        this.notify(this.online() ? 'Save failed' : 'Offline—saved on this device')
        throw error
      }
    })()
    try { await this.pending } finally { this.pending = undefined }
    if (this.value.dirty) return this.flush()
  }
  resolve(reapply: boolean) {
    if (!this.conflict) return
    this.value = reapply ? { ...this.value, revision: this.conflict.revision, dirty: true } : { ...this.conflict, dirty: false }
    this.conflict = null
    this.persist()
    this.notify(reapply ? 'Saving' : 'Saved on server')
    if (reapply) void this.flush().catch(() => {})
  }
  submissionKey() {
    this.value.submissionKey ??= crypto.randomUUID()
    this.persist()
    return this.value.submissionKey
  }
  dispose() { clearTimeout(this.timer); clearTimeout(this.deadline) }
}
