import { describe, expect, it } from 'vitest'
import { selectApp } from './appSelection'

describe('selectApp', () => {
  it.each([
    ['', 'landing'],
    ['?portal=cci', 'cci'],
    ['?portal=retailer', 'retailer'],
    ['?portal=connection', 'connection'],
    ['?portal=connect', 'connection'],
    ['?portal=onboarding', 'onboarding'],
    ['?portal=unknown', 'landing'],
  ])('selects the correct app for %s', (search, expected) => {
    expect(selectApp(search)).toBe(expected)
  })

  it('keeps the legacy scanner override authoritative', () => {
    expect(selectApp('?portal=cci', true)).toBe('legacy')
  })
})
