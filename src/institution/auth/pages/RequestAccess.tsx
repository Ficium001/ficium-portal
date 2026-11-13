import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowRight, MailCheck } from "lucide-react";
import { submitAccessRequest } from "@/shared/lib/accessRequests";
import { RegisterShell } from "@/shared/components/RegisterShell";
import { Button, Field } from "@/shared/ui";

// Applying creates no account. Ficium reviews the application; after a contract,
// the institution's administrator receives an invitation to set a password.
const schema = z.object({
  institutionName: z.string().trim().min(2, "Institution name required").max(200),
  institutionType: z.enum(["commercial_bank","fintech","micro_credit","leasing","insurance","cooperative","other"], { message: "Select a type" }),
  country:         z.string().min(2, "Country required"),
  regNumber:       z.string().trim().max(100).optional().or(z.literal("")),
  regulator:       z.string().trim().max(100).optional().or(z.literal("")),
  website:         z.string().trim().url("Enter a valid URL, starting with https://").optional().or(z.literal("")),
  contactName:     z.string().trim().min(2, "Your name is required").max(200),
  contactRole:     z.string().trim().max(100).optional().or(z.literal("")),
  contactEmail:    z.string().trim().email("Enter a valid work email"),
  contactPhone:    z.string().trim().max(40).optional().or(z.literal("")),
  message:         z.string().trim().max(2000).optional().or(z.literal("")),
  companyFax:      z.string().optional(),
});
type Form = z.infer<typeof schema>;

const INST_TYPES = [
  { value: "commercial_bank", label: "Commercial bank" },
  { value: "fintech",         label: "Fintech" },
  { value: "micro_credit",    label: "Micro-credit" },
  { value: "leasing",         label: "Leasing" },
  { value: "insurance",       label: "Insurance" },
  { value: "cooperative",     label: "Cooperative" },
  { value: "other",           label: "Other" },
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

export default function RequestAccess() {
  const [sent, setSent] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const form = useForm<Form>({ resolver: zodResolver(schema), mode: "onTouched", defaultValues: { country: "MUS" } });
  const e = form.formState.errors;
  const opt = (v?: string) => (v && v.trim() ? v.trim() : undefined);

  const onSubmit = async (d: Form) => {
    setSubmitError(null);
    const r = await submitAccessRequest({
      institution_name: d.institutionName, institution_type: d.institutionType, country: d.country,
      reg_number: opt(d.regNumber), regulator: opt(d.regulator), website: opt(d.website),
      contact_name: d.contactName, contact_email: d.contactEmail, contact_phone: opt(d.contactPhone),
      contact_role: opt(d.contactRole), message: opt(d.message), company_fax: opt(d.companyFax),
    });
    if (!r.ok) { setSubmitError(r.error); return; }
    setSent(d.contactEmail.trim());
  };

  if (sent) return (
    <RegisterShell back={{ label: "Back to sign in", to: "/login" }}>
      <div className="text-center">
        <MailCheck className="w-12 h-12 text-ficium mx-auto mb-4" />
        <h1 className="font-display text-3xl font-bold text-ink">Check your email</h1>
        <p className="text-muted text-[15px] mt-3 leading-relaxed">
          If the details are valid, we have sent a link to <strong className="text-ink">{sent}</strong> to
          confirm your application. It expires in 24 hours. Our team reviews confirmed applications and
          will contact you.
        </p>
      </div>
    </RegisterShell>
  );

  return (
    <RegisterShell back={{ label: "Back to sign in", to: "/login" }}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="mb-6">
          <h1 className="font-display text-3xl font-bold text-ink">Apply for institution access</h1>
          <p className="text-muted text-[15px] mt-1">
            Access to the Ficium portal is by agreement. Tell us about your institution and we will be in touch.
          </p>
        </div>
        <Field label="Institution name" htmlFor="institutionName" error={e.institutionName?.message}>
          <input id="institutionName" {...form.register("institutionName")} className={inputCls(!!e.institutionName)} placeholder="Your bank's name" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Institution type" htmlFor="institutionType" error={e.institutionType?.message}>
            <select id="institutionType" {...form.register("institutionType")} className={inputCls(!!e.institutionType)}>
              <option value="">Select type</option>
              {INST_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="Country" htmlFor="country" error={e.country?.message}>
            <select id="country" {...form.register("country")} className={inputCls(!!e.country)}>
              {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Licence / reg number" htmlFor="regNumber" optional error={e.regNumber?.message}>
            <input id="regNumber" {...form.register("regNumber")} className={inputCls()} />
          </Field>
          <Field label="Regulator" htmlFor="regulator" optional error={e.regulator?.message}>
            <input id="regulator" {...form.register("regulator")} className={inputCls()} placeholder="FSC / BOM" />
          </Field>
        </div>
        <Field label="Website" htmlFor="website" optional error={e.website?.message}>
          <input id="website" {...form.register("website")} className={inputCls(!!e.website)} placeholder="https://yourbank.mu" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Your name" htmlFor="contactName" error={e.contactName?.message}>
            <input id="contactName" {...form.register("contactName")} className={inputCls(!!e.contactName)} autoComplete="name" />
          </Field>
          <Field label="Your role" htmlFor="contactRole" optional error={e.contactRole?.message}>
            <input id="contactRole" {...form.register("contactRole")} className={inputCls()} placeholder="Head of retail lending" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Work email" htmlFor="contactEmail" error={e.contactEmail?.message}>
            <input id="contactEmail" type="email" {...form.register("contactEmail")} className={inputCls(!!e.contactEmail)} autoComplete="email" />
          </Field>
          <Field label="Phone" htmlFor="contactPhone" optional error={e.contactPhone?.message}>
            <input id="contactPhone" {...form.register("contactPhone")} className={inputCls()} placeholder="+230 5XXX XXXX" autoComplete="tel" />
          </Field>
        </div>
        <Field label="Anything we should know?" htmlFor="message" optional error={e.message?.message}>
          <textarea id="message" rows={3} {...form.register("message")} className={inputCls()} />
        </Field>
        {/* Honeypot: invisible to people and screen readers; bots fill it. */}
        <div aria-hidden="true" className="absolute -left-[10000px] w-px h-px overflow-hidden">
          <label htmlFor="companyFax">Company fax</label>
          <input id="companyFax" tabIndex={-1} autoComplete="off" {...form.register("companyFax")} />
        </div>
        {submitError && (
          <div className="px-4 py-3.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-[14px]" role="alert">{submitError}</div>
        )}
        <Button type="submit" size="lg" fullWidth loading={form.formState.isSubmitting} rightIcon={<ArrowRight size={18} />}>
          Send application
        </Button>
        <p className="text-[12px] text-muted text-center">
          Applying does not create an account. If your institution is accepted and a contract is signed,
          your administrator receives an invitation by email.
        </p>
      </form>
    </RegisterShell>
  );
}
