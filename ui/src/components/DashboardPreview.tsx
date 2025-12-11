import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { 
  LayoutDashboard, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle2, 
  Clock,
  Users,
  GitPullRequest,
  Activity
} from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

const DashboardPreview = () => {
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        '.dashboard-header',
        { opacity: 0, y: 50 },
        {
          opacity: 1,
          y: 0,
          duration: 0.8,
          scrollTrigger: {
            trigger: '.dashboard-header',
            start: 'top 80%',
          }
        }
      );

      gsap.fromTo(
        '.dashboard-preview',
        { opacity: 0, y: 60, scale: 0.98 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 1,
          scrollTrigger: {
            trigger: '.dashboard-preview',
            start: 'top 85%',
          }
        }
      );
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  const stats = [
    { label: 'Active Issues', icon: AlertTriangle, color: 'text-yellow-400' },
    { label: 'Auto-Resolved', icon: CheckCircle2, color: 'text-green-400' },
    { label: 'Avg Fix Time', icon: Clock, color: 'text-primary' },
    { label: 'Contributors', icon: Users, color: 'text-accent' },
  ];

  const recentActivity = [
    { type: 'issue', title: 'Memory leak in cache module', status: 'Scanning', time: '2m ago' },
    { type: 'assign', title: '@sarah_dev assigned to #234', status: 'Assigned', time: '5m ago' },
    { type: 'pr', title: 'Fix: SQL injection vulnerability', status: 'Reviewing', time: '8m ago' },
    { type: 'merge', title: 'PR #187 auto-merged', status: 'Completed', time: '12m ago' },
  ];

  return (
    <section ref={sectionRef} className="section-padding relative overflow-hidden">
      <div className="absolute inset-0 grid-pattern opacity-15" />
      
      <div className="container-custom relative z-10">
        {/* Header */}
        <div className="dashboard-header text-center max-w-3xl mx-auto mb-16">
          <span className="badge-accent mb-6">
            <LayoutDashboard className="w-3 h-3" />
            Real-Time Dashboard
          </span>
          <h2 className="heading-lg mb-6">
            <span className="text-foreground">Complete Visibility</span>
            <br />
            <span className="text-gradient-primary">Into Your Workflow</span>
          </h2>
          <p className="body-lg">
            Monitor scans, track assignments, and watch issues get resolved in real-time. 
            All from a single, beautiful dashboard.
          </p>
        </div>

        {/* Dashboard Preview */}
        <div className="dashboard-preview glass-card p-4 lg:p-8 animated-border">
          {/* Dashboard Header */}
          <div className="flex items-center justify-between mb-8 pb-6 border-b border-border">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Activity className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h4 className="text-lg font-bold text-foreground">AutoAudit Dashboard</h4>
                <p className="text-xs text-muted-foreground">your-project/main</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-xs text-muted-foreground">Live</span>
            </div>
          </div>

          {/* Stats Grid - Without fake numbers */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {stats.map((stat, index) => (
              <div key={index} className="bg-secondary/50 rounded-xl p-4 border border-border/50">
                <div className="flex items-center gap-3 mb-3">
                  <stat.icon className={`w-5 h-5 ${stat.color}`} />
                  <div className="text-sm text-foreground font-medium">{stat.label}</div>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-primary to-accent rounded-full transition-all duration-1000"
                    style={{ width: `${60 + index * 10}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Two Column Layout */}
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Recent Activity */}
            <div className="bg-secondary/30 rounded-xl p-6 border border-border/50">
              <h5 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                Recent Activity
              </h5>
              <div className="space-y-3">
                {recentActivity.map((item, index) => (
                  <div key={index} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        item.type === 'issue' ? 'bg-yellow-500/10' :
                        item.type === 'assign' ? 'bg-accent/10' :
                        item.type === 'pr' ? 'bg-primary/10' :
                        'bg-green-500/10'
                      }`}>
                        {item.type === 'issue' && <AlertTriangle className="w-4 h-4 text-yellow-400" />}
                        {item.type === 'assign' && <Users className="w-4 h-4 text-accent" />}
                        {item.type === 'pr' && <GitPullRequest className="w-4 h-4 text-primary" />}
                        {item.type === 'merge' && <CheckCircle2 className="w-4 h-4 text-green-400" />}
                      </div>
                      <div>
                        <p className="text-sm text-foreground">{item.title}</p>
                        <p className="text-xs text-muted-foreground">{item.time}</p>
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      item.status === 'Scanning' ? 'bg-yellow-500/10 text-yellow-400' :
                      item.status === 'Assigned' ? 'bg-accent/10 text-accent' :
                      item.status === 'Reviewing' ? 'bg-primary/10 text-primary' :
                      'bg-green-500/10 text-green-400'
                    }`}>
                      {item.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Workflow Visualization */}
            <div className="bg-secondary/30 rounded-xl p-6 border border-border/50">
              <h5 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" />
                Live Workflow
              </h5>
              <div className="space-y-4">
                {['Scan', 'Detect', 'Assign', 'Fix', 'Review', 'Merge'].map((step, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                      i < 4 ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
                    }`}>
                      {i + 1}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm text-foreground">{step}</div>
                      <div className="h-1.5 bg-muted rounded-full mt-1 overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-primary to-accent rounded-full transition-all duration-500"
                          style={{ width: i < 4 ? '100%' : i === 4 ? '60%' : '0%' }}
                        />
                      </div>
                    </div>
                    {i < 4 && <CheckCircle2 className="w-4 h-4 text-green-400" />}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default DashboardPreview;
