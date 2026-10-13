import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import LandingPage from './LandingPage'

describe('LandingPage', () => {
  it('renders exactly the five scoped main sections', () => {
    const { container } = render(<LandingPage />)

    expect(container.querySelectorAll('main > section')).toHaveLength(5)
    expect(screen.getByRole('heading', { name: 'See what actually happens inside the basket.' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /From transactions.*to decisions\./ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /One platform.*Two perspectives\./ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Connect. Analyze. Act.' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Every transaction.*contains intelligence\./ })).toBeInTheDocument()
  })

  it('reuses the existing authentication routes for every conversion action', () => {
    render(<LandingPage />)

    screen.getAllByRole('link', { name: 'Sign in' }).forEach((link) => {
      expect(link).toHaveAttribute('href', '/?portal=cci')
    })
    screen.getAllByRole('link', { name: 'Get started' }).forEach((link) => {
      expect(link).toHaveAttribute('href', '/?portal=retailer')
    })
  })

  it('connects navigation to the compact landing page targets', () => {
    render(<LandingPage />)

    expect(screen.getAllByRole('link', { name: 'Intelligence' })[0]).toHaveAttribute('href', '#transaction-intelligence')
    expect(screen.getAllByRole('link', { name: 'Perspectives' })[0]).toHaveAttribute('href', '#platform')
    expect(screen.getAllByRole('link', { name: 'How It Works' })[0]).toHaveAttribute('href', '#how-it-works')
    expect(screen.getByRole('link', { name: /See how it works/ })).toHaveAttribute('href', '#transaction-intelligence')
  })

  it('switches between retailer and enterprise perspectives', async () => {
    const user = userEvent.setup()
    render(<LandingPage />)

    const enterpriseTab = screen.getByRole('tab', { name: 'Enterprise' })
    await user.click(enterpriseTab)

    expect(enterpriseTab).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('Enterprise')
    expect(screen.getByRole('heading', { name: 'Understand the market.' })).toBeInTheDocument()
    expect(screen.getByLabelText('Enterprise intelligence preview')).toBeInTheDocument()
  })

  it('supports keyboard navigation between perspectives', async () => {
    const user = userEvent.setup()
    render(<LandingPage />)

    const retailerTab = screen.getByRole('tab', { name: 'Retailer' })
    retailerTab.focus()
    await user.keyboard('{ArrowRight}')

    const enterpriseTab = screen.getByRole('tab', { name: 'Enterprise' })
    await waitFor(() => expect(enterpriseTab).toHaveFocus())
    expect(enterpriseTab).toHaveAttribute('aria-selected', 'true')

    await user.keyboard('{Home}')
    await waitFor(() => expect(retailerTab).toHaveFocus())
  })

  it('connects a receipt item to its resulting insight', async () => {
    const user = userEvent.setup()
    render(<LandingPage />)

    const chips = screen.getByRole('button', { name: 'Chips, Paprika; highlight related insight' })
    await user.click(chips)

    expect(chips).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Bundle opportunity: Drink + snack; highlight related basket item' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('exposes an accessible mobile navigation toggle', async () => {
    const user = userEvent.setup()
    render(<LandingPage />)

    const menuButton = screen.getByRole('button', { name: 'Open navigation menu' })
    expect(screen.getAllByRole('link', { name: 'Intelligence' })).toHaveLength(2)
    await user.click(menuButton)
    const closeButton = screen.getByRole('button', { name: 'Close navigation menu' })
    expect(closeButton).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getAllByRole('link', { name: 'Intelligence' })).toHaveLength(3)

    await user.click(closeButton)
    expect(screen.getByRole('button', { name: 'Open navigation menu' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes the mobile menu with Escape and restores focus to the toggle', async () => {
    const user = userEvent.setup()
    render(<LandingPage />)

    const menuButton = screen.getByRole('button', { name: 'Open navigation menu' })
    await user.click(menuButton)
    const mobileMenu = document.getElementById('landing-mobile-menu')
    within(mobileMenu).getByRole('link', { name: 'Intelligence' }).focus()
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
    await user.click(within(mobileMenu).getByRole('link', { name: 'Perspectives' }))

    expect(screen.getByRole('button', { name: 'Open navigation menu' })).toHaveAttribute('aria-expanded', 'false')
  })
})
