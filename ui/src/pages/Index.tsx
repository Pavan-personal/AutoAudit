import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '@/components/Navbar';
import HeroSection from '@/components/HeroSection';
import FeaturesSection from '@/components/FeaturesSection';
import HowItWorksSection from '@/components/HowItWorksSection';
import IntegrationsSection from '@/components/IntegrationsSection';
import DashboardPreview from '@/components/DashboardPreview';
import CTASection from '@/components/CTASection';
import Footer from '@/components/Footer';

const Index = () => {
  const navigate = useNavigate();
  const [isChecking, setIsChecking] = useState(true);
  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

  useEffect(() => {
    async function checkAuth() {
      try {
        const response = await fetch(`${API_URL}/api/user`, {
          method: "GET",
          credentials: "include",
        });
        if (response.ok) {
          navigate("/repositories");
        }
      } catch {
        // User not logged in, stay on landing page
      } finally {
        setIsChecking(false);
      }
    }
    checkAuth();
  }, [API_URL, navigate]);

  if (isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

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
