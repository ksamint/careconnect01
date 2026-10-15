// Run against an isolated seeded server; Playwright must be installed on the test host.
// NODE_PATH=$(npm root -g) CARECONNECT_TEST_PASSWORD=... node h5/tests/mobile-date-inputs.cjs
// Desktop WebKit checks the layout contract; actual iPhone/WeChat still needs device verification.
const assert = require('node:assert/strict')
const { chromium, webkit } = require('playwright')
const base = process.env.CARECONNECT_BASE || 'http://127.0.0.1:18887'
const password = process.env.CARECONNECT_TEST_PASSWORD
assert.ok(password, 'Set CARECONNECT_TEST_PASSWORD for the test staff account')

async function checkBounds(page, expectedHeight) {
  const fields = page.locator('input[type=date],input[type=time]')
  assert.ok(await fields.count(), 'Page must contain a date/time input')
  for (const input of await fields.all()) {
    const metrics = await input.evaluate(e => {
      const r = e.getBoundingClientRect(), box = e.parentElement.getBoundingClientRect()
      const style = getComputedStyle(e)
      return { width: r.width, right: r.right, boxRight: box.right, height: box.height,
        padding: parseFloat(style.paddingLeft) + parseFloat(style.paddingRight),
        internalOverflow: e.scrollWidth > e.clientWidth + 1 }
    })
    assert.ok(metrics.width > 40 && metrics.right <= metrics.boxRight + 1, 'Date input must fit its field')
    assert.equal(metrics.height, expectedHeight, 'Empty/filled field must retain its height')
    assert.equal(metrics.padding, 0, 'Native input must avoid the iOS padded-width bug')
    assert.equal(metrics.internalOverflow, false, 'Date text must fit the field')
  }
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'No page overflow')
}

;(async () => {
  for (const engine of [webkit, chromium]) {
    const browser = await engine.launch(engine === webkit && process.env.WEBKIT_EXECUTABLE
      ? { executablePath: process.env.WEBKIT_EXECUTABLE } : {})
    try {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
      await context.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//, r => r.abort())
      const page = await context.newPage()
      await page.goto(base + '/patient/register')
      await page.locator('#birthday').waitFor()
      for (const width of [320, 375, 390, 414, 844]) {
        await page.setViewportSize({ width, height: 844 })
        for (const value of ['', '1980-02-29']) {
          await page.locator('#birthday').fill(value)
          await checkBounds(page, 52)
          const ref = await page.locator('#phone').boundingBox()
          const date = await page.locator('#birthday').evaluate(e => e.parentElement.getBoundingClientRect().toJSON())
          assert.equal(date.width, ref.width, 'Birthday field must align with phone field')
        }
      }
      await page.locator('#birthday').fill('1800-01-01')
      assert.equal(await page.locator('#birthday').evaluate(e => e.validity.rangeUnderflow), true)
      await page.locator('#birthday').fill('2999-01-01')
      assert.equal(await page.locator('#birthday').evaluate(e => e.validity.rangeOverflow), true)
      await page.locator('#birthday').fill('')
      assert.equal(await page.locator('#birthday').evaluate(e => e.validity.valueMissing), true)
      await page.locator('#birthday').fill('1980-02-29')
      assert.equal(await page.locator('#birthday').inputValue(), '1980-02-29')
      await page.locator('#birthday').locator('..').click({ position: { x: 5, y: 5 } })
      assert.equal(await page.evaluate(() => document.activeElement.id), 'birthday', 'Entire labelled field must activate the native input')
      await page.locator('#phone').fill('19900000000')
      await page.locator('#patient-name').fill('布局验证（不会登记）')
      await page.getByRole('checkbox').check()
      let registration
      await page.route('**/api/patient-registration', route => {
        if (route.request().method() !== 'POST') return route.continue()
        registration = route.request().postDataJSON()
        return route.fulfill({ status: 400, json: { error: 'invalid_name' } })
      })
      await page.getByRole('button', { name: '创建账号并进入问卷', exact: true }).click()
      await page.getByRole('alert').waitFor()
      assert.equal(registration.birthday, '1980-02-29', 'Controlled date must reach the submission body')
      await page.locator('h1').click()
      await page.screenshot({ path: `/tmp/careconnect-date-${engine.name()}.png`, fullPage: true })
      await page.goto(base + '/login')
      await page.locator('#username').fill(process.env.CARECONNECT_TEST_USER || 'admin')
      await page.locator('#password').fill(password)
      await page.getByRole('button', { name: '登录', exact: true }).click()
      await page.waitForURL(url => url.pathname !== '/login')
      for (const path of ['/clinical/enroll', '/clinical/patient/DEMO-001/crf',
        '/clinical/patient/DEMO-001/entry?cycle=1&visit=T0', '/admin/study']) {
        await page.goto(base + path)
        await page.locator('input[type=date]').first().waitFor()
        for (const width of [320, 375, 390, 414, 844]) {
          await page.setViewportSize({ width, height: 844 })
          for (const input of await page.locator('input[type=date],input[type=time]').all()) {
            for (const value of ['', await input.getAttribute('type') === 'time' ? '10:30' : '2026-10-15']) {
              await input.fill(value)
              await checkBounds(page, 44)
            }
          }
        }
      }
      await page.evaluate(() => fetch('/api/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }))
      console.log(`${engine.name()}: registration + all shared date/time routes, empty/filled, 5 widths, native validation passed`)
    } finally { await browser.close() }
  }
})().catch(error => { console.error(error); process.exitCode = 1 })
