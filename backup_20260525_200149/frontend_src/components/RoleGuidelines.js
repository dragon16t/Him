import { useState } from "react";
import { ChevronDown, ChevronUp, BookOpen } from "lucide-react";

const ROLE_GUIDES = {
  telecaller: {
    title: "Telecaller",
    mission: "Convert leads into customers through effective phone communication",
    tasks: [
      "Call new leads within 2 hours of assignment",
      "Follow up with interested leads on scheduled dates",
      "Log every call with status, remarks, and next follow-up date",
      "Build relationships with converted customers (15-day relationship call)",
      "Track repeat orders (30-day cycle) — re-engage past buyers",
      "Update lead status after every interaction (interested/not interested/follow up)",
      "Create orders for interested customers directly from lead card",
      "If customer says NO — try a different angle. Change the offer, share success stories"
    ],
    tips: [
      "Morning calls (10-12 PM) have highest pickup rate",
      "Always note customer's preferred call time",
      "Use product knowledge to handle objections confidently",
      "Every 'no' is one step closer to 'yes' — persistence wins"
    ],
    kpis: ["Calls per day", "Conversion rate", "Follow-up completion", "Repeat order rate"]
  },
  agent: {
    title: "Field Agent",
    mission: "Conduct home visits, deliver products, and build local customer relationships",
    tasks: [
      "Visit assigned localities and meet potential customers",
      "Create orders during home visits with correct product selection",
      "Collect payments (COD/UPI) and upload payment proofs",
      "Follow up on repeat orders every 30 days",
      "Build relationship with customers (15-day relationship visits)",
      "Report daily to District Manager on visits and conversions",
      "Maintain product catalog knowledge — know pricing, benefits, usage"
    ],
    tips: [
      "Plan your route — visit nearby customers together to save time",
      "Carry product samples for demonstrations",
      "Always get customer phone number for follow-up",
      "Ask for referrals from satisfied customers"
    ],
    kpis: ["Daily visits", "Orders created", "Commission earned", "Repeat customer rate"]
  },
  district_manager: {
    title: "District Manager",
    mission: "Manage agents in your district, monitor their performance, and ensure territory coverage",
    tasks: [
      "Monitor each agent's daily sales and call activities",
      "Track agent-wise repeat orders and relationship follow-ups",
      "Assign agents to localities for even territory coverage",
      "Review and approve orders before dispatch",
      "Call agents daily to discuss targets and challenges",
      "Create tasks for agents with deadlines and priorities",
      "Report district performance to Sales Manager weekly",
      "Identify underperforming agents and provide coaching"
    ],
    tips: [
      "Check the Repeat and Relationship tabs daily — these are revenue opportunities",
      "Use the call button to directly communicate with agents",
      "Set weekly targets and review every Friday",
      "Reward top performers to boost team morale"
    ],
    kpis: ["District revenue", "Agent conversion rate", "Order approval time", "Territory coverage"]
  },
  sales_manager: {
    title: "Sales Manager",
    mission: "Oversee all telecallers, drive revenue targets, and optimize sales processes",
    tasks: [
      "Monitor telecaller performance — calls, conversions, follow-ups",
      "Track repeat orders and relationship calls across all telecallers",
      "Create and assign task sheets to telecallers",
      "Review orders and approve pending ones",
      "Create calling instructions and sales scripts",
      "Manage commission payouts and track earnings",
      "Call telecallers and agents to provide coaching",
      "Analyze lead conversion funnel and identify bottlenecks"
    ],
    tips: [
      "Review the Repeat tab daily — these customers are easiest to convert",
      "Create instruction sheets for common objection handling",
      "Track which telecaller has highest conversion rate and share their methods",
      "Set up morning huddle calls to align daily targets"
    ],
    kpis: ["Total revenue", "Team conversion rate", "Average order value", "Repeat order percentage"]
  },
  finance_manager: {
    title: "Finance Manager",
    mission: "Manage company finances, process payments, and maintain accurate P&L records",
    tasks: [
      "Review and approve/reject expense requests",
      "Process fund requests from employees",
      "Manage cash vs bank balances accurately",
      "Process payroll after HR submits records",
      "Record external revenue entries (Amazon, Flipkart, Website, Offline)",
      "Monitor P&L statement monthly — flag unusual expenses",
      "Track cash held by employees and manage returns"
    ],
    tips: [
      "Check the P&L tab weekly for financial health",
      "Always verify payment proofs before approving expenses",
      "Keep cash-to-bank ratio balanced — don't hold too much cash",
      "Process payroll before 5th of every month"
    ],
    kpis: ["Cash flow accuracy", "Expense approval time", "P&L accuracy", "Payroll timeliness"]
  },
  hr_manager: {
    title: "HR Manager",
    mission: "Manage employees, process payroll, handle communications, and support hiring",
    tasks: [
      "Maintain employee directory with salary and incentive details",
      "Process monthly payroll — verify salary, incentive, advance deductions",
      "Record and track advance payments to employees",
      "Send official communications — welcome letters, increment letters, warnings",
      "Approve/reject leave requests promptly",
      "Handle employee complaints and resolve issues",
      "Monitor in-house telecaller hiring activity",
      "Send bulk emails for company announcements"
    ],
    tips: [
      "Process payroll in first week of month — employees depend on timely pay",
      "Always deduct pending advances from payroll",
      "Use email templates for professional communication",
      "Track hiring telecaller's daily recruitment activity"
    ],
    kpis: ["Payroll accuracy", "Leave response time", "Complaint resolution rate", "Hiring pipeline"]
  },
  social_media_manager: {
    title: "Social Media Manager",
    mission: "Create content strategy, manage content production pipeline, and oversee influencer outreach",
    tasks: [
      "Create content pillars aligned with brand strategy",
      "Write scripts and content briefs for each pillar",
      "Assign briefs to videographer and editor with priority (P1/P2/P3)",
      "Track content production status — pending, in production, completed",
      "Monitor influencer outreach telecaller's activity and conversions",
      "Manage product dispatch to influencers",
      "Review and approve final edited content before publishing",
      "Maintain content calendar with posting schedule"
    ],
    tips: [
      "Plan content pillars monthly — aim for 4-5 active pillars",
      "Set P1 priority for time-sensitive content (festivals, launches)",
      "Review influencer outreach metrics weekly",
      "Build a library of approved content for repurposing"
    ],
    kpis: ["Content output rate", "Pillar completion", "Influencer conversion rate", "Publishing frequency"]
  },
  inhouse_telecaller: {
    title: "In-House Telecaller",
    mission: "Support company operations through influencer outreach and HR recruitment calls",
    tasks: [
      "Influencer Outreach: Find and contact nano/medium influencers for barter collaborations",
      "Track influencer responses — contacted, responded, converted, product sent",
      "Log every outreach call with contact details and outcome",
      "HR Support: Call potential hires for telecaller, agent, and sales positions",
      "Track recruitment pipeline — contacted, interested, interviewed, hired",
      "Set daily call targets and update goal completion",
      "Follow up with interested influencers and candidates on scheduled dates",
      "Report daily activity to Social Media Manager (influencer) and HR Manager (hiring)"
    ],
    tips: [
      "Morning calls for recruitment, afternoon for influencer outreach",
      "Research influencer's content before calling — personalize your pitch",
      "For hiring calls, clearly explain the role, salary, and growth path",
      "Track your daily numbers — aim for continuous improvement"
    ],
    kpis: ["Calls per day", "Influencer conversion rate", "Hiring pipeline count", "Follow-up completion"]
  },
  content_strategist: {
    title: "Content Strategist",
    mission: "Plan content themes, create briefs, and coordinate with production team",
    tasks: [
      "Develop content pillars based on brand messaging",
      "Create detailed content briefs with scripts and requirements",
      "Coordinate with videographer for shoot scheduling",
      "Review raw footage and provide feedback to editor",
      "Maintain content calendar and publishing schedule",
      "Track brief completion and production timelines",
      "Research trending content formats and competitor strategies"
    ],
    tips: [
      "Plan 2 weeks ahead — give production team enough lead time",
      "Include detailed scripts in briefs to reduce revision cycles",
      "Monitor which content types perform best and create more of those"
    ],
    kpis: ["Briefs created", "Content completion rate", "Production timeline adherence"]
  },
  content_developer: {
    title: "Content Developer",
    mission: "Handle all content production — videography, video editing, and graphic design for brand content",
    tasks: [
      "Review assigned scripts and briefs from Social Media Manager",
      "Plan and execute video shoots (lighting, angles, setup)",
      "Edit raw footage — cuts, transitions, graphics, audio mixing",
      "Create graphic designs (thumbnails, posts, stories, ads)",
      "Upload raw video links to Google Drive after shooting",
      "Upload edited video links for SM review",
      "Upload graphic design files for approval",
      "Mark content as 'Posted' with the live post link after publishing",
      "Maintain brand guidelines across all content (logo, colors, fonts)",
      "Communicate shoot/edit status and blockers to SM"
    ],
    tips: [
      "Prioritize P1 tasks — these are time-sensitive (launches, festivals)",
      "Read the full script before every shoot for context",
      "Shoot multiple takes — gives more editing options",
      "Keep edits punchy for social media — short-form performs better",
      "Upload same day — don't let tasks pile up"
    ],
    kpis: ["Shoots completed", "Edits delivered", "Designs created", "Turnaround time", "Revision rate"]
  },
  assistant_district_manager: {
    title: "Assistant District Manager",
    mission: "Support DM by managing assigned agents, creating orders, and monitoring field performance",
    tasks: [
      "Monitor assigned agents' daily sales and activities",
      "Create orders for customers (like an agent)",
      "Track repeat orders and relationship follow-ups",
      "Call agents to discuss targets and challenges",
      "Create tasks for agents with deadlines",
      "Review pending orders and follow up on delivery",
      "Report team performance to District Manager",
      "Request funds for field operations"
    ],
    tips: ["Check repeat/relationship tabs daily", "Set weekly targets for agents", "Use call button for quick communication"],
    kpis: ["Team revenue", "Agent conversion rate", "Order count", "Follow-up completion"]
  },
  assistant_sales_manager: {
    title: "Assistant Sales Manager",
    mission: "Support SM by managing assigned telecallers and driving call-based conversions",
    tasks: [
      "Monitor assigned telecallers' call stats and conversions",
      "Track repeat orders and relationship calls",
      "Create tasks and instructions for telecallers",
      "Review pending orders",
      "Coach underperforming telecallers",
      "Report team metrics to Sales Manager",
      "Request funds for operations"
    ],
    tips: ["Review call metrics daily", "Share best practices from top performers", "Set daily call targets"],
    kpis: ["Team conversion rate", "Calls per day", "Repeat order rate", "Revenue generated"]
  },
  inventory_manager: {
    title: "Inventory Manager",
    mission: "Manage order fulfillment — ensure orders are packed, shipped, and delivered on time",
    tasks: [
      "Review new confirmed orders daily",
      "Mark orders as shipped with tracking",
      "Mark orders as delivered (triggers commission)",
      "Track orders not yet shipped (missing status)",
      "Coordinate with delivery partners",
      "Maintain inventory levels",
      "Report fulfillment metrics to admin"
    ],
    tips: ["Ship confirmed orders within 24 hours", "Check 'Not Shipped' count daily — should be zero", "Delivery triggers commission — don't delay"],
    kpis: ["Ship rate", "Delivery rate", "Turnaround time", "Not-shipped count"]
  },
  digital_marketing_manager: {
    title: "Digital Marketing Manager",
    mission: "Create campaigns, generate leads, and distribute them to sales/HR departments",
    tasks: [
      "Create and manage marketing campaigns",
      "Track campaign performance (budget, leads, conversions)",
      "Distribute leads to Sales Manager, District Manager, and HR",
      "Monitor lead conversion rates by department",
      "Generate daily and monthly performance reports",
      "Optimize campaign spend based on results"
    ],
    tips: ["Track cost per lead for each campaign", "Route customer leads to SM, hiring leads to HR", "Review conversion rates weekly"],
    kpis: ["Leads generated", "Cost per lead", "Conversion rate", "Campaign ROI"]
  },
};

