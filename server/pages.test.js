// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { loginPage, parseForm } from './pages.js'

describe('loginPage', () => {
  it('renders the form, surfaces the message, and disables itself unprovisioned', () => {
    const page = loginPage()
    expect(page).toMatch(/action="\/api\/login"/)
    expect(page).toMatch(/name="user"/)
    expect(page).toMatch(/name="pass"/)
    expect(page).not.toMatch(/disabled/)

    expect(loginPage({ message: 'Wrong password.' })).toMatch(/Wrong password\./)
    expect(loginPage({ message: '' })).not.toMatch(/<p class="notice">/)

    // A half-provisioned server says so and refuses to pretend a login could work.
    const locked = loginPage({ configured: false })
    expect(locked).toMatch(/No credentials configured/)
    expect(locked).toMatch(/disabled/)
  })
})

describe('parseForm', () => {
  it('decodes a urlencoded body into a bag', () => {
    expect(parseForm('user=admin&pass=a%26b')).toEqual({ user: 'admin', pass: 'a&b' })
    expect(parseForm('')).toEqual({})
    expect(parseForm(undefined)).toEqual({})
  })
})
