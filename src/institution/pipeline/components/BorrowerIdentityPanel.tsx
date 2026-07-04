import { User, Mail, Phone } from "lucide-react";

interface BorrowerIdentityPanelProps {
  name:    string | null;
  email:   string | null;
  phone:   string | null;
  address: string | null;
}

export function BorrowerIdentityPanel({
  name, email, phone, address,
}: BorrowerIdentityPanelProps) {
  if (!name && !email) return null;

  return (
    <div className="bg-ficium/4 border border-ficium/15 rounded-2xl p-4 space-y-2">
      <div className="text-[10px] font-bold text-ficium uppercase tracking-widest mb-1">
        Borrower identity
      </div>

      {name && (
        <div className="flex items-center gap-2 text-[13px] text-ink">
          <User size={13} className="text-ficium shrink-0" />
          <span className="font-semibold">{name}</span>
        </div>
      )}

      {email && (
        <a
          href={`mailto:${email}`}
          className="flex items-center gap-2 text-[13px] text-ficium hover:underline"
        >
          <Mail size={13} className="shrink-0" />
          {email}
        </a>
      )}

      {phone && (
        <a
          href={`tel:${phone}`}
          className="flex items-center gap-2 text-[13px] text-ficium hover:underline"
        >
          <Phone size={13} className="shrink-0" />
          {phone}
        </a>
      )}

      {address && (
        <div className="text-[12px] text-muted pl-5">{address}</div>
      )}
    </div>
  );
}
