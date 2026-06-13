import { Link } from "react-router-dom";
import { ArrowLeft, Shield, Zap, Globe } from "lucide-react";
import FiciumLogo from "../ui/FiciumLogo";

type Props = {
  back?: { label: string; to: string };
  children: React.ReactNode;
};

export function RegisterShell({ back, children }: Props) {
  return (
    <div className="min-h-screen relative overflow-hidden bg-ink flex">

      {/* ── LEFT PANEL — branding (desktop only) ── */}
      <div className="hidden lg:flex lg:w-[45%] xl:w-[40%] flex-col relative overflow-hidden">
        {/* Gradient bg */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#0f0c29] via-[#302b63] to-[#24243e]" />
        <div className="absolute inset-0"
          style={{
            background: "radial-gradient(ellipse at 30% 40%, rgba(79,70,229,0.5) 0%, transparent 60%), radial-gradient(ellipse at 80% 80%, rgba(139,92,246,0.3) 0%, transparent 50%)",
          }}
        />
        {/* Orbs */}
        <div className="absolute top-1/3 -left-10 w-72 h-72 rounded-full bg-ficium/20 blur-[80px] animate-pulse" />
        <div className="absolute bottom-1/4 right-0 w-64 h-64 rounded-full bg-violet-500/20 blur-[80px] animate-pulse" style={{ animationDelay: "1.5s" }} />

        {/* Content */}
        <div className="relative z-10 flex flex-col h-full p-10 xl:p-14">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 no-underline mb-auto">
            <FiciumLogo size={30} />
            <span className="font-display text-xl font-bold text-white">Ficium</span>
          </Link>

          {/* Tagline */}
          <div className="py-16">
            <div className="text-xs font-bold tracking-[0.12em] uppercase text-ficium/80 mb-4">
              The reverse-banking marketplace
            </div>
            <h2 className="font-display text-4xl xl:text-5xl font-bold text-white leading-[1.1] mb-6">
              Banks compete.<br />You choose.
            </h2>
            <p className="text-white/50 text-base leading-relaxed max-w-[320px]">
              Post what you need once. Banks across Mauritius bid against each other with their best offer.
            </p>

            {/* Trust badges */}
            <div className="flex flex-col gap-3 mt-10">
              {[
                { icon: Shield, text: "Bank-grade security & encryption" },
                { icon: Zap, text: "Bids in as little as 24 hours" },
                { icon: Globe, text: "All major Mauritian banks" },
              ].map((item) => (
                <div key={item.text} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white/10 grid place-items-center flex-shrink-0">
                    <item.icon size={15} className="text-white/70" />
                  </div>
                  <span className="text-sm text-white/60">{item.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="text-xs text-white/25">
            © {new Date().getFullYear()} Ficium · Mauritius
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL — form ── */}
      <div className="flex-1 flex flex-col min-h-screen relative">
        {/* Mobile background */}
        <div className="absolute inset-0 lg:hidden bg-gradient-to-br from-[#0f0c29] via-[#302b63] to-[#24243e]" />
        <div className="absolute inset-0 lg:hidden"
          style={{
            background: "radial-gradient(ellipse at 20% 50%, rgba(79,70,229,0.4) 0%, transparent 60%)",
          }}
        />
        {/* Desktop white bg */}
        <div className="absolute inset-0 hidden lg:block bg-[#f8f7f4]" />

        {/* Content */}
        <div className="relative z-10 flex flex-col h-full">
          {/* Mobile top nav */}
          <div className="flex lg:hidden items-center justify-between px-5 py-5">
            {back ? (
              <Link to={back.to} className="inline-flex items-center gap-1.5 text-sm text-white/60 hover:text-white transition-colors no-underline">
                <ArrowLeft size={15} /> {back.label}
              </Link>
            ) : <div />}
            <Link to="/" className="flex items-center gap-2 no-underline">
              <FiciumLogo size={24} />
              <span className="font-display text-base font-bold text-white">Ficium</span>
            </Link>
          </div>

          {/* Desktop top bar */}
          <div className="hidden lg:flex items-center justify-between px-8 xl:px-12 py-6 border-b border-ink/[0.06]">
            {back ? (
              <Link to={back.to} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink transition-colors no-underline">
                <ArrowLeft size={15} /> {back.label}
              </Link>
            ) : <div />}
            <div className="text-sm text-muted">
              Already have an account?{" "}
              <Link to="/login" className="text-ficium font-semibold no-underline hover:underline">Sign in</Link>
            </div>
          </div>

          {/* Form area */}
          <div className="flex-1 flex items-center justify-center px-5 py-8 lg:px-10 xl:px-16">
            <div className="w-full max-w-[480px]">
              {/* Render children ONCE — mobile gets glass card styling, desktop gets plain white */}
              <div className="bg-white/[0.97] lg:bg-transparent backdrop-blur-2xl lg:backdrop-blur-none rounded-3xl lg:rounded-none shadow-2xl lg:shadow-none p-6 lg:p-0 mb-5 lg:mb-0">
                {children}
              </div>

              {/* Mobile sign in link */}
              <p className="lg:hidden text-center text-sm text-white/50">
                Already have an account?{" "}
                <Link to="/login" className="text-white font-semibold no-underline">Sign in</Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
