export const HEALTH_CANDIDATE_POLICY_VERSION = 'health-candidate-policy-v1'

type Term = { category: string; termId: string; phrases: string[] }

export type HealthSignal = {
  category: string
  termId: string
  source: 'channel_title' | 'channel_description' | 'video_title' | 'video_description'
  videoId?: string
}

const strongTerms: Term[] = [
  { category: 'condition', termId: 'ko-diabetes', phrases: ['당뇨'] },
  { category: 'condition', termId: 'ko-hypertension', phrases: ['고혈압'] },
  { category: 'condition', termId: 'ko-hypotension', phrases: ['저혈압'] },
  { category: 'condition', termId: 'ko-cancer', phrases: ['암환자', '암 치료', '항암'] },
  { category: 'condition', termId: 'ko-dementia', phrases: ['치매'] },
  { category: 'condition', termId: 'ko-stroke', phrases: ['뇌졸중'] },
  { category: 'condition', termId: 'ko-heart-attack', phrases: ['심근경색'] },
  { category: 'condition', termId: 'ko-arthritis', phrases: ['관절염'] },
  { category: 'condition', termId: 'ko-osteoporosis', phrases: ['골다공증'] },
  { category: 'condition', termId: 'ko-hyperlipidemia', phrases: ['고지혈증'] },
  { category: 'condition', termId: 'ko-fatty-liver', phrases: ['지방간'] },
  { category: 'condition', termId: 'ko-kidney-disease', phrases: ['신장병', '신장 질환'] },
  { category: 'condition', termId: 'ko-thyroid', phrases: ['갑상선 질환'] },
  { category: 'condition', termId: 'en-diabetes', phrases: ['diabetes'] },
  { category: 'condition', termId: 'en-hypertension', phrases: ['hypertension'] },
  { category: 'condition', termId: 'en-cancer', phrases: ['cancer'] },
  { category: 'condition', termId: 'en-dementia', phrases: ['dementia'] },
  { category: 'condition', termId: 'en-stroke', phrases: ['stroke'] },
  { category: 'condition', termId: 'en-arthritis', phrases: ['arthritis'] },
  { category: 'treatment', termId: 'ko-diagnosis', phrases: ['진단'] },
  { category: 'treatment', termId: 'ko-treatment', phrases: ['치료'] },
  { category: 'treatment', termId: 'ko-prescription', phrases: ['처방'] },
  { category: 'treatment', termId: 'ko-medication', phrases: ['복약', '약물', '의약품'] },
  { category: 'treatment', termId: 'ko-surgery', phrases: ['수술'] },
  { category: 'treatment', termId: 'ko-procedure', phrases: ['시술'] },
  { category: 'treatment', termId: 'ko-rehabilitation', phrases: ['재활치료'] },
  { category: 'treatment', termId: 'ko-vaccination', phrases: ['예방접종'] },
  { category: 'treatment', termId: 'en-treatment', phrases: ['treatment'] },
  { category: 'treatment', termId: 'en-diagnosis', phrases: ['diagnosis'] },
  { category: 'treatment', termId: 'en-prescription', phrases: ['prescription'] },
  { category: 'treatment', termId: 'en-medication', phrases: ['medication'] },
  { category: 'treatment', termId: 'en-surgery', phrases: ['surgery'] },
  { category: 'treatment', termId: 'en-rehabilitation', phrases: ['rehabilitation'] },
  { category: 'medical_role', termId: 'ko-specialist', phrases: ['전문의'] },
  { category: 'medical_role', termId: 'ko-pharmacist', phrases: ['약사'] },
  { category: 'medical_role', termId: 'ko-oriental-doctor', phrases: ['한의사'] },
  { category: 'medical_role', termId: 'ko-nurse', phrases: ['간호사'] },
  { category: 'medical_role', termId: 'ko-hospital', phrases: ['병원'] },
  { category: 'medical_role', termId: 'ko-clinic', phrases: ['의원'] },
  { category: 'medical_role', termId: 'ko-pharmacy', phrases: ['약국'] },
  { category: 'medical_role', termId: 'en-doctor', phrases: ['doctor'] },
  { category: 'medical_role', termId: 'en-physician', phrases: ['physician'] },
  { category: 'medical_role', termId: 'en-pharmacist', phrases: ['pharmacist'] },
  { category: 'medical_role', termId: 'en-hospital', phrases: ['hospital'] },
  { category: 'medical_role', termId: 'en-clinic', phrases: ['clinic'] },
  { category: 'test_procedure', termId: 'ko-health-screening', phrases: ['건강검진'] },
  { category: 'test_procedure', termId: 'ko-blood-test', phrases: ['혈액검사'] },
  { category: 'test_procedure', termId: 'ko-endoscopy', phrases: ['내시경'] },
  { category: 'test_procedure', termId: 'ko-xray', phrases: ['엑스레이'] },
  { category: 'test_procedure', termId: 'ko-mri', phrases: ['mri'] },
  { category: 'test_procedure', termId: 'ko-ct', phrases: ['ct 촬영'] },
  { category: 'test_procedure', termId: 'ko-ultrasound', phrases: ['초음파 검사'] },
  { category: 'test_procedure', termId: 'en-blood-test', phrases: ['blood test'] },
  { category: 'test_procedure', termId: 'en-endoscopy', phrases: ['endoscopy'] },
  { category: 'test_procedure', termId: 'en-mri', phrases: ['mri'] },
  { category: 'test_procedure', termId: 'en-ct-scan', phrases: ['ct scan'] },
  { category: 'test_procedure', termId: 'en-ultrasound', phrases: ['ultrasound'] },
]

