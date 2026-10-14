import { describe, expect, it } from 'vitest'
import {
  CCI_PRESENTATION_PASSWORD,
  CCI_PRESENTATION_USERNAME,
  isCciPresentationCredentials,
  presentationCciData,
  presentationCciNetwork,
  presentationCciProductDetail,
  presentationCciStoreDetail,
} from './presentationCci'

describe('CCI presentation data', () => {
  it('recognizes only the dedicated account credentials', () => {
    expect(isCciPresentationCredentials({ username: CCI_PRESENTATION_USERNAME, password: CCI_PRESENTATION_PASSWORD })).toBe(true)
    expect(isCciPresentationCredentials({ username: CCI_PRESENTATION_USERNAME.toUpperCase(), password: CCI_PRESENTATION_PASSWORD })).toBe(true)
    expect(isCciPresentationCredentials({ username: CCI_PRESENTATION_USERNAME, password: 'wrong' })).toBe(false)
  })

  it('provides consistent network, store, and product intelligence', () => {
    const data = presentationCciData()
    const network = presentationCciNetwork(30)
    const store = presentationCciStoreDetail(network.stores[0], 30)
    const product = presentationCciProductDetail(network.products[0].productName, 30)

    expect(data.totalBaskets).toBeGreaterThan(0)
    expect(network.overview.storesReporting).toBe(network.stores.length)
    expect(network.trend).toHaveLength(30)
    expect(store.storeName).toBe(network.stores[0].externalStoreId)
    expect(store.topProducts.length).toBeGreaterThan(0)
    expect(product.product).toBe(network.products[0].productName)
    expect(product.storeDistribution.length).toBeGreaterThan(0)
  })
})
