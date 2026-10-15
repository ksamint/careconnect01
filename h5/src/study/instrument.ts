/**
 * Symptom questionnaire structure for the day-chemotherapy symptom-cluster study.
 *
 * 19 items in fixed order: 13 core symptom-severity items (s1–s13) and 6
 * interference items (i1–i6), each scored 0–10 over the past 24 hours —
 * the MDASI-C structure described in the grant application.
 *
 * The labels below are short working labels, NOT the licensed MDASI-C item
 * wording. Replace `promptZh`/`promptEn` with the licensed text once the
 * licence is in hand, then bump `instrumentVersion` in Study settings.
 */

export type Domain = 'symptom' | 'interference'

export type ItemId =
  | 's1' | 's2' | 's3' | 's4' | 's5' | 's6' | 's7' | 's8' | 's9' | 's10' | 's11' | 's12' | 's13'
  | 'i1' | 'i2' | 'i3' | 'i4' | 'i5' | 'i6'

export interface InstrumentItem {
  id: ItemId
  order: number
  domain: Domain
  icon: string
  labelZh: string
  labelEn: string
}

export const ITEMS: InstrumentItem[] = [
  { id: 's1', order: 1, domain: 'symptom', icon: 'healing', labelZh: '疼痛', labelEn: 'Pain' },
  { id: 's2', order: 2, domain: 'symptom', icon: 'battery_alert', labelZh: '疲劳（乏力）', labelEn: 'Fatigue' },
  { id: 's3', order: 3, domain: 'symptom', icon: 'sick', labelZh: '恶心', labelEn: 'Nausea' },
  { id: 's4', order: 4, domain: 'symptom', icon: 'bedtime', labelZh: '睡眠不安', labelEn: 'Disturbed sleep' },
  { id: 's5', order: 5, domain: 'symptom', icon: 'psychology', labelZh: '苦恼（心烦）', labelEn: 'Distress' },
  { id: 's6', order: 6, domain: 'symptom', icon: 'air', labelZh: '气短', labelEn: 'Shortness of breath' },
  { id: 's7', order: 7, domain: 'symptom', icon: 'neurology', labelZh: '健忘', labelEn: 'Difficulty remembering' },
  { id: 's8', order: 8, domain: 'symptom', icon: 'restaurant', labelZh: '胃口差', labelEn: 'Lack of appetite' },
  { id: 's9', order: 9, domain: 'symptom', icon: 'snooze', labelZh: '瞌睡（昏昏欲睡）', labelEn: 'Drowsiness' },
  { id: 's10', order: 10, domain: 'symptom', icon: 'water_drop', labelZh: '口干', labelEn: 'Dry mouth' },
  { id: 's11', order: 11, domain: 'symptom', icon: 'sentiment_sad', labelZh: '悲伤感', labelEn: 'Sadness' },
  { id: 's12', order: 12, domain: 'symptom', icon: 'gastroenterology', labelZh: '呕吐', labelEn: 'Vomiting' },
  { id: 's13', order: 13, domain: 'symptom', icon: 'back_hand', labelZh: '麻木感', labelEn: 'Numbness or tingling' },
  { id: 'i1', order: 14, domain: 'interference', icon: 'directions_run', labelZh: '一般活动', labelEn: 'General activity' },
  { id: 'i2', order: 15, domain: 'interference', icon: 'mood', labelZh: '情绪', labelEn: 'Mood' },
  { id: 'i3', order: 16, domain: 'interference', icon: 'work', labelZh: '工作（包括家务）', labelEn: 'Work (incl. housework)' },
  { id: 'i4', order: 17, domain: 'interference', icon: 'group', labelZh: '与他人的关系', labelEn: 'Relations with others' },
  { id: 'i5', order: 18, domain: 'interference', icon: 'directions_walk', labelZh: '走路', labelEn: 'Walking' },
  { id: 'i6', order: 19, domain: 'interference', icon: 'sentiment_satisfied', labelZh: '生活乐趣', labelEn: 'Enjoyment of life' },
]

export const SYMPTOM_ITEMS = ITEMS.filter(i => i.domain === 'symptom')
export const INTERFERENCE_ITEMS = ITEMS.filter(i => i.domain === 'interference')

export function itemLabel(item: InstrumentItem, locale: 'zh' | 'en'): string {
  return locale === 'zh' ? item.labelZh : item.labelEn
}

export function itemPrompt(item: InstrumentItem, locale: 'zh' | 'en'): string {
  const label = itemLabel(item, locale)
  if (item.domain === 'symptom') {
    return locale === 'zh'
      ? `过去 24 小时内，您「${label}」最严重时的程度`
      : `Your ${label.toLowerCase()} at its worst in the past 24 hours`
  }
  return locale === 'zh'
    ? `过去 24 小时内，症状对您「${label}」的影响程度`
    : `How much symptoms interfered with your ${label.toLowerCase()} in the past 24 hours`
}

export function anchors(domain: Domain, locale: 'zh' | 'en'): [string, string] {
  if (domain === 'symptom') return locale === 'zh' ? ['0 = 无', '10 = 能想象的最严重'] : ['0 = Not present', '10 = As bad as you can imagine']
  return locale === 'zh' ? ['0 = 无影响', '10 = 完全影响'] : ['0 = Did not interfere', '10 = Interfered completely']
}

/** null = the item was not answered. An explicit 0 is a real answer and is never confused with null. */
export type Responses = Record<ItemId, number | null>

export function emptyResponses(): Responses {
  return Object.fromEntries(ITEMS.map(i => [i.id, null])) as Responses
}
