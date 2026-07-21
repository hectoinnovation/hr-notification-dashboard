import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

// AI 활용 방법 관리자 전용 — 등록 화면에서 URL을 입력하면 Open Graph 메타데이터를
// 자동으로 가져오기 위한 서버사이드 fetch. 브라우저에서 임의 외부 사이트를 직접
// fetch하면 대부분 CORS에 막히기 때문에 서버를 경유한다.
// proxy.ts에서 이 경로 전체를 관리자 세션으로만 접근 가능하도록 게이트한다
// (인증되지 않은 임의 호출로 인한 SSRF 오남용을 관리자로 제한).

const FETCH_TIMEOUT_MS = 8000

function extractMetaContent(html: string, key: string): string | null {
  // property="og:title" content="..." 또는 content="..." property="og:title" 둘 다 대응
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`, 'i'),
  ]
  for (const re of patterns) {
    const m = html.match(re)
    if (m) return m[1]
  }
  return null
}

function extractFavicon(html: string, baseUrl: string): string | null {
  const patterns = [
    /<link[^>]+rel=["'](?:shortcut icon|icon)["'][^>]*href=["']([^"']*)["']/i,
    /<link[^>]+href=["']([^"']*)["'][^>]*rel=["'](?:shortcut icon|icon)["']/i,
  ]
  for (const re of patterns) {
    const m = html.match(re)
    if (m) {
      try { return new URL(m[1], baseUrl).toString() } catch { /* ignore invalid href */ }
    }
  }
  try { return new URL('/favicon.ico', baseUrl).toString() } catch { return null }
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
}

export async function POST(req: NextRequest) {
  let url: string
  try {
    const body = await req.json()
    url = String(body.url ?? '').trim()
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })
  }

  if (!url) return NextResponse.json({ error: 'URL이 필요합니다.' }, { status: 400 })

  let parsed: URL
  try {
    parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('unsupported protocol')
  } catch {
    return NextResponse.json({ error: '유효한 URL이 아닙니다.' }, { status: 400 })
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const res = await fetch(parsed.toString(), {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AI-Hackathon-Bot/1.0)' },
    })
    clearTimeout(timeout)

    if (!res.ok) {
      return NextResponse.json({ error: `페이지를 불러오지 못했습니다. (HTTP ${res.status})` }, { status: 502 })
    }

    const html = await res.text()
    const finalUrl = res.url || parsed.toString()

    const rawTitle = extractMetaContent(html, 'og:title') ?? html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? null
    const rawDescription = extractMetaContent(html, 'og:description') ?? extractMetaContent(html, 'description')
    const rawImage = extractMetaContent(html, 'og:image')

    const title = rawTitle ? decodeHtmlEntities(rawTitle).trim() : null
    const description = rawDescription ? decodeHtmlEntities(rawDescription).trim() : null
    let image: string | null = null
    if (rawImage) {
      try { image = new URL(rawImage, finalUrl).toString() } catch { image = null }
    }
    const favicon = extractFavicon(html, finalUrl)

    return NextResponse.json({ title, description, image, favicon })
  } catch (e) {
    clearTimeout(timeout)
    const message = e instanceof Error && e.name === 'AbortError' ? '요청 시간이 초과되었습니다.' : '메타데이터를 가져오지 못했습니다.'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
