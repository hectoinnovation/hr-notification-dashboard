// ─────────────────────────────────────────────────────────────────────────────
// "등록된 과제" 목록을 사업부/본부/연구소별로 묶어 보여주기 위한 조직 매핑.
// DB(ai_tasks.team, ai_teams.name)에는 팀명만 저장되어 있고 상위 조직(사업부/본부) 정보가
// 없으므로, 이 파일의 정적 매핑표로 프론트엔드에서만 그룹을 계산한다 — DB 스키마 변경 없음.
//
// 향후 조직개편으로 팀이 추가/삭제/이동되면 이 파일의 ORG_TEAMS만 수정하면 된다
// (화면 코드는 건드릴 필요 없음).
// ─────────────────────────────────────────────────────────────────────────────

export type OrgGroup = 'SP사업부' | 'WALLET사업부' | '기술연구소' | '마케팅사업부' | '인사본부' | '재무본부' | '기타'

// 화면에 항상 이 순서로 노출 (매핑되지 않은 팀은 마지막 '기타'로).
export const ORG_GROUP_ORDER: OrgGroup[] = ['SP사업부', 'WALLET사업부', '기술연구소', '마케팅사업부', '인사본부', '재무본부', '기타']

const ORG_TEAMS: Record<Exclude<OrgGroup, '기타'>, string[]> = {
  'SP사업부': [
    '데이터정책팀', 'UX팀', '기획1팀', '기획2팀', '기획3팀', '사업관리팀',
    '카드사기획팀', '신규사업1팀', 'PASS사업팀', '기획팀', '개발팀',
  ],
  'WALLET사업부': [
    '플랫폼기획팀', '사업기획팀', '월렛플랫폼개발팀', '서버개발팀', '앱개발팀', '웹개발팀',
  ],
  '기술연구소': [
    '서비스개발1팀', 'PASS개발팀', '운영플랫폼개발팀', '앱개발1팀', '앱개발2팀',
    '개발1팀', '개발2팀', '개발3팀', '시스템운영팀', '보안인프라팀', 'DB운영팀',
  ],
  '마케팅사업부': [
    '이통사제휴마케팅팀', '카드사제휴마케팅팀',
  ],
  '인사본부': [
    '인재협업팀', '소통지원팀',
  ],
  '재무본부': [
    '재무회계팀', '내부회계팀', 'IR팀',
  ],
}

// 팀명 → 그룹 정확 일치용 조회 테이블 ("개발1팀"이 "개발팀"에, "앱개발1팀"이 "개발1팀"에
// 잘못 걸리는 일이 없도록 항상 완전 일치로만 조회한다 — 부분 문자열 포함 매칭 금지).
const TEAM_TO_ORG_GROUP: Record<string, Exclude<OrgGroup, '기타'>> = Object.fromEntries(
  (Object.entries(ORG_TEAMS) as [Exclude<OrgGroup, '기타'>, string[]][])
    .flatMap(([group, teams]) => teams.map(team => [team, group] as const))
)

// "서비스개발1실 / 서비스개발1팀"처럼 상위 조직명과 함께 저장된 과거 데이터를 대비해,
// 정확히 일치하는 값이 없을 때만 구분자 뒤쪽(가장 구체적인 조직 단위)을 추출해 다시 시도한다.
// 이 추출 결과도 항상 완전 일치로만 조회하므로, 부분 일치로 인한 오분류는 발생하지 않는다.
function extractCandidates(raw: string): string[] {
  const candidates: string[] = []

  const slashParts = raw.split('/').map(s => s.trim()).filter(Boolean)
  if (slashParts.length > 1) candidates.push(slashParts[slashParts.length - 1])

  const tokens = raw.split(/\s+/).filter(Boolean)
  if (tokens.length > 1) candidates.push(tokens[tokens.length - 1])

  return candidates
}

/** 과제 등록자의 팀명(ai_tasks.team)으로 소속 사업부/본부/연구소를 판별한다. 매핑 실패·빈 값은 '기타'. */
export function resolveOrgGroup(rawTeam: string | null | undefined): OrgGroup {
  const trimmed = (rawTeam ?? '').trim()
  if (!trimmed) return '기타'

  if (TEAM_TO_ORG_GROUP[trimmed]) return TEAM_TO_ORG_GROUP[trimmed]

  for (const candidate of extractCandidates(trimmed)) {
    if (TEAM_TO_ORG_GROUP[candidate]) return TEAM_TO_ORG_GROUP[candidate]
  }

  return '기타'
}
