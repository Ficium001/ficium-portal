
import { Link } from "react-router-dom";
import { Clock, CheckCircle, Building2, FileText, Zap, ArrowRight } from "lucide-react";
import { useMyInstitution } from "@/institution/hooks/useInstitution";

const STAGES = [
  { key: "registered",          label: "Application received",    desc: "Your application has been received."                      },
  { key: "commercial_review",   label: "Commercial review",       desc: "Ficium sales team will contact you within 2 business days." },
  { key: "compliance_review",   label: "Compliance review",       desc: "Our compliance team is reviewing your documents."          },
  { key: "technical_setup",     label: "Technical setup",         desc: "Integration and deployment configuration."                 },
  { key: "pending_approval",    label: "Final approval",          desc: "Senior Ficium staff are reviewing your application."       },
  { key: "approved",            label: "Approved and live",       desc: "Your institution is live on the Ficium marketplace."       },
];

export default function InstitutionPending() {
  const { data: institution, isLoading } = useMyInstitution();
  const currentStage = institution?.onboarding_stage ?? "registered";
  const currentIdx   = STAGES.findIndex(s => s.key === currentStage);
  const isApproved   = currentStage === "approved";

  if (isLoading) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-ficium border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isApproved) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-card p-10 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="font-display text-2xl font-bold text-ink mb-2">You are live!</h2>
          <p className="text-muted mb-6">Your institution has been approved and is live on the Ficium marketplace.</p>
          <Link to="/dashboard" className="flex items-center justify-center gap-2 bg-ficium text-white font-bold py-3 px-6 rounded-xl hover:bg-ficium-deep transition-colors">
            Go to portal <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-ficium/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-7 h-7 text-ficium" />
          </div>
          <h1 className="font-display text-3xl font-bold text-ink mb-2">Application in review</h1>
          <p className="text-muted">
            {institution?.name ? `${institution.name} —` : ""} We will notify you at each stage.
          </p>
        </div>

        {/* Stage tracker */}
        <div className="bg-white rounded-2xl shadow-card p-6 mb-5">
          <div className="space-y-4">
            {STAGES.map((stage, idx) => {
              const done    = idx < currentIdx;
              const active  = idx === currentIdx;
                  return (
                <div key={stage.key} className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      done   ? "bg-green-500 text-white" :
                      active ? "bg-ficium text-white" :
                               "bg-ink/8 text-muted"
                    }`}>
                      {done ? (
                        <CheckCircle className="w-4 h-4" />
                      ) : active ? (
                        <Clock className="w-4 h-4 animate-pulse" />
                      ) : (
                        <span className="text-[12px] font-bold">{idx + 1}</span>
                      )}
                    </div>
                    {idx < STAGES.length - 1 && (
                      <div className={`w-0.5 h-6 mt-1 ${done ? "bg-green-300" : "bg-ink/8"}`} />
                    )}
                  </div>
                  <div className="pb-2">
                    <div className={`font-semibold text-[14px] ${active ? "text-ink" : done ? "text-green-700" : "text-muted"}`}>
                      {stage.label}
                      {active && <span className="ml-2 text-[10px] font-bold bg-ficium/10 text-ficium px-2 py-0.5 rounded-full">Current</span>}
                    </div>
                    {(active || done) && (
                      <div className="text-[12px] text-muted mt-0.5">{stage.desc}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Next steps card */}
        <div className="bg-white rounded-2xl shadow-card p-5 mb-5">
          <div className="font-semibold text-[14px] text-ink mb-3">While you wait</div>
          <div className="space-y-2.5">
            {[
              { icon: FileText, text: "Prepare your AML/CFT policy documents"         },
              { icon: FileText, text: "Gather FSC / BOM licence documentation"        },
              { icon: Zap,      text: "Review our API documentation for integration"  },
            ].map(item => (
              <div key={item.text} className="flex items-center gap-3 text-[13px] text-muted">
                <item.icon className="w-4 h-4 text-ficium flex-shrink-0" />
                {item.text}
              </div>
            ))}
          </div>
        </div>

        <p className="text-center text-[13px] text-muted">
          Questions? Email <a href="mailto:institutions@ficium.mu" className="text-ficium font-semibold">institutions@ficium.mu</a>
        </p>
      </div>
    </div>
  );
}
