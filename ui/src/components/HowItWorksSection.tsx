import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { 
  GitBranch, 
  Scan, 
  FileWarning, 
  MessageSquare, 
  UserPlus, 
  Bot, 
  GitPullRequest, 
  CheckCircle2,
  BarChart,
  Shield,
  ArrowDown
} from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

const workflowSteps = [
  {
    phase: 'Phase 1',
    title: 'Deep Scan',
    icon: Scan,
    color: 'primary',
    steps: [
      { icon: GitBranch, text: 'Connect your repository' },
      { icon: Scan, text: 'Oumi AI analyzes entire codebase' },
      { icon: FileWarning, text: 'Issues auto-created with priority' },
    ]
  },
  {
    phase: 'Phase 2',
    title: 'Smart Assignment',
    icon: UserPlus,
    color: 'accent',
    steps: [
      { icon: MessageSquare, text: 'Contributor comments on issue' },
      { icon: Bot, text: 'AI analyzes intent & approach' },
      { icon: UserPlus, text: 'Auto-assign if qualified' },
    ]
  },
  {
    phase: 'Phase 3',
    title: 'AI PR Review',
    icon: BarChart,
    color: 'primary',
    steps: [
      { icon: GitPullRequest, text: 'PR created and submitted' },
      { icon: Bot, text: 'AI analyzes code quality' },
      { icon: Shield, text: 'Security & best practices check' },
      { icon: BarChart, text: 'Merge readiness % calculated' },
      { icon: CheckCircle2, text: 'Ready to merge with confidence' },
    ]
  }
];

const HowItWorksSection = () => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      // Header animation
      gsap.fromTo(
        '.how-header',
        { opacity: 0, y: 50 },
        {
          opacity: 1,
          y: 0,
          duration: 0.8,
          scrollTrigger: {
            trigger: '.how-header',
            start: 'top 80%',
          }
        }
      );

      // Timeline phases
      gsap.utils.toArray('.workflow-phase').forEach((phase: Element, i) => {
        gsap.fromTo(
          phase,
          { opacity: 0, x: i % 2 === 0 ? -50 : 50 },
          {
            opacity: 1,
            x: 0,
            duration: 0.8,
            scrollTrigger: {
              trigger: phase,
              start: 'top 85%',
            }
          }
        );
      });

      // Center line animation
      gsap.fromTo(
        '.timeline-line',
        { scaleY: 0 },
        {
          scaleY: 1,
          duration: 1.5,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: timelineRef.current,
            start: 'top 80%',
          }
        }
      );
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section ref={sectionRef} id="how-it-works" className="section-padding relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 grid-pattern opacity-20" />
      
      <div className="container-custom relative z-10">
        {/* Header */}
        <div className="how-header text-center max-w-3xl mx-auto mb-20">
          <span className="badge-accent mb-6">
            <Bot className="w-3 h-3" />
            Workflow Automation
          </span>
          <h2 className="heading-lg mb-6">
            <span className="text-foreground">From Issue Detection to</span>
            <br />
            <span className="text-gradient-primary">Merged PR in Minutes</span>
          </h2>
          <p className="body-lg">
            Watch how AutoAudit orchestrates your entire development workflow, 
            turning code issues into closed PRs with minimal human intervention.
          </p>
        </div>

        {/* Timeline */}
        <div ref={timelineRef} className="relative max-w-5xl mx-auto">
          {/* Center Line */}
          <div className="timeline-line hidden lg:block absolute left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-primary via-accent to-primary origin-top" />

          <div className="space-y-16 lg:space-y-0">
            {workflowSteps.map((phase, phaseIndex) => (
              <div 
                key={phaseIndex} 
                className={`workflow-phase lg:grid lg:grid-cols-2 lg:gap-16 items-start ${
                  phaseIndex !== 0 ? 'lg:mt-24' : ''
                }`}
              >
                {/* Phase Card */}
                <div className={`${phaseIndex % 2 === 0 ? 'lg:order-1' : 'lg:order-2'}`}>
                  <div className="glass-card p-8 relative">
                    {/* Phase Badge */}
                    <div className="flex items-center gap-4 mb-6">
                      <div className={`w-12 h-12 rounded-2xl bg-${phase.color}/10 border border-${phase.color}/20 flex items-center justify-center`}>
                        <phase.icon className={`w-6 h-6 text-${phase.color}`} />
                      </div>
                      <div>
                        <span className={`text-xs font-mono text-${phase.color} uppercase tracking-wider`}>{phase.phase}</span>
                        <h3 className="text-xl font-bold text-foreground">{phase.title}</h3>
                      </div>
                    </div>

                    {/* Steps */}
                    <div className="space-y-4">
                      {phase.steps.map((step, stepIndex) => (
                        <div key={stepIndex} className="flex items-start gap-4 group">
                          <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0 group-hover:bg-primary/10 transition-colors">
                            <step.icon className="w-4 h-4 text-primary" />
                          </div>
                          <div className="flex-1 pt-1">
                            <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                              {step.text}
                            </span>
                          </div>
                          {stepIndex < phase.steps.length - 1 && (
                            <ArrowDown className="w-4 h-4 text-muted-foreground/50 mt-1" />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Center Dot */}
                <div className={`hidden lg:flex ${phaseIndex % 2 === 0 ? 'lg:order-2' : 'lg:order-1'} items-start justify-${phaseIndex % 2 === 0 ? 'start' : 'end'}`}>
                  <div className={`w-6 h-6 rounded-full bg-${phase.color} border-4 border-background shadow-lg glow-${phase.color === 'primary' ? 'primary' : 'accent'} ${phaseIndex % 2 === 0 ? '-ml-3' : '-mr-3'} mt-10`} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Result Card */}
        <div className="mt-20 max-w-2xl mx-auto">
          <div className="glass-card p-8 text-center animated-border">
            <div className="flex items-center justify-center gap-4 mb-4">
              <CheckCircle2 className="w-8 h-8 text-green-400" />
              <h4 className="text-2xl font-bold text-foreground">Issue Resolved</h4>
            </div>
            <p className="text-muted-foreground">
              The entire workflow completed without a single manual intervention. 
              Your code is now cleaner, safer, and production-ready.
            </p>
            <div className="flex items-center justify-center gap-6 mt-6 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Time saved:</span>
                <span className="text-primary font-mono font-bold">~4 hours</span>
              </div>
              <div className="w-px h-4 bg-border" />
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Reviews automated:</span>
                <span className="text-primary font-mono font-bold">100%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HowItWorksSection;
