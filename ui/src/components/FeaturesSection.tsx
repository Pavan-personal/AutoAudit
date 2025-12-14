import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { 
  Search, 
  UserCheck, 
  Bot, 
  Scan, 
  GitPullRequest, 
  MessageSquare,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  Settings2
} from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

const features = [
  {
    icon: Search,
    title: 'Deep Codebase Scanning',
    subtitle: 'Powered by Oumi',
    description: 'Ultra-customizable, AI-powered analysis that goes beyond surface-level linting. Detect security vulnerabilities, performance bottlenecks, and code smells with surgical precision.',
    highlights: [
      'Custom rule configuration',
      'Multi-language support',
      'Real-time scanning',
      'Priority-based issue tracking'
    ],
    badge: 'Core Feature',
    color: 'primary',
    visual: 'scan'
  },
  {
    icon: UserCheck,
    title: 'Smart Issue Assignment',
    subtitle: 'Context-Aware AI',
    description: 'Automatically assign issues based on contributor intent analysis. Analyze comments for approach explanations, match expertise, and streamline your contribution workflow.',
    highlights: [
      'Intent detection from comments',
      'Expertise-based matching',
      'Good-first-issue fast-track',
      'Auto-unassign inactive users'
    ],
    badge: 'Automation',
    color: 'accent',
    visual: 'assign'
  },
  {
    icon: Bot,
    title: 'AI PR Review',
    subtitle: 'Merge Readiness Score',
    description: 'Get instant merge readiness percentage for every PR. AI analyzes code quality, test coverage, security, and best practices to give you confidence before merging.',
    highlights: [
      'Merge readiness percentage',
      'Code quality analysis',
      'Security vulnerability detection',
      'Best practices validation'
    ],
    badge: 'AI Magic',
    color: 'primary',
    visual: 'fix'
  }
];

const FeaturesSection = () => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<HTMLDivElement[]>([]);

  useEffect(() => {
    const ctx = gsap.context(() => {
      // Header animation
      gsap.fromTo(
        '.features-header',
        { opacity: 0, y: 50 },
        {
          opacity: 1,
          y: 0,
          duration: 0.8,
          scrollTrigger: {
            trigger: '.features-header',
            start: 'top 80%',
            toggleActions: 'play none none reverse'
          }
        }
      );

      // Cards stagger animation
      cardsRef.current.forEach((card, index) => {
        gsap.fromTo(
          card,
          { opacity: 0, y: 80, scale: 0.95 },
          {
            opacity: 1,
            y: 0,
            scale: 1,
            duration: 0.8,
            delay: index * 0.15,
            scrollTrigger: {
              trigger: card,
              start: 'top 85%',
              toggleActions: 'play none none reverse'
            }
          }
        );
      });
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  const renderVisual = (type: string) => {
    if (type === 'scan') {
      return (
        <div className="relative h-48 overflow-hidden rounded-xl bg-secondary/30 p-4">
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 animate-fade-in" style={{ animationDelay: `${i * 100}ms` }}>
                <div className={`w-2 h-2 rounded-full ${i < 2 ? 'bg-destructive' : i < 4 ? 'bg-yellow-500' : 'bg-primary'}`} />
                <div className="h-2 bg-muted rounded flex-1" style={{ width: `${60 + Math.random() * 30}%` }} />
                <span className="text-xs font-mono text-muted-foreground">L{(i + 1) * 47}</span>
              </div>
            ))}
          </div>
          <div className="absolute top-4 right-4 flex items-center gap-2 glass-card px-3 py-1.5">
            <Scan className="w-3 h-3 text-primary animate-pulse" />
            <span className="text-xs font-mono text-foreground">Scanning...</span>
          </div>
        </div>
      );
    }
    if (type === 'assign') {
      return (
        <div className="relative h-48 overflow-hidden rounded-xl bg-secondary/30 p-4">
          <div className="space-y-3">
            <div className="flex items-start gap-3 glass-card p-3">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-mono">JD</div>
              <div className="flex-1">
                <div className="text-sm font-medium text-foreground">@johndoe</div>
                <div className="text-xs text-muted-foreground mt-1">I can fix this by implementing a memoization strategy...</div>
              </div>
              <CheckCircle2 className="w-5 h-5 text-primary" />
            </div>
            <div className="flex items-center gap-2 text-xs text-primary font-mono">
              <Sparkles className="w-4 h-4" />
              <span>Intent detected: Technical approach explained</span>
            </div>
            <div className="flex items-center gap-2">
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-foreground">Assigning issue #247 to @johndoe</span>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="relative h-48 overflow-hidden rounded-xl bg-secondary/30 p-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <GitPullRequest className="w-4 h-4 text-primary" />
            <span className="text-foreground font-medium">PR #189 - Fix memory leak</span>
          </div>
          <div className="flex items-center gap-2 pl-6 text-xs text-muted-foreground">
            <Bot className="w-3 h-3" />
            <span>Cline: Applied fix in src/utils/cache.ts</span>
          </div>
          <div className="flex items-center gap-2 pl-6 text-xs text-muted-foreground">
            <MessageSquare className="w-3 h-3" />
            <span>CodeRabbit: LGTM! Clean implementation.</span>
          </div>
          <div className="flex items-center gap-2 pl-6 text-xs text-primary font-medium">
            <CheckCircle2 className="w-3 h-3" />
            <span>AutoAudit: Merging & closing issue #247</span>
          </div>
        </div>
        <div className="absolute bottom-4 right-4 glass-card px-3 py-1.5">
          <div className="flex items-center gap-2">
            <Settings2 className="w-3 h-3 text-accent animate-spin-slow" />
            <span className="text-xs font-mono text-foreground">Kestra</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <section ref={sectionRef} id="features" className="section-padding relative">
      {/* Background */}
      <div className="absolute inset-0 radial-gradient-overlay opacity-50" />
      
      <div className="container-custom relative z-10">
        {/* Header */}
        <div className="features-header text-center max-w-3xl mx-auto mb-20">
          <span className="badge-primary mb-6">
            <Sparkles className="w-3 h-3" />
            Three Pillars of Automation
          </span>
          <h2 className="heading-lg mb-6">
            <span className="text-foreground">Everything You Need to</span>
            <br />
            <span className="text-gradient-primary">Ship Quality Code Faster</span>
          </h2>
          <p className="body-lg">
            AutoAudit combines deep analysis, intelligent automation, and AI-powered fixes 
            into a seamless workflow that transforms how you manage open source.
          </p>
        </div>

        {/* Feature Cards */}
        <div className="grid lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <div
              key={index}
              ref={(el) => { if (el) cardsRef.current[index] = el; }}
              className="glass-card-hover p-8 group"
            >
              {/* Badge */}
              <span className={`badge-${feature.color} mb-6`}>
                {feature.badge}
              </span>

              {/* Icon */}
              <div className={`w-14 h-14 rounded-2xl bg-${feature.color}/10 border border-${feature.color}/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-500`}>
                <feature.icon className={`w-7 h-7 text-${feature.color}`} />
              </div>

              {/* Content */}
              <h3 className="heading-md text-foreground mb-2">{feature.title}</h3>
              <p className="text-sm text-primary font-medium mb-4">{feature.subtitle}</p>
              <p className="body-md mb-6">{feature.description}</p>

              {/* Highlights */}
              <ul className="space-y-3 mb-8">
                {feature.highlights.map((highlight, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm text-muted-foreground">
                    <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />
                    {highlight}
                  </li>
                ))}
              </ul>

              {/* Visual */}
              {renderVisual(feature.visual)}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
