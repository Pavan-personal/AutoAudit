import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ArrowRight, Github, Rocket } from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

const CTASection = () => {
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        '.cta-content',
        { opacity: 0, y: 50 },
        {
          opacity: 1,
          y: 0,
          duration: 0.8,
          scrollTrigger: {
            trigger: '.cta-content',
            start: 'top 80%',
          }
        }
      );
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section ref={sectionRef} className="section-padding relative overflow-hidden">
      {/* Background Effects - Using primary/accent colors only */}
      <div className="absolute inset-0 grid-pattern opacity-20" />
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/15 rounded-full blur-3xl" />
      <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-accent/15 rounded-full blur-3xl" />
      
      <div className="container-custom relative z-10">
        <div className="cta-content glass-card p-12 lg:p-20 text-center max-w-4xl mx-auto animated-border">
          <div className="inline-flex items-center gap-2 mb-8">
            <Rocket className="w-5 h-5 text-primary" />
            <span className="text-sm font-medium text-primary">Ready to automate?</span>
          </div>
          
          <h2 className="heading-lg mb-6">
            <span className="text-foreground">Stop Managing Issues.</span>
            <br />
            <span className="text-gradient-primary">Start Shipping Code.</span>
          </h2>
          
          <p className="body-lg max-w-2xl mx-auto mb-10">
            Automate your entire GitHub workflow from issue detection to merged PRs. 
            Built for developers who value their time.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button className="btn-primary text-lg py-5 px-10">
              Get Started
              <ArrowRight className="w-5 h-5" />
            </button>
            <button className="btn-secondary text-lg py-5 px-10">
              <Github className="w-5 h-5" />
              View on GitHub
            </button>
          </div>
          
          <div className="mt-10 flex items-center justify-center gap-8 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              Open Source
            </span>
            <span className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
              Free to Start
            </span>
            <span className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
              MIT License
            </span>
          </div>
        </div>
      </div>
    </section>
  );
};

export default CTASection;