const contextTerms: Term[] = [
  { category: 'general_health', termId: 'ko-health', phrases: ['건강'] },
  { category: 'general_health', termId: 'ko-immunity', phrases: ['면역'] },
  { category: 'general_health', termId: 'ko-sleep', phrases: ['수면'] },
  { category: 'general_health', termId: 'ko-aging', phrases: ['노화'] },
  { category: 'general_health', termId: 'ko-longevity', phrases: ['장수'] },
  { category: 'general_health', termId: 'ko-weight', phrases: ['체중'] },
  { category: 'general_health', termId: 'en-health', phrases: ['health'] },
  { category: 'general_health', termId: 'en-immunity', phrases: ['immunity'] },
  { category: 'general_health', termId: 'en-sleep', phrases: ['sleep'] },
  { category: 'general_health', termId: 'en-aging', phrases: ['aging'] },
  { category: 'nutrition', termId: 'ko-nutrition', phrases: ['영양'] },
  { category: 'nutrition', termId: 'ko-diet', phrases: ['식단'] },
  { category: 'nutrition', termId: 'ko-food', phrases: ['건강식', '식품'] },
  { category: 'nutrition', termId: 'ko-vitamin', phrases: ['비타민'] },
  { category: 'nutrition', termId: 'ko-mineral', phrases: ['미네랄'] },
  { category: 'nutrition', termId: 'ko-protein', phrases: ['단백질'] },
  { category: 'nutrition', termId: 'en-nutrition', phrases: ['nutrition'] },
  { category: 'nutrition', termId: 'en-diet', phrases: ['diet'] },
  { category: 'nutrition', termId: 'en-vitamin', phrases: ['vitamin'] },
  { category: 'nutrition', termId: 'en-mineral', phrases: ['mineral'] },
  { category: 'nutrition', termId: 'en-protein', phrases: ['protein'] },
  { category: 'exercise', termId: 'ko-exercise', phrases: ['운동'] },
  { category: 'exercise', termId: 'ko-stretching', phrases: ['스트레칭'] },
  { category: 'exercise', termId: 'ko-walking', phrases: ['걷기'] },
  { category: 'exercise', termId: 'ko-strength', phrases: ['근력'] },
  { category: 'exercise', termId: 'ko-aerobic', phrases: ['유산소'] },
  { category: 'exercise', termId: 'en-exercise', phrases: ['exercise'] },
  { category: 'exercise', termId: 'en-stretching', phrases: ['stretching'] },
  { category: 'exercise', termId: 'en-walking', phrases: ['walking'] },
  { category: 'exercise', termId: 'en-strength', phrases: ['strength training'] },
  { category: 'exercise', termId: 'en-aerobic', phrases: ['aerobic'] },
  { category: 'symptom', termId: 'ko-pain', phrases: ['통증'] },
  { category: 'symptom', termId: 'ko-fatigue', phrases: ['피로'] },
  { category: 'symptom', termId: 'ko-dizziness', phrases: ['어지럼증'] },
  { category: 'symptom', termId: 'ko-headache', phrases: ['두통'] },
  { category: 'symptom', termId: 'ko-cough', phrases: ['기침'] },
  { category: 'symptom', termId: 'ko-swelling', phrases: ['부종', '붓기'] },
  { category: 'symptom', termId: 'en-pain', phrases: ['pain'] },
  { category: 'symptom', termId: 'en-fatigue', phrases: ['fatigue'] },
  { category: 'symptom', termId: 'en-dizziness', phrases: ['dizziness'] },
  { category: 'symptom', termId: 'en-headache', phrases: ['headache'] },
  { category: 'symptom', termId: 'en-cough', phrases: ['cough'] },
  { category: 'biomarker', termId: 'ko-blood-pressure', phrases: ['혈압'] },
  { category: 'biomarker', termId: 'ko-blood-sugar', phrases: ['혈당'] },
  { category: 'biomarker', termId: 'ko-cholesterol', phrases: ['콜레스테롤'] },
  { category: 'biomarker', termId: 'ko-pulse', phrases: ['맥박'] },
  { category: 'biomarker', termId: 'ko-temperature', phrases: ['체온'] },
  { category: 'biomarker', termId: 'ko-body-fat', phrases: ['체지방'] },
  { category: 'biomarker', termId: 'en-blood-pressure', phrases: ['blood pressure'] },
  { category: 'biomarker', termId: 'en-blood-sugar', phrases: ['blood sugar'] },
  { category: 'biomarker', termId: 'en-cholesterol', phrases: ['cholesterol'] },
  { category: 'biomarker', termId: 'en-heart-rate', phrases: ['heart rate'] },
  { category: 'biomarker', termId: 'en-body-fat', phrases: ['body fat'] },
]

