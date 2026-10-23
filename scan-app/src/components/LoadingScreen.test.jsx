import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import LoadingScreen, { TimedLoadingScreen } from './LoadingScreen'

describe('LoadingScreen', () => {
  it('renders the branded intelligence network as an initial busy state', () => {
    const { container } = render(<LoadingScreen />)

    expect(screen.getByLabelText('SCAN')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Preparing SCAN')
    expect(screen.getByRole('status')).toHaveTextContent('Connecting basket signals')
    expect(container.querySelector('.scan-intelligence-loader')).toHaveAttribute('aria-busy', 'true')
    expect(container.querySelector('.scan-intelligence-network')).toHaveAttribute('aria-hidden', 'true')
    expect(container.querySelectorAll('.scan-network-pulses circle')).toHaveLength(3)
  })

  it('provides a retry action when initialization fails', () => {
    const onRetry = vi.fn()
    render(<LoadingScreen error message="The application files may have changed during a deployment." onRetry={onRetry} />)

    expect(screen.getByRole('alert')).toHaveTextContent('SCAN could not load this page')
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading SCAN' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('keeps the loader visible for the requested minimum duration', () => {
    vi.useFakeTimers()
    const onComplete = vi.fn()

    render(<TimedLoadingScreen duration={1200} message="Loading presentation intelligence" onComplete={onComplete} />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading presentation intelligence')

    act(() => vi.advanceTimersByTime(1199))
    expect(onComplete).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(onComplete).toHaveBeenCalledOnce()
    vi.useRealTimers()
  })
})
