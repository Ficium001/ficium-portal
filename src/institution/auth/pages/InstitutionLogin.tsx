
import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowRight, Eye, EyeOff, Building2, Shield, Zap, Lock } from "lucide-react";
import { signIn } from "../../../shared/lib/auth";
import { Button, Field } from "../../../shared/ui";
import FiciumLogo from "../../../shared/ui/FiciumLogo";

const schema = z.object({
  email:      z.string().trim().toLowerCase().email("Enter a valid email address"),
  password:   z.string().min(1, "Password is required"),
  rememberMe: z.boolean().optional(),
});
type FormData = z.infer<typeof schema>;

const inputCls = (invalid: boolean) =>
  [
    "w-full rounded-xl border px-4 py-3.5 text-[16px] outline-none transition-all",
    "bg-white text-ink placeholder:text-ink/30",
    invalid
      ? "border-red-400 focus:ring-2 focus:ring-red-200"
      : "border-ink/[0.12] focus:border-ficium focus:ring-2 focus:ring-ficium/20",
  ].join(" ");

export default function InstitutionLogin() {
  const navigate = useNavigate();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: { email: "", password: "", rememberMe: false },
  });

  useEffect(() => {
    const remembered = localStorage.getItem("ficium_institution_remembered_email");
    if (remembered) {
      setValue("email", remembered.trim().toLowerCase());
      setValue("rememberMe", true);
    }
  }, [setValue]);

  const onSubmit = async (data: FormData) => {
    setSubmitError(null);
    if (data.rememberMe) {
      localStorage.setItem("ficium_institution_remembered_email", data.email.trim().toLowerCase());
    } else {
      localStorage.removeItem("ficium_institution_remembered_email");
    }
    const result = await signIn(data.email.trim().toLowerCase(), data.password, false);
    if (!result.ok) {
      setSubmitError("Incorrect email or password. Please try again.");
      return;
    }
    navigate("/dashboard", { replace: true });
  };

  const { ref: emailRef,    ...emailRest    } = register("email");
  const { ref: passwordRef, ...passwordRest } = register("password");

  return (
    <div className="min-h-screen flex overflow-hidden">

      {/* ── LEFT PANEL — matches client Login style ── */}
      <div className="hidden lg:flex lg:w-[45%] xl:w-[40%] flex-col relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0a0f1e] via-[#0f1929] to-[#0b1628]" />
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 30% 40%, rgba(37,99,235,0.4) 0%, transparent 60%), radial-gradient(ellipse at 80% 80%, rgba(99,102,241,0.25) 0%, transparent 50%)" }} />
        <div className="absolute top-1/3 -left-10 w-72 h-72 rounded-full bg-blue-600/20 blur-[80px] animate-pulse" />
        <div className="absolute bottom-1/4 right-0 w-64 h-64 rounded-full bg-indigo-500/15 blur-[80px] animate-pulse" style={{ animationDelay: "1.5s" }} />

        <div className="relative z-10 flex flex-col h-full p-10 xl:p-14">
          <Link to="/" className="flex items-center gap-2.5 no-underline mb-auto">
            <FiciumLogo heightPx={24} />
            <span className="font-display text-xl font-bold text-white">Ficium</span>
          </Link>

          <div className="py-16">
            <div className="text-[11px] font-bold tracking-[0.15em] uppercase text-blue-400 mb-5">
              Institution portal
            </div>
            <h2 className="font-display text-5xl xl:text-6xl font-bold text-white leading-[1.08] mb-6">
              Bid smart.<br />Win clients.
            </h2>
            <p className="text-white/50 text-[17px] leading-relaxed max-w-[320px]">
              Access the Ficium marketplace. Browse client requests, submit competitive bids, and grow your portfolio.
            </p>
            <div className="flex flex-col gap-4 mt-12">
              {[
                { icon: Building2, text: "Built for financial institutions" },
                { icon: Shield,    text: "Maker-checker on every action"  },
                { icon: Zap,       text: "Real-time bid notifications"     },
                { icon: Lock,      text: "FSC Mauritius compliant"         },
              ].map((item) => (
                <div key={item.text} className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-white/10 grid place-items-center flex-shrink-0">
                    <item.icon size={17} className="text-white/70" />
                  </div>
                  <span className="text-[15px] text-white/60">{item.text}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="text-xs text-white/25">© {new Date().getFullYear()} Ficium · Institution Portal</div>
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div className="flex-1 flex flex-col min-h-screen relative bg-[#f8f7f4]">

        {/* Mobile dark bg */}
        <div className="absolute inset-0 lg:hidden bg-gradient-to-br from-[#0a0f1e] via-[#0f1929] to-[#0b1628]" />
        <div className="absolute inset-0 lg:hidden" style={{ background: "radial-gradient(ellipse at 20% 50%, rgba(37,99,235,0.35) 0%, transparent 60%)" }} />

        <div className="relative z-10 flex flex-col h-full">

          {/* Mobile top nav */}
          <div className="flex lg:hidden items-center justify-between px-5 py-5">
            <Link to="/" className="flex items-center gap-2 no-underline">
              <FiciumLogo heightPx={20} />
              <span className="font-display text-base font-bold text-white">Ficium</span>
            </Link>
            <Link to="/register/institution" className="text-sm text-white/60 font-semibold no-underline">Register →</Link>
          </div>

          {/* Desktop top bar */}
          <div className="hidden lg:flex items-center justify-between px-8 xl:px-12 py-6 border-b border-ink/[0.06]">
            <div className="flex items-center gap-2 text-[13px] text-muted">
              <Building2 size={14} className="text-blue-500" />
              <span className="font-semibold text-blue-600">Institution portal</span>
            </div>
            <div className="text-[15px] text-muted">
              Not registered?{" "}
              <Link to="/register/institution" className="text-ficium font-semibold no-underline hover:underline">
                Apply now
              </Link>
            </div>
          </div>

          {/* Form area */}
          <div className="flex-1 flex items-center justify-center px-5 py-8 lg:px-12 xl:px-20">
            <div className="w-full max-w-[400px]">

              <div className="mb-10">
                <h1 className="font-display text-4xl lg:text-5xl font-bold">
                  <span className="hidden lg:block text-ink">Institution sign in</span>
                  <span className="lg:hidden text-white">Institution sign in</span>
                </h1>
                <p className="text-[16px] mt-2">
                  <span className="hidden lg:block text-muted">Access your institution portal</span>
                  <span className="lg:hidden text-white/50">Access your institution portal</span>
                </p>
              </div>

              {/* Form */}
              <div className="bg-white/[0.97] backdrop-blur-2xl rounded-3xl shadow-2xl p-6 mb-5 lg:bg-transparent lg:backdrop-blur-none lg:rounded-none lg:shadow-none lg:p-0 lg:mb-0">
                <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">

                  <Field label="Work email" htmlFor="email" error={errors.email?.message}>
                    <input
                      id="email"
                      ref={emailRef}
                      {...emailRest}
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      autoCapitalize="none"
                      autoCorrect="off"
                      autoFocus
                      spellCheck={false}
                      className={inputCls(!!errors.email)}
                      placeholder="you@institution.com"
                    />
                  </Field>

                  <Field label="Password" htmlFor="password" error={errors.password?.message}
                    rightLabel={
                      <Link to="/forgot-password" className="text-[13px] text-ficium font-semibold no-underline hover:underline">
                        Forgot password?
                      </Link>
                    }
                  >
                    <div className="relative">
                      <input
                        id="password"
                        ref={passwordRef}
                        {...passwordRest}
                        type={showPassword ? "text" : "password"}
                        autoComplete="current-password"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        className={inputCls(!!errors.password)}
                        placeholder="••••••••"
                        style={{ paddingRight: "2.75rem" }}
                      />
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-ink/40 hover:text-ink transition-colors"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </Field>

                  {submitError && (
                    <div role="alert" className="px-4 py-3.5 bg-red-50 border border-red-200 text-red-800 rounded-xl text-[14px]">
                      {submitError}
                    </div>
                  )}

                  {/* Remember me */}
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input type="checkbox" {...register("rememberMe")} className="w-4 h-4 accent-ficium rounded" />
                    <span className="text-[13px] text-muted">Remember my email</span>
                  </label>

                  <Button
                    type="submit"
                    size="lg"
                    loading={isSubmitting}
                    rightIcon={!isSubmitting && <ArrowRight size={18} />}
                    fullWidth
                    className="mt-1"
                  >
                    Sign in to portal
                  </Button>
                </form>
              </div>

              <p className="lg:hidden text-center text-[15px] text-white/50 mt-5">
                Not registered?{" "}
                <Link to="/register/institution" className="text-white font-semibold no-underline">
                  Apply now
                </Link>
              </p>

              {/* Individual login link */}
              <p className="text-center text-[13px] text-muted mt-6">
                Individual user?{" "}
                <Link to="/login" className="text-ficium font-semibold no-underline hover:underline">
                  Sign in here
                </Link>
              </p>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

