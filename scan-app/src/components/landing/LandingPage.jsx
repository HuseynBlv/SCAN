import LandingNavigation from './LandingNavigation'
import {
  FinalCTA,
  HeroSection,
  HowItWorksSection,
  LandingFooter,
  PerspectivesSection,
  TransactionFlowSection,
} from './LandingSections'
import './LandingPage.css'

export default function LandingPage() {
  return (
    <div className="scan-landing">
      <LandingNavigation />
      <main>
        <HeroSection />
        <TransactionFlowSection />
        <PerspectivesSection />
        <HowItWorksSection />
        <FinalCTA />
      </main>
      <LandingFooter />
    </div>
  )
}
