import LandingNavigation from './LandingNavigation'
import {
  AudienceSection,
  CapabilityStrip,
  EnterpriseSection,
  FinalCTA,
  HeroSection,
  HowItWorksSection,
  LandingFooter,
  RetailerSection,
  TransactionFlowSection,
} from './LandingSections'
import { IntelligenceShowcase } from './LandingVisuals'
import './LandingPage.css'

export default function LandingPage() {
  return (
    <div className="scan-landing">
      <LandingNavigation />
      <main>
        <HeroSection />
        <TransactionFlowSection />
        <AudienceSection />
        <IntelligenceShowcase />
        <HowItWorksSection />
        <RetailerSection />
        <EnterpriseSection />
        <CapabilityStrip />
        <FinalCTA />
      </main>
      <LandingFooter />
    </div>
  )
}
