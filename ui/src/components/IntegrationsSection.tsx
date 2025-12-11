import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ExternalLink, Puzzle, Github, Rabbit, Zap } from 'lucide-react';
import OumiSvg from '@/assets/oumi.svg';
import ClineSvg from '@/assets/cline.svg';
import KestraSvg from '@/assets/kestra.svg';

gsap.registerPlugin(ScrollTrigger);

const integrations = [
  {
    name: 'Oumi',
    description: 'Deep AI-powered code analysis and scanning engine',
    role: 'Codebase Scanner',
    color: '#10B981',
    icon: OumiSvg,
    isSvg: true
  },
  {
    name: 'Cline',
    description: 'AI-powered CLI editor for automated code modifications',
    role: 'Code Editor',
    color: '#8B5CF6',
    icon: ClineSvg,
    isSvg: true
  },
  {
    name: 'Kestra',
    description: 'Orchestration platform for complex automation workflows',
    role: 'Workflow Engine',
    color: '#F59E0B',
    icon: KestraSvg,
    isSvg: true
  },
  {
    name: 'CodeRabbit',
    description: 'AI code reviewer for intelligent PR analysis',
    role: 'Code Reviewer',
    color: '#EC4899',
    icon: Rabbit,
    isSvg: false
  },
  {
    name: 'GitHub',
    description: 'Version control and collaboration platform',
    role: 'Source Control',
    color: '#6366F1',
    icon: Github,
    isSvg: false
  },
  {
    name: 'GitHub Actions',
    description: 'CI/CD automation for seamless deployment',
    role: 'CI/CD Pipeline',
    color: '#2563EB',
    icon: Zap,
    isSvg: false
  }
];

const IntegrationsSection = () => {
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        '.integrations-header',
        { opacity: 0, y: 50 },
        {
          opacity: 1,
          y: 0,
          duration: 0.8,
          scrollTrigger: {
            trigger: '.integrations-header',
            start: 'top 80%',
          }
        }
      );

      gsap.utils.toArray('.integration-card').forEach((card: Element, i) => {
        gsap.fromTo(
          card,
          { opacity: 0, y: 40, scale: 0.95 },
          {
            opacity: 1,
            y: 0,
            scale: 1,
            duration: 0.6,
            delay: i * 0.1,
            scrollTrigger: {
              trigger: card,
              start: 'top 90%',
            }
          }
        );
      });
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section ref={sectionRef} id="integrations" className="section-padding relative">
      <div className="absolute inset-0 radial-gradient-overlay opacity-30" />

      <div className="container-custom relative z-10">
        {/* Header */}
        <div className="integrations-header text-center max-w-3xl mx-auto mb-16">
          <span className="badge-primary mb-6">
            <Puzzle className="w-3 h-3" />
            Powerful Integrations
          </span>
          <h2 className="heading-lg mb-6">
            <span className="text-foreground">Built on</span>
            <br />
            <span className="text-gradient-primary">Industry-Leading Tools</span>
          </h2>
          <p className="body-lg">
            AutoAudit leverages the best-in-class tools to deliver a seamless,
            enterprise-grade automation experience.
          </p>
        </div>

        {/* Integration Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {integrations.map((integration, index) => {
            const IconComponent = integration.icon;
            return (
              <div
                key={index}
                className="integration-card glass-card-hover p-6 group cursor-pointer"
              >
                <div className="flex items-start justify-between mb-4">

                  {integration.isSvg ? (
                    <img
                      src={IconComponent as string}
                      alt={integration.name}
                      className={`h-12 ${integration.name === "Kestra" ? "" : 'invert'}`}
                    />
                  ) : (
                    <div
                      className="w-14 h-14 rounded-2xl flex items-center justify-center"
                      style={{ backgroundColor: `${integration.color}15`, border: `1px solid ${integration.color}30` }}
                    >
                      <IconComponent className="w-7 h-7" style={{ color: integration.color }} strokeWidth={2} />
                    </div>
                  )}
                  <ExternalLink className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>

                <div className="mb-3">
                  <span
                    className="text-xs font-mono uppercase tracking-wider"
                    style={{ color: integration.color }}
                  >
                    {integration.role}
                  </span>
                </div>

                <h3 className="text-xl font-bold text-foreground mb-2">
                  {integration.name}
                </h3>

                <p className="text-sm text-muted-foreground">
                  {integration.description}
                </p>
              </div>
            );
          })}
        </div>

        {/* Connection Diagram */}
        <div className="mt-20 glass-card p-8 lg:p-12">
          <div className="text-center mb-12">
            <h3 className="heading-md text-foreground mb-4">How They Connect</h3>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              A seamless flow from detection to resolution, orchestrated by AutoAudit.
            </p>
          </div>

          <div className="relative flex flex-wrap justify-center items-center gap-4 lg:gap-8">
            {/* Flow visualization */}
            {['Oumi', 'AutoAudit', 'Cline', 'CodeRabbit', 'GitHub'].map((tool, i) => (
              <div key={i} className="flex items-center gap-4 lg:gap-8">
                <div className={`px-6 py-3 rounded-xl font-medium ${tool === 'AutoAudit'
                    ? 'bg-gradient-primary text-primary-foreground'
                    : 'bg-secondary text-foreground border border-border'
                  }`}>
                  {tool}
                </div>
                {i < 4 && (
                  <div className="hidden lg:block text-primary font-mono">→</div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-8 text-center text-sm text-muted-foreground font-mono">
            Orchestrated by <span className="text-accent">Kestra</span> workflows
          </div>
        </div>
      </div>
    </section>
  );
};

export default IntegrationsSection;
