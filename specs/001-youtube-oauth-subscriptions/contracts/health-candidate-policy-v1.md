# Health Candidate Policy v1

`health-candidate-policy-v1`은 Gemini 호출 전에 분석 대상을 넓게 선별하는 결정적 메타데이터
필터다. 이 결과는 건강정보의 정확성, 콘텐츠 위험 또는 채널 신뢰도를 뜻하지 않는다.

## Inputs

- 채널 제목과 설명
- 최신 공개 영상 최대 20개의 제목과 설명

태그, URL, 해시태그, 조회 수, 구독자 수, 업로드 빈도와 합성 콘텐츠 표시는 후보 판정에 사용하지
않는다.

## Normalization

1. Unicode NFKC를 적용한다.
2. locale-independent lowercase를 적용한다.
3. URL과 이메일 주소를 공백으로 치환한다.
4. `#`, `_`, punctuation과 symbol을 단어 구분 공백으로 치환한다.
5. 연속 공백을 하나로 줄이고 양끝 공백을 제거한다.
6. 한국어 term은 아래의 완전한 phrase만 매칭한다. 한 글자 substring term은 두지 않는다.
7. 영어 term은 Unicode letter/number 경계를 만족하는 완전한 phrase로 매칭한다.

## Strong terms

Strong term은 채널 제목 또는 채널 설명에 있을 때만 단독 후보 조건을 만족한다.

| Category         | Stable term IDs and phrases                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `condition`      | `ko-diabetes: 당뇨`, `ko-hypertension: 고혈압`, `ko-hypotension: 저혈압`, `ko-cancer: 암환자/암 치료/항암`, `ko-dementia: 치매`, `ko-stroke: 뇌졸중`, `ko-heart-attack: 심근경색`, `ko-arthritis: 관절염`, `ko-osteoporosis: 골다공증`, `ko-hyperlipidemia: 고지혈증`, `ko-fatty-liver: 지방간`, `ko-kidney-disease: 신장병/신장 질환`, `ko-thyroid: 갑상선 질환`, `en-diabetes: diabetes`, `en-hypertension: hypertension`, `en-cancer: cancer`, `en-dementia: dementia`, `en-stroke: stroke`, `en-arthritis: arthritis` |
| `treatment`      | `ko-diagnosis: 진단`, `ko-treatment: 치료`, `ko-prescription: 처방`, `ko-medication: 복약/약물/의약품`, `ko-surgery: 수술`, `ko-procedure: 시술`, `ko-rehabilitation: 재활치료`, `ko-vaccination: 예방접종`, `en-treatment: treatment`, `en-diagnosis: diagnosis`, `en-prescription: prescription`, `en-medication: medication`, `en-surgery: surgery`, `en-rehabilitation: rehabilitation`                                                                                                                               |
| `medical_role`   | `ko-specialist: 전문의`, `ko-pharmacist: 약사`, `ko-oriental-doctor: 한의사`, `ko-nurse: 간호사`, `ko-hospital: 병원`, `ko-clinic: 의원`, `ko-pharmacy: 약국`, `en-doctor: doctor`, `en-physician: physician`, `en-pharmacist: pharmacist`, `en-hospital: hospital`, `en-clinic: clinic`                                                                                                                                                                                                                                  |
| `test_procedure` | `ko-health-screening: 건강검진`, `ko-blood-test: 혈액검사`, `ko-endoscopy: 내시경`, `ko-xray: 엑스레이`, `ko-mri: MRI`, `ko-ct: CT 촬영`, `ko-ultrasound: 초음파 검사`, `en-blood-test: blood test`, `en-endoscopy: endoscopy`, `en-mri: MRI`, `en-ct-scan: CT scan`, `en-ultrasound: ultrasound`                                                                                                                                                                                                                         |

`의사`와 `약`은 단독 strong term으로 사용하지 않는다. 각각 `의사결정/의사소통`과
`예약/약속/절약` 같은 비의료 문맥의 과매칭 위험이 크기 때문이다. 필요한 의료 직역은 더 구체적인
phrase로 등록한다.

## Context terms

Context term은 최신 영상 제목·설명에서 사용한다.

| Category         | Stable term IDs and phrases                                                                                                                                                                                                                                                                               |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `general_health` | `ko-health: 건강`, `ko-immunity: 면역`, `ko-sleep: 수면`, `ko-aging: 노화`, `ko-longevity: 장수`, `ko-weight: 체중`, `en-health: health`, `en-immunity: immunity`, `en-sleep: sleep`, `en-aging: aging`                                                                                                   |
| `nutrition`      | `ko-nutrition: 영양`, `ko-diet: 식단`, `ko-food: 건강식/식품`, `ko-vitamin: 비타민`, `ko-mineral: 미네랄`, `ko-protein: 단백질`, `en-nutrition: nutrition`, `en-diet: diet`, `en-vitamin: vitamin`, `en-mineral: mineral`, `en-protein: protein`                                                          |
| `exercise`       | `ko-exercise: 운동`, `ko-stretching: 스트레칭`, `ko-walking: 걷기`, `ko-strength: 근력`, `ko-aerobic: 유산소`, `en-exercise: exercise`, `en-stretching: stretching`, `en-walking: walking`, `en-strength: strength training`, `en-aerobic: aerobic`                                                       |
| `symptom`        | `ko-pain: 통증`, `ko-fatigue: 피로`, `ko-dizziness: 어지럼증`, `ko-headache: 두통`, `ko-cough: 기침`, `ko-swelling: 부종/붓기`, `en-pain: pain`, `en-fatigue: fatigue`, `en-dizziness: dizziness`, `en-headache: headache`, `en-cough: cough`                                                             |
| `biomarker`      | `ko-blood-pressure: 혈압`, `ko-blood-sugar: 혈당`, `ko-cholesterol: 콜레스테롤`, `ko-pulse: 맥박`, `ko-temperature: 체온`, `ko-body-fat: 체지방`, `en-blood-pressure: blood pressure`, `en-blood-sugar: blood sugar`, `en-cholesterol: cholesterol`, `en-heart-rate: heart rate`, `en-body-fat: body fat` |

## Candidate decision

A channel is a candidate when any one condition is true:

1. Channel title or description matches at least one strong term.
2. At least two different latest videos each match one or more context terms.
3. One latest video matches context terms from at least two different categories.

The result stores unique `{category, termId, source, videoId?}` signals. It does not store a confidence score.

## Fixture gate

`tests/fixtures/health-candidates.ts` must contain at least 80 manually labelled cases:

- 40 positive: at least 15 strong-channel, 15 cross-video, and 10 multi-category-video cases.
- 40 negative: general cooking, professional sports, beauty/fashion, non-health education, and Korean/English
  ambiguous-word cases.
- Every case includes a stable ID, input fields, expected boolean, and one-line label rationale.
- Positive recall must be at least 95% (`>= 38/40`).
- Precision and false-positive case IDs are reported by the test but are not a v1 release gate.
- Any lexicon or matching-rule change increments the policy version or updates labelled fixtures with reviewer
  rationale in the same commit.
