import { redirect } from 'next/navigation'

// 대시보드 메뉴가 제거되어 관리자 기본 화면은 전체 과제(/admin/tasks)다.
// 이 리다이렉트는 과거 링크/북마크로 들어오는 /admin 요청을 위한 것.
export default function AdminIndexPage() {
  redirect('/admin/tasks')
}
