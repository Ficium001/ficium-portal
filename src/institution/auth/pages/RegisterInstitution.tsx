
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowRight, ArrowLeft, CheckCircle } from "lucide-react";
import { signUpInstitution } from "@/shared/lib/auth";
import { RegisterShell } from "@/shared/components/RegisterShell";
import { Button, Field } from "@/shared/ui";

// ── Step schemas ──────────────────────────────────────────────
const step1Schema = z.object({
  institutionName:  z.string().trim().min(2, "Institution name required").max(150),
  legalName:        z.string().trim().min(2, "Legal name required").max(150),
  institutionType:  z.enum(["commercial_bank","fintech","micro_credit","leasing","insurance","cooperative","other"], { message: "Select a type" }),
  regNumber:        z.string().trim().max(40).optional().or(z.literal("")),
  regulatoryBody:   z.string().trim().max(100).optional().or(z.literal("")),
  country:          z.string().min(2, "Country required"),
  website:          z.string().url("Enter a valid URL").optional().or(z.literal("")),
});

const step2Schema = z.object({
  deploymentModel: z.enum(["saas","paas","on_prem"], { message: "Select a deployment model" }),
});

const step3Schema = z.object({
  firstName: z.string().trim().min(1, "First name required").max(60),
  lastName:  z.string().trim().min(1, "Last name required").max(60),
  email:     z.string().email("Enter a valid email"),
  phone:     z.string().trim().max(20).optional().or(z.literal("")),
  password:  z.string().min(8, "At least 8 characters"),
  confirmPassword: z.string(),
}).refine(d => d.password === d.confirmPassword, {
  message: "Passwords do not match", path: ["confirmPassword"],
});

type Step1 = z.infer<typeof step1Schema>;
type Step2 = z.infer<typeof step2Schema>;
type Step3 = z.infer<typeof step3Schema>;

const INST_TYPES = [
  { value: "commercial_bank", label: "Commercial bank"    },
  { value: "fintech",         label: "Fintech"            },
  { value: "micro_credit",    label: "Micro-credit"       },
  { value: "leasing",         label: "Leasing"            },
  { value: "insurance",       label: "Insurance"          },
  { value: "cooperative",     label: "Cooperative"        },
  { value: "other",           label: "Other"              },
];

const DEPLOY_OPTIONS = [
  { value: "saas",    label: "SaaS — hosted by Ficium",               desc: "Zero infrastructure. Fastest setup." },
  { value: "paas",    label: "PaaS — your cloud account",             desc: "You control the cloud, we ship the runtime." },
  { value: "on_prem", label: "On-premises — your data centre",        desc: "Full data sovereignty. Highest control." },
];

const COUNTRIES = [
  { code: "MUS", label: "Mauritius"      },
  { code: "REU", label: "Réunion"        },
  { code: "MDG", label: "Madagascar"     },
  { code: "SYC", label: "Seychelles"     },
  { code: "COM", label: "Comoros"        },
  { code: "IND", label: "India"          },
  { code: "ZAF", label: "South Africa"   },
  { code: "FRA", label: "France"         },
  { code: "GBR", label: "United Kingdom" },
  { code: "USA", label: "United States"  },
  { code: "OTH", label: "Other"          },
];

const inputCls = (err?: boolean) => [
  "w-full rounded-xl border px-4 py-3.5 text-[16px] outline-hidden transition-all bg-white text-ink placeholder:text-ink/30",
  err ? "border-red-400 focus:ring-2 focus:ring-red-200" : "border-ink/12 focus:border-ficium focus:ring-2 focus:ring-ficium/20",
].join(" ");

