export type HealthCandidateFixture = {
  id: string
  expected: boolean
  rationale: string
  channelTitle: string
  channelDescription: string
  videos: Array<{ videoId: string; title: string; description: string }>
}

const strongPhrases = [
  '당뇨 생활 안내',
  '고혈압 바로알기',
  '항암 환자 교실',
  '치매 가족 안내',
  '뇌졸중 재활 이야기',
  '관절염 건강 교실',
  '골다공증 정보',
  '고지혈증 상담',
  '지방간 관리',
  '신장 질환 안내',
  '갑상선 질환 이야기',
  '약사의 복약 안내',
  '전문의 건강검진',
  '혈액검사 해설',
  'Diabetes Clinic',
]

const crossVideoPairs = [
  ['숙면을 위한 수면 습관', '면역을 위한 일상'],
  ['오늘의 걷기', '집에서 하는 근력 운동'],
  ['비타민을 알아봅니다', '단백질 식단'],
  ['두통이 있을 때', '기침이 계속될 때'],
  ['혈압 기록하기', '혈당 기록하기'],
  ['체중을 천천히 줄이기', '건강한 장수 습관'],
  ['Stretching basics', 'Walking every day'],
  ['Nutrition guide', 'Protein meal'],
  ['Sleep routine', 'Healthy aging'],
  ['Pain diary', 'Fatigue diary'],
  ['콜레스테롤 이해하기', '맥박 재는 법'],
  ['건강식 장보기', '미네랄 알아보기'],
  ['유산소 시작하기', '스트레칭 따라하기'],
  ['어지럼증 기록', '붓기 기록'],
  ['Blood pressure log', 'Blood sugar log'],
]

const multiCategoryTitles = [
  '혈압에 좋은 걷기 운동',
  '체중 관리를 위한 단백질 식단',
  '수면과 두통의 관계',
  '콜레스테롤과 건강식',
  '피로할 때 가벼운 스트레칭',
  'Blood sugar and diet',
  'Sleep and exercise',
  'Body fat and nutrition',
  'Heart rate during walking',
  '면역을 위한 비타민 식품',
]

const negativeTitles = [
  '집밥 반찬 만들기',
  '서울 맛집 탐방',
  '프로야구 경기 분석',
  '축구 전술 이야기',
  '가을 메이크업',
  '옷장 정리 방법',
  '초등 수학 공부',
  '영어 회화 한 문장',
  '코딩 강의',
  '사진 보정 방법',
  '자동차 시승기',
  '캠핑 장비 소개',
  '의사결정 잘하는 법',
  '의사소통 연습',
  '친구와 약속 잡기',
  '여행 경비 절약',
  '공연 예약 안내',
  '계약 조건 확인',
  '건강보험 광고 문구 없음',
  '다이어리 꾸미기',
  'sleeping bag review',
  'health insurance finance',
  'walking tour in seoul',
  'protein paint technique',
  'clinic architecture tour',
  'doctor who episode review',
  'cancer constellation story',
  'stroke brush technique',
  'diet coke collection',
  'exercise book grammar',
  '원예와 식물 키우기',
  '강아지 산책 브이로그',
  '재테크 기초',
  '부동산 시장 읽기',
  '피아노 연주 모음',
  '독서 기록',
  '박물관 전시 소개',
  '목공 초보 수업',
  '제주도 여행',
  '스마트폰 사용법',
]

export const healthCandidateFixtures: HealthCandidateFixture[] = [
  ...strongPhrases.map((channelTitle, index) => ({
    id: `positive-strong-${index + 1}`,
    expected: true,
    rationale: '채널 제목에 강한 의료 용어가 있다.',
    channelTitle,
    channelDescription: '',
    videos: [],
  })),
  ...crossVideoPairs.map(([first, second], index) => ({
    id: `positive-cross-video-${index + 1}`,
    expected: true,
    rationale: '서로 다른 최신 영상 두 개에 건강 문맥 용어가 있다.',
    channelTitle: '매일의 이야기',
    channelDescription: '',
    videos: [
      { videoId: `cross-${index}-a`, title: first, description: '' },
      { videoId: `cross-${index}-b`, title: second, description: '' },
    ],
  })),
  ...multiCategoryTitles.map((title, index) => ({
    id: `positive-multi-category-${index + 1}`,
    expected: true,
    rationale: '한 영상에 서로 다른 건강 문맥 범주가 둘 이상 있다.',
    channelTitle: '생활 정보',
    channelDescription: '',
    videos: [{ videoId: `multi-${index}`, title, description: '' }],
  })),
  ...negativeTitles.map((title, index) => ({
    id: `negative-${index + 1}`,
    expected: false,
    rationale: '일반 관심사 또는 경계가 필요한 중의적 표현이다.',
    channelTitle: title,
    channelDescription: '',
    videos: [{ videoId: `negative-${index}`, title, description: '' }],
  })),
]