export default function RoleGuidelines({ role, titleOverride, missionOverride }) {
  const [open, setOpen] = useState(false);
  const guide = ROLE_GUIDES[role];
  if (!guide) return null;
  const title = titleOverride || guide.title;
  const mission = missionOverride || guide.mission;

  return (
    <div className="bg-white rounded-xl border border-[#E5E3DB] mb-4 overflow-hidden" data-testid="role-guidelines">
      <button onClick={() => setOpen(!open)} className="w-full px-4 py-3 flex items-center justify-between hover:bg-[#F9F8F6] transition-all">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-[#3B5249]" />
          <span className="text-sm font-medium text-[#2C3531]">My Role: {title}</span>
          <span className="text-[10px] text-[#59615D] hidden sm:inline">— {mission}</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-[#59615D]" /> : <ChevronDown className="w-4 h-4 text-[#59615D]" />}
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-[#E5E3DB]">
          <p className="text-xs text-[#3B5249] font-medium mt-3 mb-1">{mission}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
            <div>
              <p className="text-[10px] font-semibold uppercase text-[#59615D] mb-2">Daily Tasks</p>
              <div className="space-y-1">{guide.tasks.map((t, i) => (
                <div key={i} className="flex gap-2 text-xs"><span className="text-[#3B5249] font-bold mt-0.5">{i + 1}.</span><span className="text-[#2C3531]">{t}</span></div>
              ))}</div>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase text-[#59615D] mb-2">Pro Tips</p>
              <div className="space-y-1 mb-3">{guide.tips.map((t, i) => (
                <p key={i} className="text-xs text-[#59615D]">- {t}</p>
              ))}</div>
              <p className="text-[10px] font-semibold uppercase text-[#59615D] mb-1">Key Metrics</p>
              <div className="flex flex-wrap gap-1">{guide.kpis.map((k, i) => (
                <span key={i} className="bg-[#F9F8F6] text-[#3B5249] text-[9px] px-2 py-0.5 rounded-full border border-[#E5E3DB]">{k}</span>
              ))}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export { ROLE_GUIDES };
