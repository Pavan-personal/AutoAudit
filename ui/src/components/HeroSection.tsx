import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ArrowRight, Zap, Shield, Bot, Github, Star, GitFork } from 'lucide-react';
import heroBg from '@/assets/hero-bg.jpg';

const BACKEND_URL = import.meta.env.VITE_API_URL || "https://autoauditserver.vercel.app";

const HeroSection = () => {
  const heroRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);
  const statsRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

      tl.fromTo(
        '.hero-badge',
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.6 }
      )
        .fromTo(
          titleRef.current,
          { opacity: 0, y: 40 },
          { opacity: 1, y: 0, duration: 0.8 },
          '-=0.3'
        )
        .fromTo(
          subtitleRef.current,
          { opacity: 0, y: 30 },
          { opacity: 1, y: 0, duration: 0.6 },
          '-=0.4'
        )
        .fromTo(
          ctaRef.current?.children || [],
          { opacity: 0, y: 20 },
          { opacity: 1, y: 0, duration: 0.5, stagger: 0.1 },
          '-=0.3'
        )
        .fromTo(
          statsRef.current?.children || [],
          { opacity: 0, y: 20 },
          { opacity: 1, y: 0, duration: 0.5, stagger: 0.1 },
          '-=0.2'
        )
        .fromTo(
          terminalRef.current,
          { opacity: 0, scale: 0.95, y: 40 },
          { opacity: 1, scale: 1, y: 0, duration: 0.8 },
          '-=0.4'
        );

      // Floating animation for terminal
      gsap.to(terminalRef.current, {
        y: -10,
        duration: 3,
        repeat: -1,
        yoyo: true,
        ease: 'power1.inOut',
      });
    }, heroRef);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={heroRef}
      className="relative min-h-screen flex items-center justify-center pt-20 overflow-hidden"
    >
      {/* Hero Background Image */}
      <div className="absolute inset-0 z-0">
        <img src={heroBg} alt="" className="w-full h-full object-cover opacity-40" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/60 to-background" />
      </div>
      
      {/* Background Effects */}
      <div className="absolute inset-0 grid-pattern opacity-20" />
      <div className="absolute inset-0 radial-gradient-overlay" />
      
      {/* Animated orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-pulse-subtle" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-accent/10 rounded-full blur-3xl animate-pulse-subtle animation-delay-400" />


      <div className="container-custom relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          {/* Left Content */}
          <div className="text-center lg:text-left">
            {/* Badge */}
            <div className="hero-badge inline-flex items-center gap-2 mb-8">
              <span className="badge-primary">
                <Zap className="w-3 h-3" />
                Now with AI-Powered Automation
              </span>
            </div>

            {/* Title */}
            <h1 ref={titleRef} className="heading-xl mb-6">
              <span className="text-foreground">Automate Your</span>
              <br />
              <span className="text-gradient-primary">GitHub Workflow</span>
              <br />
              <span className="text-foreground">End-to-End</span>
            </h1>

            {/* Subtitle */}
            <p ref={subtitleRef} className="body-lg max-w-xl mx-auto lg:mx-0 mb-10">
              Deep codebase scanning, intelligent issue assignment, and AI-powered fixes. 
              AutoAudit transforms how developers and maintainers ship quality code.
            </p>

            {/* CTA Buttons */}
            <div ref={ctaRef} className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start mb-12">
              <button 
                onClick={() => window.location.href = `${BACKEND_URL}/auth/github`}
                className="btn-primary text-base"
              >
                Get Started
                <ArrowRight className="w-5 h-5" />
              </button>
              <a
                href="https://github.com/Pavan-personal/AutoAudit"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary text-base"
              >
                <Github className="w-5 h-5" />
                View on GitHub
              </a>
            </div>

            {/* Stats */}
            <div ref={statsRef} className="flex flex-wrap gap-8 justify-center lg:justify-start">
              <div className="flex items-center gap-2">
                <Star className="w-5 h-5 text-primary" />
                <span className="text-foreground font-semibold">2.4k</span>
                <span className="text-muted-foreground">Stars</span>
              </div>
              <div className="flex items-center gap-2">
                <GitFork className="w-5 h-5 text-primary" />
                <span className="text-foreground font-semibold">480+</span>
                <span className="text-muted-foreground">Forks</span>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" />
                <span className="text-foreground font-semibold">10k+</span>
                <span className="text-muted-foreground">Issues Fixed</span>
              </div>
            </div>
          </div>

          {/* Right Content - Terminal Preview */}
          <div ref={terminalRef} className="relative">
            <div className="terminal-window animated-border">
              <div className="terminal-header">
                <div className="terminal-dot bg-destructive/80" />
                <div className="terminal-dot bg-yellow-500/80" />
                <div className="terminal-dot bg-green-500/80" />
                <span className="ml-4 text-xs text-muted-foreground font-mono">autoaudit scan --deep</span>
              </div>
              <div className="terminal-body">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-primary">$</span>
                    <span className="code-function">autoaudit</span>
                    <span className="code-variable">scan</span>
                    <span className="text-muted-foreground">--deep --ai</span>
                  </div>
                  <div className="text-muted-foreground">
                    <span className="code-comment"># Initializing deep scan with Oumi AI...</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Bot className="w-4 h-4 text-primary animate-pulse" />
                    <span className="text-foreground">Analyzing 1,247 files across 38 modules</span>
                  </div>
                  <div className="pl-6 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-green-400">✓</span>
                      <span className="text-muted-foreground">Security vulnerabilities: <span className="text-destructive">3 critical</span></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-green-400">✓</span>
                      <span className="text-muted-foreground">Performance issues: <span className="text-yellow-400">7 warnings</span></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-green-400">✓</span>
                      <span className="text-muted-foreground">Code quality: <span className="text-primary">12 suggestions</span></span>
                    </div>
                  </div>
                  <div className="pt-2 flex items-center gap-2">
                    <span className="text-primary">→</span>
                    <span className="text-foreground">Creating issues automatically...</span>
                    <span className="inline-block w-2 h-4 bg-primary animate-blink" />
                  </div>
                </div>
              </div>
            </div>

            {/* Floating badges */}
            <div className="absolute -top-4 -right-4 glass-card px-4 py-2 animate-float">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-green-400" />
                <span className="text-sm font-medium text-foreground">Security First</span>
              </div>
            </div>
            <div className="absolute -bottom-4 -left-4 glass-card px-4 py-2 animate-float animation-delay-200">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium text-foreground">10x Faster</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Scroll Indicator */}
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2">
        <div className="scroll-indicator" />
      </div>
    </section>
  );
};

export default HeroSection;
