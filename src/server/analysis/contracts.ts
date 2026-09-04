import { z } from 'zod'

const observedSignalSchema = z.object({
  evidence: z.string().min(1),
  startSeconds: z.number().nonnegative().optional(),
})

export const videoEvidenceSchema = z.object({
  videoId: z.string().min(1),
  healthClaims: z.array(observedSignalSchema.extend({ claim: z.string().min(1) })).max(10),
  actionDirectives: z.array(observedSignalSchema.extend({ action: z.string().min(1) })).max(10),
  commercialSignals: z.array(observedSignalSchema.extend({ signal: z.string().min(1) })).max(10),
  sourceSignals: z
    .array(observedSignalSchema.extend({ source: z.string().min(1), traceable: z.boolean() }))
    .max(10),
  speakerIdentity: z.object({
    name: z.string().min(1).optional(),
    credential: z.string().min(1).optional(),
    organization: z.string().min(1).optional(),
  }),
  limitations: z.array(z.string().min(1)).max(10),
})

export type VideoEvidence = z.infer<typeof videoEvidenceSchema>

const riskAxisSchema = (max: number) =>
  z
    .object({
      points: z.number().int().min(0).max(max),
      reason: z.string(),
      evidence: z.string().optional(),
      startSeconds: z.number().nonnegative().optional(),
    })
    .superRefine((axis, context) => {
      if (axis.points > 0 && (!axis.reason.trim() || !axis.evidence?.trim())) {
        context.addIssue({
          code: 'custom',
          message: '양수 점수에는 reason과 evidence가 필요합니다.',
        })
      }
    })

export const videoRiskJudgementSchema = z
  .object({
    videoId: z.string().min(1),
    riskPoints: z.object({
      sourceOpacity: riskAxisSchema(30),
      treatmentChangeInducement: riskAxisSchema(10),
      purchaseInducement: riskAxisSchema(10),
    }),
    totalRiskPoints: z.number().int().min(0).max(50),
    limitations: z.array(z.string().min(1)).max(10),
  })
  .superRefine((value, context) => {
    const calculated = Object.values(value.riskPoints).reduce((sum, axis) => sum + axis.points, 0)
    if (calculated !== value.totalRiskPoints) {
      context.addIssue({ code: 'custom', message: 'totalRiskPoints가 세 축 합계와 다릅니다.' })
    }
  })

export type VideoRiskJudgement = z.infer<typeof videoRiskJudgementSchema>

export const thumbnailJudgementSchema = z.object({
  thumbnailSimilarity: z.object({
    riskPoints: z.number().int().min(0).max(10),
    reason: z.string().min(1),
    commonPatterns: z.array(z.string().min(1)).max(6),
    limitations: z.array(z.string().min(1)).max(6),
  }),
})

export type ThumbnailJudgement = z.infer<typeof thumbnailJudgementSchema>

export type AxisContributions = {
  sourceOpacity: number
  treatmentChangeInducement: number
  purchaseInducement: number
  uploadPattern: number
  syntheticMedia: number
  thumbnailSimilarity: number
}