export default function RegisterInstitution() {
  const navigate = useNavigate();
  const [step, setStep]         = useState(1);
  const [step1Data, setStep1]   = useState<Partial<Step1>>({});
  const [, setStep2]   = useState<Partial<Step2>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Step 1 form
  const form1 = useForm<Step1>({ resolver: zodResolver(step1Schema), mode: "onTouched", defaultValues: { country: "MUS" } });
  // Step 2 form
  const form2 = useForm<Step2>({ resolver: zodResolver(step2Schema), mode: "onTouched" });
  // Step 3 form
  const form3 = useForm<Step3>({ resolver: zodResolver(step3Schema), mode: "onTouched" });

  const onStep1 = (data: Step1) => { setStep1(data); setStep(2); };
  const onStep2 = (data: Step2) => { setStep2(data); setStep(3); };

  const onStep3 = async (data: Step3) => {
    setSubmitError(null);
    const result = await signUpInstitution({
      email:           data.email,
      password:        data.password,
      firstName:       data.firstName,
      lastName:        data.lastName,
      institutionName: step1Data.institutionName!,
      institutionType: step1Data.institutionType! as "commercial_bank" | "fintech" | "micro_credit" | "leasing" | "insurance" | "cooperative" | "other",
      licenseNumber:   step1Data.regNumber,
      regulatoryBody:  step1Data.regulatoryBody,
      phone:           data.phone,
      country:         step1Data.country!,
    });

    if (!result.ok) {
      setSubmitError(result.error.message);
      return;
    }
    navigate("/pending");
  };

  const STEPS = ["Institution details", "Deployment model", "Admin account"];

  return (
    <RegisterShell back={{ label: "Back to register", to: "/register" }}>
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const done = n < step;
          const active = n === step;
          return (
            <div key={label} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold transition-colors ${
                done ? "bg-green-500 text-white" : active ? "bg-ficium text-white" : "bg-ink/10 text-muted"
              }`}>
                {done ? <CheckCircle className="w-4 h-4" /> : n}
              </div>
              <span className={`text-[12px] font-medium hidden sm:block ${active ? "text-ink" : "text-muted"}`}>{label}</span>
              {i < STEPS.length - 1 && <div className={`h-px w-8 ${done ? "bg-green-400" : "bg-ink/10"}`} />}
            </div>
          );
        })}
      </div>

      {/* Step 1 — Institution details */}
      {step === 1 && (
        <form onSubmit={form1.handleSubmit(onStep1)} className="space-y-4">
          <div className="mb-6">
            <h1 className="font-display text-3xl font-bold text-ink">Institution details</h1>
            <p className="text-muted text-[15px] mt-1">Tell us about your financial institution.</p>
          </div>
          <Field label="Institution name" htmlFor="institutionName" error={form1.formState.errors.institutionName?.message}>
            <input id="institutionName" {...form1.register("institutionName")} className={inputCls(!!form1.formState.errors.institutionName)} placeholder="MCB Group" />
          </Field>
          <Field label="Legal name" htmlFor="legalName" error={form1.formState.errors.legalName?.message}>
            <input id="legalName" {...form1.register("legalName")} className={inputCls(!!form1.formState.errors.legalName)} placeholder="Mauritius Commercial Bank Ltd" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Institution type" htmlFor="institutionType" error={form1.formState.errors.institutionType?.message}>
              <select id="institutionType" {...form1.register("institutionType")} className={inputCls(!!form1.formState.errors.institutionType)}>
                <option value="">Select type</option>
                {INST_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </Field>
            <Field label="Country" htmlFor="country" error={form1.formState.errors.country?.message}>
              <select id="country" {...form1.register("country")} className={inputCls(!!form1.formState.errors.country)}>
                {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Licence / reg number" htmlFor="regNumber" error={form1.formState.errors.regNumber?.message}>
              <input id="regNumber" {...form1.register("regNumber")} className={inputCls()} placeholder="Optional" />
            </Field>
            <Field label="Regulatory body" htmlFor="regulatoryBody" error={form1.formState.errors.regulatoryBody?.message}>
              <input id="regulatoryBody" {...form1.register("regulatoryBody")} className={inputCls()} placeholder="FSC / BOM" />
            </Field>
          </div>
          <Field label="Website" htmlFor="website" error={form1.formState.errors.website?.message}>
            <input id="website" {...form1.register("website")} className={inputCls(!!form1.formState.errors.website)} placeholder="https://yourbank.mu" />
          </Field>
          <Button type="submit" size="lg" fullWidth rightIcon={<ArrowRight size={18} />} className="mt-2">
            Continue
          </Button>
        </form>
      )}

      {/* Step 2 — Deployment model */}
      {step === 2 && (
        <form onSubmit={form2.handleSubmit(onStep2)} className="space-y-4">
          <div className="mb-6">
            <h1 className="font-display text-3xl font-bold text-ink">Deployment model</h1>
            <p className="text-muted text-[15px] mt-1">How will your institution access Ficium? This is commercially discussed and can be changed later.</p>
          </div>
          {DEPLOY_OPTIONS.map(opt => {
            const checked = form2.watch("deploymentModel") === opt.value;
            return (
              <label key={opt.value} className={`flex items-start gap-4 p-4 rounded-2xl border cursor-pointer transition-all ${checked ? "border-ficium bg-ficium/5" : "border-ink/10 hover:border-ficium/30"}`}>
                <input type="radio" {...form2.register("deploymentModel")} value={opt.value} className="mt-1 accent-ficium" />
                <div>
                  <div className="font-semibold text-[15px] text-ink">{opt.label}</div>
                  <div className="text-[13px] text-muted mt-0.5">{opt.desc}</div>
                </div>
              </label>
            );
          })}
          {form2.formState.errors.deploymentModel && (
            <p className="text-[13px] text-red-500">{form2.formState.errors.deploymentModel.message}</p>
          )}
          <div className="flex gap-3 mt-2">
            <button type="button" onClick={() => setStep(1)}
              className="flex items-center gap-1.5 text-muted hover:text-ink text-[14px] font-medium transition-colors">
              <ArrowLeft size={15} /> Back
            </button>
            <Button type="submit" size="lg" fullWidth rightIcon={<ArrowRight size={18} />}>
              Continue
            </Button>
          </div>
        </form>
      )}

      {/* Step 3 — Admin account */}
      {step === 3 && (
        <form onSubmit={form3.handleSubmit(onStep3)} className="space-y-4">
          <div className="mb-6">
            <h1 className="font-display text-3xl font-bold text-ink">Admin account</h1>
            <p className="text-muted text-[15px] mt-1">Create the primary administrator account for {step1Data.institutionName}.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name" htmlFor="firstName" error={form3.formState.errors.firstName?.message}>
              <input id="firstName" {...form3.register("firstName")} className={inputCls(!!form3.formState.errors.firstName)} placeholder="Jane" autoFocus />
            </Field>
            <Field label="Last name" htmlFor="lastName" error={form3.formState.errors.lastName?.message}>
              <input id="lastName" {...form3.register("lastName")} className={inputCls(!!form3.formState.errors.lastName)} placeholder="Smith" />
            </Field>
          </div>
          <Field label="Work email" htmlFor="email" error={form3.formState.errors.email?.message}>
            <input id="email" type="email" {...form3.register("email")} className={inputCls(!!form3.formState.errors.email)} placeholder="jane@yourbank.mu" />
          </Field>
          <Field label="Phone (optional)" htmlFor="phone" error={form3.formState.errors.phone?.message}>
            <input id="phone" {...form3.register("phone")} className={inputCls()} placeholder="+230 5XXX XXXX" />
          </Field>
          <Field label="Password" htmlFor="password" error={form3.formState.errors.password?.message}>
            <input id="password" type="password" {...form3.register("password")} className={inputCls(!!form3.formState.errors.password)} placeholder="At least 8 characters" />
          </Field>
          <Field label="Confirm password" htmlFor="confirmPassword" error={form3.formState.errors.confirmPassword?.message}>
            <input id="confirmPassword" type="password" {...form3.register("confirmPassword")} className={inputCls(!!form3.formState.errors.confirmPassword)} placeholder="Repeat password" />
          </Field>
          {submitError && (
            <div className="px-4 py-3.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-[14px]">{submitError}</div>
          )}
          <div className="flex gap-3 mt-2">
            <button type="button" onClick={() => setStep(2)}
              className="flex items-center gap-1.5 text-muted hover:text-ink text-[14px] font-medium transition-colors">
              <ArrowLeft size={15} /> Back
            </button>
            <Button type="submit" size="lg" fullWidth loading={form3.formState.isSubmitting} rightIcon={<ArrowRight size={18} />}>
              Submit application
            </Button>
          </div>
          <p className="text-[12px] text-muted text-center">
            By submitting, your institution will be reviewed by the Ficium compliance team before going live.
          </p>
        </form>
      )}
    </RegisterShell>
  );
}
