import Navbar from '@/components/Navbar';
import HeroSection from '@/components/HeroSection';
import FeaturesSection from '@/components/FeaturesSection';
import HowItWorksSection from '@/components/HowItWorksSection';
import IntegrationsSection from '@/components/IntegrationsSection';
import DashboardPreview from '@/components/DashboardPreview';
import CTASection from '@/components/CTASection';
import Footer from '@/components/Footer';

const Index = () => {
  return (
    <main className="min-h-screen bg-background overflow-x-hidden">
      <Navbar />
      <HeroSection />
      <FeaturesSection />
      <HowItWorksSection />
      <DashboardPreview />
      <IntegrationsSection />
      <CTASection />
      <Footer />
    </main>
  );
};

export default Index;
