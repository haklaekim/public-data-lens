// 컨시어지 표면 베이스라인(ADR-001 — WarningPanel 통합 범위에 포함) — all 빌드.
// 라이브 LLM 호출 금지: 스트림은 합성 SSE 픽스처(stub.js)로 응답한다.
import { test, expect } from '@playwright/test'
import { stubApi, shoot } from './stub.js'

test.beforeEach(async ({ page }) => {
  await stubApi(page)
  await page.goto('/')
  await page.locator('.nav-link', { hasText: 'AI 컨시어지' }).click()
})

test('컨시어지 — 초기 화면', async ({ page }) => {
  await expect(page.locator('main')).toContainText('어떤 분석이나 서비스를')
  await expect(page.locator('main')).toContainText('오늘 0/50회')
  await shoot(page, 'concierge-idle.png')
})

test('컨시어지 — 결과 대시보드(스텁 응답)', async ({ page }) => {
  await page.locator('main .searchbar input').fill('폭염 취약 지역을 분석하고 싶다')
  await page.locator('main .searchbar button[type=submit]').click()
  // 결정화 단계: 수동 모드면 '분석 결과 보기' 버튼을 눌러 전환한다
  const reveal = page.locator('button', { hasText: '분석 결과 보기' })
  try {
    await reveal.click({ timeout: 5_000 })
  } catch {
    /* 자동 전환 모드 — 버튼이 없거나 이미 전환됨 */
  }
  await expect(page.locator('main')).toContainText('활용 계획', { timeout: 15_000 })
  await shoot(page, 'concierge-dashboard.png')
})