export function normalizeHealthText(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('und')
    .replace(/https?:\/\/\S+|\b\S+@\S+\.\S+\b/gu, ' ')
    .replace(/[\p{P}\p{S}_#]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

function matches(text: string, phrase: string): boolean {
  if (/^[\x00-\x7F]+$/.test(phrase)) {
    return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escapeRegex(phrase)}(?:$|[^\\p{L}\\p{N}])`, 'u').test(
      text,
    )
  }
  return text.includes(phrase)
}

function signalsFor(
  value: string,
  terms: Term[],
  source: HealthSignal['source'],
  videoId?: string,
): HealthSignal[] {
  const text = normalizeHealthText(value)
  return terms.flatMap((term) =>
    term.phrases.some((phrase) => matches(text, normalizeHealthText(phrase)))
      ? [{ category: term.category, termId: term.termId, source, ...(videoId ? { videoId } : {}) }]
      : [],
  )
}

export function classifyHealthCandidate(input: {
  channelTitle: string
  channelDescription: string
  videos: Array<{ videoId: string; title: string; description: string }>
}) {
  const channelSignals = [
    ...signalsFor(input.channelTitle, strongTerms, 'channel_title'),
    ...signalsFor(input.channelDescription, strongTerms, 'channel_description'),
  ]
  const videos = input.videos.slice(0, 20).map((video) => ({
    videoId: video.videoId,
    signals: [
      ...signalsFor(video.title, contextTerms, 'video_title', video.videoId),
      ...signalsFor(video.description, contextTerms, 'video_description', video.videoId),
    ],
  }))
  const crossVideo = videos.filter((video) => video.signals.length > 0).length >= 2
  const multiCategory = videos.some(
    (video) => new Set(video.signals.map((signal) => signal.category)).size >= 2,
  )
  const allSignals = [...channelSignals, ...videos.flatMap((video) => video.signals)]
  const unique = Array.from(
    new Map(
      allSignals.map((signal) => [
        `${signal.category}|${signal.termId}|${signal.source}|${signal.videoId ?? ''}`,
        signal,
      ]),
    ).values(),
  )
  return {
    isCandidate: channelSignals.length > 0 || crossVideo || multiCategory,
    policyVersion: HEALTH_CANDIDATE_POLICY_VERSION,
    matchedSignals: unique,
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
