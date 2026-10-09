import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import LandingPage from './LandingPage'

describe('LandingPage', () => {
  it('reuses the existing authentication routes for every conversion action', () => {
    render(<LandingPage />)

    screen.getAllByRole('link', { name: 'Sign in' }).forEach((link) => {
      expect(link).toHaveAttribute('href', '/?portal=cci')
    })
    screen.getAllByRole('link', { name: /Get started$/ }).forEach((link) => {
      expect(link).toHaveAttribute('href', '/?portal=retailer')
    })
    expect(screen.getByRole('link', { name: /Get started as a retailer/ })).toHaveAttribute('href', '/?portal=retailer')
    expect(screen.getByRole('link', { name: /Request enterprise access/ })).toHaveAttribute('href', '/?portal=cci')
  })

  it('connects section navigation to real landing page targets', () => {
    render(<LandingPage />)

    expect(screen.getAllByRole('link', { name: 'Platform' })[0]).toHaveAttribute('href', '#platform')
    expect(screen.getAllByRole('link', { name: 'For Retailers' })[0]).toHaveAttribute('href', '#retailers')
    expect(screen.getAllByRole('link', { name: 'For Enterprise' })[0]).toHaveAttribute('href', '#enterprise')
    expect(screen.getAllByRole('link', { name: 'How It Works' })[0]).toHaveAttribute('href', '#how-it-works')
    expect(screen.getByRole('link', { name: /Explore SCAN/ })).toHaveAttribute('href', '#platform')
  })

  it('switches the intelligence visualization with accessible tabs', async () => {
    const user = userEvent.setup()
    render(<LandingPage />)

    const promotionTab = screen.getByRole('tab', { name: /Promotion Analytics/ })
    await user.click(promotionTab)

    expect(promotionTab).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('Promotion Analytics')
    expect(screen.getByRole('heading', { name: 'Plan what to measure.' })).toBeInTheDocument()
  })

  it('supports standard keyboard navigation across intelligence tabs', async () => {
    const user = userEvent.setup()
    render(<LandingPage />)

    const basketTab = screen.getByRole('tab', { name: 'Basket Intelligence' })
    basketTab.focus()
    await user.keyboard('{ArrowRight}')

    const productTab = screen.getByRole('tab', { name: 'Product Performance' })
    await waitFor(() => expect(productTab).toHaveFocus())
    expect(productTab).toHaveAttribute('aria-selected', 'true')

    await user.keyboard('{End}')
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Demand Patterns' })).toHaveFocus())
  })

  it('supports reverse, wraparound, and Home keyboard navigation across intelligence tabs', async () => {
    const user = userEvent.setup()
    render(<LandingPage />)

    const basketTab = screen.getByRole('tab', { name: 'Basket Intelligence' })
    basketTab.focus()
    await user.keyboard('{ArrowLeft}')

    const demandTab = screen.getByRole('tab', { name: 'Demand Patterns' })
    await waitFor(() => expect(demandTab).toHaveFocus())
    expect(demandTab).toHaveAttribute('aria-selected', 'true')

    await user.keyboard('{Home}')
    await waitFor(() => expect(basketTab).toHaveFocus())
    expect(basketTab).toHaveAttribute('aria-selected', 'true')

    await user.keyboard('{ArrowDown}')
    expect(basketTab).toHaveFocus()
    expect(basketTab).toHaveAttribute('aria-selected', 'true')
  })

  it('renders the regional concept when its tab is selected', async () => {
    const user = userEvent.setup()
    render(<LandingPage />)

    await user.click(screen.getByRole('tab', { name: 'Regional Insights' }))

    expect(screen.getByRole('heading', { name: 'Compare behavior by district.' })).toBeInTheDocument()
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('Regional Insights')
  })

  it('exposes an accessible mobile navigation toggle', async () => {
    const user = userEvent.setup()
    render(<LandingPage />)

    const menuButton = screen.getByRole('button', { name: 'Open navigation menu' })
    expect(screen.getAllByRole('link', { name: 'Platform' })).toHaveLength(2)
    await user.click(menuButton)
    const closeButton = screen.getByRole('button', { name: 'Close navigation menu' })
    expect(closeButton).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getAllByRole('link', { name: 'Platform' })).toHaveLength(3)

    await user.click(closeButton)
    expect(screen.getByRole('button', { name: 'Open navigation menu' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes the mobile menu with Escape and restores focus to the toggle', async () => {
    const user = userEvent.setup()
    render(<LandingPage />)

    const menuButton = screen.getByRole('button', { name: 'Open navigation menu' })
    await user.click(menuButton)
    const mobileMenu = document.getElementById('landing-mobile-menu')
    const mobilePlatformLink = within(mobileMenu).getByRole('link', { name: 'Platform' })
    mobilePlatformLink.focus()
    await user.keyboard('{Escape}')

    const closedMenuButton = screen.getByRole('button', { name: 'Open navigation menu' })
    expect(closedMenuButton).toHaveAttribute('aria-expanded', 'false')
    expect(closedMenuButton).toHaveFocus()
  })

  it('closes the mobile menu after following a section link', async () => {
    const user = userEvent.setup()
    render(<LandingPage />)

    await user.click(screen.getByRole('button', { name: 'Open navigation menu' }))
    const mobileMenu = document.getElementById('landing-mobile-menu')
    await user.click(within(mobileMenu).getByRole('link', { name: 'Platform' }))

    expect(screen.getByRole('button', { name: 'Open navigation menu' })).toHaveAttribute('aria-expanded', 'false')
  })
})
