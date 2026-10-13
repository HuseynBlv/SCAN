import { describe, expect, it } from 'vitest'
import {
  isPresentationCredentials,
  presentationEngagement,
  presentationOverview,
} from './presentationRetailer'

describe('presentationRetailer', () => {
  it('recognizes only the published presentation credentials', () => {
    expect(isPresentationCredentials({ username: 'scan-showcase', password: 'Showcase2026!' })).toBe(true)
    expect(isPresentationCredentials({ username: 'SCAN-SHOWCASE', password: 'Showcase2026!' })).toBe(true)
    expect(isPresentationCredentials({ username: 'scan-showcase', password: 'wrong' })).toBe(false)
  })

  it('provides a rich, internally consistent presentation dataset', () => {
    const overview = presentationOverview('LAST_30_DAYS')
    const engagement = presentationEngagement()

    expect(overview.retailerCode).toBe('PRESENTATION')
    expect(overview.topProducts).toHaveLength(8)
    expect(overview.dailySales).toHaveLength(30)
    expect(overview.sync.errors).toEqual([])
    expect(engagement.offers.available).toHaveLength(3)
    expect(engagement.actions).toHaveLength(3)
    expect(engagement.partnerStatus.level).toBe('GOLD')
  })
})
