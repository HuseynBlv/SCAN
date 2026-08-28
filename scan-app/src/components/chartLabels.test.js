import { describe, expect, it } from 'vitest'
import { compactChartLabel } from './chartLabels'

describe('compactChartLabel', () => {
  it('shortens long product names without changing short labels', () => {
    expect(compactChartLabel('SWEET HOME FALQA ALUMIN 10M')).toBe('SWEET HOME FALQA…')
    expect(compactChartLabel('Şirniyyat')).toBe('Şirniyyat')
  })
})
