import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import AppErrorBoundary from './AppErrorBoundary'

function BrokenPage() {
  throw new Error('lazy chunk failed')
}

describe('AppErrorBoundary', () => {
  it('replaces an application crash with a recoverable error screen', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <AppErrorBoundary>
        <BrokenPage />
      </AppErrorBoundary>,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('SCAN could not load this page.')
    expect(screen.getByRole('button', { name: 'Reload SCAN' })).toBeInTheDocument()
    consoleError.mockRestore()
  })
})
