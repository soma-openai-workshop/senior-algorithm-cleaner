import type { ApiErrorCode } from './errors'

export const errorMessagesKo: Record<ApiErrorCode, string> = {
  invalid_request: '요청 내용을 확인해 주세요.',
  forbidden: '요청을 확인할 수 없습니다. 화면을 새로고침해 주세요.',
  not_found: '요청한 수집 기록을 찾을 수 없습니다.',
  expired: '보관 기간이 지난 수집 기록입니다. 새로 시작해 주세요.',
  reauth_required: 'YouTube 연결 시간이 끝났습니다. 다시 연결해 주세요.',
  oauth_denied: 'Google 연결이 취소되었습니다.',
  oauth_state_invalid: '안전한 연결 확인에 실패했습니다. 다시 시도해 주세요.',
  oauth_exchange_failed: 'Google 연결을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.',
  already_advancing: '구독 목록을 이미 가져오는 중입니다.',
  provider_unavailable: 'YouTube 응답이 늦어지고 있습니다. 잠시 후 다시 시도해 주세요.',
  provider_schema_invalid: 'YouTube 응답을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.',
  internal_error: '처리 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.',
}
