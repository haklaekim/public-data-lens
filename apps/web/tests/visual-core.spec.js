// 코어 표면(VITE_SURFACE=core) 시각 베이스라인 — 런북 STEP 1 대상 9화면.
// 모든 화면은 DOM 스모크(구성 검증)를 항상 수행하고, 스크린샷 대조는 SKIP_VISUAL이 아닐 때만.
import { test, expect } from '@playwright/test'
import { stubApi, shoot, CARD_TITLE } from './stub.js'

test.beforeEach(async ({ page }) => {
  await stubApi(page)
  await page.goto('/')
  await expect(page.locator('.brand h1')).toHaveText('공공데이터 렌즈')
})

async function searchFor(page, text) {
  await page.locator('.search-shell input').fill(text)
  await page.locator('.searchbar button[type=submit]').click()
  await expect(page.locator('.card-row').first()).toBeVisible()
}

test('홈 — 검색 첫 화면(pristine)', async ({ page }) => {
  await expect(page.locator('.hero-title')).toContainText('근거와 함께')
  await expect(page.locator('.examples .chip').first()).toBeVisible()
  await expect(page.locator('.card-row')).toHaveCount(0) // 랜딩은 결과를 숨긴다
  await shoot(page, 'home.png')
})

test('검색 결과 — 어린이 보호구역', async ({ page }) => {
  await searchFor(page, '어린이 보호구역')
  await expect(page.locator('.toolbar .result-meta')).toContainText('총')
  await shoot(page, 'search-results.png')
})

test('컬럼 검색 결과 — 위도, 경도', async ({ page }) => {
  await page.locator('.seg button', { hasText: '컬럼' }).click()
  await page.locator('.search-shell input').fill('위도, 경도')
  await page.locator('.searchbar button[type=submit]').click()
  await expect(page.locator('.matched-columns').first()).toBeVisible()
  await expect(page.locator('.toolbar .result-meta')).toContainText('구조가 관측된')
  await shoot(page, 'search-columns.png')
})

test('데이터셋 프로필 — card 탭', async ({ page }) => {
  await searchFor(page, '어린이 보호구역')
  await page.locator('.card-title-line strong', { hasText: CARD_TITLE }).first().click()
  await expect(page.locator('.profile h2')).toContainText(CARD_TITLE)
  await shoot(page, 'profile-card.png')
})

test('데이터셋 프로필 — structure 탭', async ({ page }) => {
  await searchFor(page, '어린이 보호구역')
  await page.locator('.card-title-line strong', { hasText: CARD_TITLE }).first().click()
  await page.locator('.drawer-tabs .tab', { hasText: '데이터 구조' }).click()
  await expect(page.locator('.structure-table').first()).toBeVisible()
  await shoot(page, 'profile-structure.png')
})

test('비교 — 2건 선택', async ({ page }) => {
  await searchFor(page, '어린이 보호구역')
  const checks = page.locator('.compare-check input')
  await checks.nth(0).check()
  await checks.nth(1).check()
  await expect(page.locator('.compare-bar')).toContainText('2개 선택')
  await page.locator('.cb-go').click()
  await expect(page.locator('.compare-table')).toBeVisible()
  await shoot(page, 'compare.png')
})

test('변경 이력', async ({ page }) => {
  await page.locator('.nav-link', { hasText: '변경 이력' }).click()
  await expect(page.locator('main')).toContainText('변경') // 빈 기준 스냅샷 상태도 정상 화면
  await shoot(page, 'changes.png')
})

test('소개', async ({ page }) => {
  await page.locator('.nav-link', { hasText: '소개' }).click()
  await expect(page.locator('.stat-tiles .stat-tile').first()).toBeVisible()
  await expect(page.locator('.theme-bars')).toBeVisible()
  await shoot(page, 'about.png')
})

test('AI에 연결', async ({ page }) => {
  await page.locator('.mcp-cta').click()
  await expect(page.locator('.connect h2')).toContainText('대화로')
  await expect(page.locator('.mcp-url code')).toContainText('/projects/public-data-lens/mcp')
  await shoot(page, 'connect.png')
})
