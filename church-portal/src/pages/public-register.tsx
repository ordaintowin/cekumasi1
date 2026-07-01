import { useState, useRef, useEffect, useCallback } from "react";
import { Link } from "wouter";
import { Camera, X, ChevronLeft, CheckCircle, User, Baby, Smile, ArrowRight, LogIn, Download, Copy, Search, Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type RegType = "member" | "child" | "teen";
type Step = "welcome" | "form" | "review" | "success";

const TITLES = ["Mr.", "Mrs.", "Brother", "Sister", "Pastor", "Deacon", "Deaconess"];

const CHILD_CLASSES = [
  { value: "preschool", label: "Preschool" },
  { value: "lower_elementary", label: "Lower Elementary" },
  { value: "upper_elementary", label: "Upper Elementary" },
  { value: "pre_teens", label: "Pre-Teens" },
];

const EMPTY_MEMBER = {
  title: "", firstName: "", lastName: "",
  gender: "male" as "male" | "female",
  memberType: "member" as "member" | "visitor",
  phone1: "", phone2: "", email: "", occupation: "",
  residentialAddress: "", emergencyContact: "", dateOfBirth: "",
  maritalStatus: "", dateJoined: "", foundationSchoolDate: "",
  weddingDate: "", isBaptized: false, cellId: "", profilePhoto: "",
};

const EMPTY_CHILD = {
  firstName: "", lastName: "", dateOfBirth: "",
  gender: "" as "male" | "female" | "",
  class: "",
};

const EMPTY_TEEN = {
  firstName: "", lastName: "", gender: "",
  phone1: "", phone2: "",
  placeOfResidence: "", dateJoined: "", dateOfBirth: "",
  foundationSchoolDate: "", foundationSchoolCompleted: false,
};

function resizeImage(file: File, maxPx = 800, quality = 0.75): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.src = url;
  });
}

function Field({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  if (!value && !children) return null;
  return (
    <div className="flex gap-3 py-2 border-b border-gray-100 last:border-0">
      <span className="text-xs text-gray-500 w-36 flex-shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-gray-800 font-medium flex-1">{children ?? value}</span>
    </div>
  );
}

function Sel({ label, value, onChange, options, required, placeholder }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; required?: boolean; placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-gray-700">{label}{required && <span className="text-red-500 ml-1">*</span>}</label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder={placeholder ?? "Select..."} />
        </SelectTrigger>
        <SelectContent>
          {options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function Inp({ label, value, onChange, type = "text", required, placeholder, lettersOnly }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; required?: boolean; placeholder?: string; lettersOnly?: boolean;
}) {
  function filter(raw: string) {
    if (type === "tel") return raw.replace(/\D/g, "");
    if (lettersOnly) return raw.replace(/[^a-zA-Z\s'-]/g, "");
    return raw;
  }
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-gray-700">{label}{required && <span className="text-red-500 ml-1">*</span>}</label>
      <input type={type} value={value}
        onChange={e => onChange(filter(e.target.value))}
        inputMode={type === "tel" ? "numeric" : undefined}
        required={required} placeholder={placeholder}
        className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer py-1">
      <div onClick={() => onChange(!checked)}
        className={`w-10 h-6 rounded-full flex-shrink-0 transition-colors relative ${checked ? "bg-purple-600" : "bg-gray-300"}`}>
        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : "translate-x-1"}`} />
      </div>
      <span className="text-sm text-gray-700">{label}</span>
    </label>
  );
}

function MemberSearchPicker({
  label, selectedMember, onSelect, onClear, placeholder,
}: {
  label: string;
  selectedMember: { id: number; firstName: string; lastName: string } | null;
  onSelect: (m: { id: number; firstName: string; lastName: string }) => void;
  onClear: () => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/public/members-search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setResults(Array.isArray(data) ? data : []);
        setOpen(true);
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={wrapRef} className="space-y-1.5 relative">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      {selectedMember ? (
        <div className="flex items-center gap-2 px-3 py-2.5 border border-gray-200 rounded-lg bg-purple-50">
          <span className="text-sm font-medium flex-1">
            {selectedMember.firstName} {selectedMember.lastName}
          </span>
          <button type="button" onClick={() => { onClear(); setQuery(""); }}>
            <X className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600" />
          </button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={query}
              placeholder={placeholder ?? "Search member name..."}
              onChange={e => { setQuery(e.target.value); setOpen(true); }}
              onFocus={() => { if (results.length) setOpen(true); }}
              className="w-full border border-gray-200 rounded-lg pl-9 pr-9 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            {loading && <Loader2 className="absolute right-3 top-3 w-4 h-4 animate-spin text-gray-400" />}
            {query && !loading && (
              <button type="button" onClick={() => { setQuery(""); setResults([]); setOpen(false); }}
                className="absolute right-3 top-3 text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          {open && results.length > 0 && (
            <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-xl z-50 max-h-48 overflow-y-auto">
              {results.map((m: any) => (
                <button key={m.id} type="button"
                  onClick={() => { onSelect(m); setQuery(""); setOpen(false); setResults([]); }}
                  className="w-full text-left px-4 py-2.5 hover:bg-purple-50 flex items-center justify-between gap-2 border-b border-gray-50 last:border-0">
                  <span className="text-sm text-gray-800 font-medium">{m.firstName} {m.lastName}</span>
                  <span className="text-xs text-gray-400 font-mono flex-shrink-0">{m.membershipId}</span>
                </button>
              ))}
            </div>
          )}
          {open && !loading && query.length >= 2 && results.length === 0 && (
            <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-xl z-50 px-4 py-3">
              <p className="text-sm text-gray-400">No members found.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ParentGuardianPicker({
  selectedParent, onSelectParent, onClearParent,
  useExternal, onToggleExternal,
  parentExternal, onParentExternalChange,
}: {
  selectedParent: { id: number; firstName: string; lastName: string } | null;
  onSelectParent: (m: any) => void;
  onClearParent: () => void;
  useExternal: boolean;
  onToggleExternal: () => void;
  parentExternal: string;
  onParentExternalChange: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700">Parent / Guardian</label>
        <button type="button" className="text-xs text-purple-600 hover:underline" onClick={onToggleExternal}>
          {useExternal ? "Search in members" : "Not in church?"}
        </button>
      </div>
      {useExternal ? (
        <input
          type="text"
          value={parentExternal}
          placeholder="Parent name & contact..."
          onChange={e => onParentExternalChange(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      ) : (
        <MemberSearchPicker
          label=""
          selectedMember={selectedParent}
          onSelect={onSelectParent}
          onClear={onClearParent}
          placeholder="Search parent in members..."
        />
      )}
    </div>
  );
}

function downloadCredentials(successData: any) {
  const text = [
    "=== CHRIST EMBASSY KUMASI 1 ===",
    "Member Registration Details",
    "================================",
    `Name           : ${successData.name}`,
    `Membership ID  : ${successData.membershipId}`,
    `Login PIN      : ${successData.pin}`,
    "--------------------------------",
    "To access the member portal:",
    `  Username : ${successData.membershipId}`,
    `  Password : ${successData.pin}`,
    "--------------------------------",
    "IMPORTANT: Keep this information safe.",
    "Do not share your PIN with anyone.",
    "================================",
  ].join("\n");
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `CE_Kumasi1_${successData.membershipId}_login.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

function copyCredentials(successData: any) {
  const text = `Christ Embassy Kumasi 1 — Member Login\nName: ${successData.name}\nMembership ID: ${successData.membershipId}\nPIN: ${successData.pin}`;
  navigator.clipboard.writeText(text).catch(() => {});
}

export default function PublicRegister() {
  const [step, setStep] = useState<Step>("welcome");
  const [regType, setRegType] = useState<RegType | null>(null);

  const [memberForm, setMemberForm] = useState({ ...EMPTY_MEMBER });
  const [memberDupes, setMemberDupes] = useState<any[]>([]);
  const [spouseId, setSpouseId] = useState<number | null>(null);
  const [spouseMember, setSpouseMember] = useState<{ id: number; firstName: string; lastName: string } | null>(null);

  const [childForm, setChildForm] = useState({ ...EMPTY_CHILD });
  const [childSelectedParent, setChildSelectedParent] = useState<any>(null);
  const [childUseExternal, setChildUseExternal] = useState(false);
  const [childParentExternal, setChildParentExternal] = useState("");

  const [teenForm, setTeenForm] = useState({ ...EMPTY_TEEN });
  const [teenSelectedParent, setTeenSelectedParent] = useState<any>(null);
  const [teenUseExternal, setTeenUseExternal] = useState(false);
  const [teenParentExternal, setTeenParentExternal] = useState("");

  const [cells, setCells] = useState<any[]>([]);
  const [cellError, setCellError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/public/cells")
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setCells(data); })
      .catch(() => {});
  }, []);

  const setM = (k: string, v: any) => setMemberForm(f => ({ ...f, [k]: v }));
  const setC = (k: string, v: any) => setChildForm(f => ({ ...f, [k]: v }));
  const setT = (k: string, v: any) => setTeenForm(f => ({ ...f, [k]: v }));

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { alert("Image must be under 10MB"); return; }
    const compressed = await resizeImage(file);
    setM("profilePhoto", compressed);
  };

  useEffect(() => {
    if (!memberForm.firstName || memberForm.firstName.length < 2) { setMemberDupes([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/public/members-search?q=${encodeURIComponent(memberForm.firstName)}`);
        const data = await res.json();
        setMemberDupes(Array.isArray(data) ? data : []);
      } catch { setMemberDupes([]); }
    }, 700);
    return () => clearTimeout(t);
  }, [memberForm.firstName]);

  const resetForms = () => {
    setMemberForm({ ...EMPTY_MEMBER });
    setMemberDupes([]);
    setSpouseId(null); setSpouseMember(null);
    setChildForm({ ...EMPTY_CHILD });
    setChildSelectedParent(null); setChildUseExternal(false); setChildParentExternal("");
    setTeenForm({ ...EMPTY_TEEN });
    setTeenSelectedParent(null); setTeenUseExternal(false); setTeenParentExternal("");
    setCellError(false);
  };

  const handleSelectType = (type: RegType) => {
    setRegType(type);
    resetForms();
    setError(null);
    setStep("form");
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setStep("review");
    window.scrollTo(0, 0);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      let body: any;
      let url: string;

      if (regType === "member") {
        url = "/api/public/register/member";
        body = {
          title: (memberForm.title && memberForm.title !== "none") ? memberForm.title : null,
          firstName: memberForm.firstName,
          lastName: memberForm.lastName,
          gender: memberForm.gender,
          memberType: memberForm.memberType,
          phone1: memberForm.phone1,
          phone2: memberForm.phone2 || null,
          email: memberForm.email || null,
          occupation: memberForm.occupation || null,
          residentialAddress: memberForm.residentialAddress,
          emergencyContact: memberForm.emergencyContact || null,
          dateOfBirth: memberForm.dateOfBirth || null,
          maritalStatus: memberForm.maritalStatus || null,
          dateJoined: memberForm.dateJoined || null,
          foundationSchoolDate: memberForm.foundationSchoolDate || null,
          weddingDate: memberForm.weddingDate || null,
          isBaptized: memberForm.isBaptized,
          cellId: memberForm.cellId ? parseInt(memberForm.cellId) : null,
          spouseId: spouseId ?? null,
          profilePhoto: memberForm.profilePhoto || null,
        };
      } else if (regType === "child") {
        url = "/api/public/register/child";
        body = {
          firstName: childForm.firstName,
          lastName: childForm.lastName,
          class: childForm.class || undefined,
          gender: childForm.gender || undefined,
          dateOfBirth: childForm.dateOfBirth || undefined,
          parentId: childUseExternal ? null : (childSelectedParent ? childSelectedParent.id : null),
          parentExternal: childUseExternal ? childParentExternal || undefined : null,
        };
      } else {
        url = "/api/public/register/teen";
        body = {
          firstName: teenForm.firstName,
          lastName: teenForm.lastName,
          gender: teenForm.gender || undefined,
          phone1: teenForm.phone1 || undefined,
          phone2: teenForm.phone2 || undefined,
          residentialAddress: teenForm.placeOfResidence || undefined,
          placeOfResidence: teenForm.placeOfResidence || undefined,
          dateJoined: teenForm.dateJoined || undefined,
          dateOfBirth: teenForm.dateOfBirth || undefined,
          foundationSchoolCompleted: teenForm.foundationSchoolCompleted,
          foundationSchoolDate: teenForm.foundationSchoolDate || undefined,
          parentId: teenUseExternal ? null : (teenSelectedParent ? teenSelectedParent.id : null),
          parentExternal: teenUseExternal ? teenParentExternal || undefined : null,
        };
      }

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Registration failed");
      setSuccessData(data);
      setStep("success");
      window.scrollTo(0, 0);
    } catch (err: any) {
      setError(err.message ?? "Registration failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddAnother = (type: RegType) => {
    setRegType(type);
    resetForms();
    setSuccessData(null);
    setError(null);
    setStep("form");
    window.scrollTo(0, 0);
  };

  const handleCopy = () => {
    copyCredentials(successData);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const selectedCell = cells.find(c => String(c.id) === memberForm.cellId);

  const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString("en-GH", { day: "numeric", month: "long", year: "numeric" }) : "";

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-950 via-purple-900 to-purple-800">
      <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />

      {/* Header */}
      <div className="bg-gradient-to-b from-black/30 to-transparent pt-8 pb-6 px-4 text-center">
        <img src="/logo.png" alt="Christ Embassy Kumasi 1" className="w-16 h-16 mx-auto mb-3 rounded-2xl shadow-xl"
          onError={e => (e.currentTarget.style.display = "none")} />
        <h1 className="text-xl font-bold text-white tracking-wide">Christ Embassy Kumasi 1</h1>
        <p className="text-purple-300 text-xs mt-1 tracking-wider uppercase">Member Registration Portal</p>
      </div>

      <div className="px-4 pb-12 max-w-md mx-auto">

        {/* ── WELCOME ── */}
        {step === "welcome" && (
          <div className="space-y-4">
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-5 text-center border border-white/20">
              <h2 className="text-white font-bold text-lg">Welcome!</h2>
              <p className="text-purple-200 text-sm mt-1.5">Please select your category to begin your registration.</p>
            </div>

            {[
              { type: "member" as RegType, icon: <User className="w-6 h-6 text-purple-700" />, bg: "bg-purple-100", hover: "group-hover:bg-purple-200", label: "Member", desc: "Adult church member" },
              { type: "child" as RegType, icon: <Baby className="w-6 h-6 text-yellow-700" />, bg: "bg-yellow-100", hover: "group-hover:bg-yellow-200", label: "Children", desc: "Children's church (age 0–12)" },
              { type: "teen" as RegType, icon: <Smile className="w-6 h-6 text-blue-700" />, bg: "bg-blue-100", hover: "group-hover:bg-blue-200", label: "Teens", desc: "Teens church (age 13–17)" },
            ].map(({ type, icon, bg, hover, label, desc }) => (
              <button key={type} onClick={() => handleSelectType(type)}
                className="w-full bg-white rounded-2xl p-5 flex items-center gap-4 shadow-lg hover:shadow-xl transition-all active:scale-95 text-left group">
                <div className={`w-12 h-12 rounded-xl ${bg} ${hover} flex items-center justify-center flex-shrink-0 transition-colors`}>{icon}</div>
                <div className="flex-1">
                  <p className="font-bold text-gray-900">{label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
                </div>
                <ArrowRight className="w-5 h-5 text-gray-300" />
              </button>
            ))}

            <p className="text-center text-purple-300 text-xs">
              Already registered?{" "}
              <Link href="/login" className="text-white underline underline-offset-2">Sign in here</Link>
            </p>
          </div>
        )}

        {/* ── FORM ── */}
        {step === "form" && (
          <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className={`px-5 py-4 flex items-center gap-3 ${
              regType === "member" ? "bg-purple-700" : regType === "child" ? "bg-yellow-600" : "bg-blue-700"
            }`}>
              <button onClick={() => setStep("welcome")} className="text-white/70 hover:text-white">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div>
                <p className="text-white font-bold">
                  {regType === "member" ? "Member Registration" : regType === "child" ? "Children Registration" : "Teens Registration"}
                </p>
                <p className="text-white/70 text-xs">Fill in the details below</p>
              </div>
            </div>

            <form onSubmit={handleFormSubmit} className="p-5 space-y-3">

              {/* ── MEMBER FORM ── */}
              {regType === "member" && (
                <>
                  {/* Profile Photo */}
                  <div className="flex flex-col items-center gap-2 py-2">
                    <div onClick={() => photoInputRef.current?.click()}
                      className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-100 to-purple-200 border-2 border-purple-200 flex items-center justify-center overflow-hidden cursor-pointer relative group">
                      {memberForm.profilePhoto
                        ? <img src={memberForm.profilePhoto} alt="Profile" className="w-full h-full object-cover" />
                        : <div className="flex flex-col items-center gap-0.5 text-purple-400"><Camera className="w-6 h-6" /><span className="text-[10px]">Photo</span></div>
                      }
                      <div className="absolute inset-0 bg-black/20 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Camera className="w-5 h-5 text-white" />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => photoInputRef.current?.click()} className="text-xs text-purple-600 underline underline-offset-2">
                        {memberForm.profilePhoto ? "Change photo" : "Upload photo (optional)"}
                      </button>
                      {memberForm.profilePhoto && (
                        <button type="button" onClick={() => setM("profilePhoto", "")} className="text-gray-400 hover:text-red-500">
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Title + First + Last — 3-column */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-gray-700">Title</label>
                      <select value={memberForm.title} onChange={e => setM("title", e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-500">
                        <option value="">— None —</option>
                        {TITLES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-gray-700">First Name <span className="text-red-500">*</span></label>
                      <input value={memberForm.firstName} onChange={e => setM("firstName", e.target.value.replace(/[^a-zA-Z\s'-]/g, ""))} required
                        className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-gray-700">Last Name <span className="text-red-500">*</span></label>
                      <input value={memberForm.lastName} onChange={e => setM("lastName", e.target.value.replace(/[^a-zA-Z\s'-]/g, ""))} required
                        className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                    </div>
                  </div>

                  {/* Gender — toggle buttons */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-700">Gender <span className="text-red-500">*</span></label>
                    <div className="flex gap-2">
                      {(["male", "female"] as const).map(g => (
                        <button key={g} type="button"
                          className={`flex-1 py-2.5 rounded-lg border text-sm font-medium capitalize transition-colors ${memberForm.gender === g ? "bg-purple-700 text-white border-purple-700" : "bg-white text-gray-700 border-gray-200 hover:border-purple-300"}`}
                          onClick={() => setM("gender", g)}>
                          {g}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Duplicate warning */}
                  {memberDupes.length > 0 && (
                    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2">
                      <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
                        <span>⚠</span> Possible duplicate — {memberDupes.length} similar name{memberDupes.length !== 1 ? "s" : ""} already exist. Verify before registering.
                      </p>
                      <div className="space-y-1">
                        {memberDupes.map((m: any) => (
                          <div key={m.id} className="flex items-center gap-2 bg-white rounded-md px-2 py-1.5 border border-amber-200">
                            <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 text-[10px] font-bold flex-shrink-0">
                              {m.firstName?.[0]}{m.lastName?.[0]}
                            </div>
                            <span className="text-xs font-medium text-gray-800 flex-1">{m.firstName} {m.lastName}</span>
                            <span className="text-xs text-gray-400 font-mono">{m.membershipId}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <Inp label="Phone 1" value={memberForm.phone1} onChange={v => setM("phone1", v)} required placeholder="e.g. 0244000000" type="tel" />
                  <Inp label="Residential Address" value={memberForm.residentialAddress} onChange={v => setM("residentialAddress", v)} required placeholder="e.g. Adum, Kumasi" />

                  <Sel label="Marital Status" value={memberForm.maritalStatus} onChange={v => setM("maritalStatus", v)}
                    options={["single", "married", "widowed", "divorced"].map(s => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))} />

                  {memberForm.maritalStatus === "married" && (
                    <>
                      <MemberSearchPicker
                        label="Spouse (search member)"
                        selectedMember={spouseMember}
                        onSelect={m => { setSpouseMember(m); setSpouseId(m.id); }}
                        onClear={() => { setSpouseMember(null); setSpouseId(null); }}
                        placeholder="Search spouse in members..."
                      />
                      <Inp label="Wedding Date" value={memberForm.weddingDate} onChange={v => setM("weddingDate", v)} type="date" />
                    </>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-700">Cell</label>
                    <Select value={memberForm.cellId} onValueChange={v => setM("cellId", v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a cell..." />
                      </SelectTrigger>
                      <SelectContent className="max-h-64">
                        {cells.map(c => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            <span className="font-medium">{c.name}</span>
                            {(c.seniorCellName || c.pcfName) && (
                              <span className="text-gray-400 text-xs ml-1">
                                {c.seniorCellName && <> › {c.seniorCellName}</>}
                                {c.pcfName && <> › {c.pcfName}</>}
                              </span>
                            )}
                          </SelectItem>
                        ))}
                        {cells.length === 0 && (
                          <div className="px-3 py-4 text-center text-gray-400 text-sm">No cells available</div>
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Inp label="Phone 2" value={memberForm.phone2} onChange={v => setM("phone2", v)} type="tel" />
                    <Inp label="Email" value={memberForm.email} onChange={v => setM("email", v)} type="email" />
                  </div>
                  <Inp label="Occupation" value={memberForm.occupation} onChange={v => setM("occupation", v)} placeholder="e.g. Teacher, Nurse" />
                  <Inp label="Emergency Contact" value={memberForm.emergencyContact} onChange={v => setM("emergencyContact", v)} placeholder="Name and phone" />
                  <div className="grid grid-cols-2 gap-3">
                    <Inp label="Date of Birth" value={memberForm.dateOfBirth} onChange={v => setM("dateOfBirth", v)} type="date" />
                    <Inp label="Date Joined" value={memberForm.dateJoined} onChange={v => setM("dateJoined", v)} type="date" />
                  </div>
                  <Inp label="Foundation School Completion Date" value={memberForm.foundationSchoolDate} onChange={v => setM("foundationSchoolDate", v)} type="date" />
                  <label className="flex items-center gap-2 cursor-pointer py-1">
                    <input type="checkbox" checked={memberForm.isBaptized} onChange={e => setM("isBaptized", e.target.checked)} className="w-4 h-4 accent-purple-700" />
                    <span className="text-sm text-gray-700">Baptized</span>
                  </label>
                </>
              )}

              {/* ── CHILD FORM ── */}
              {regType === "child" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Inp label="First Name" value={childForm.firstName} onChange={v => setC("firstName", v)} required lettersOnly />
                    <Inp label="Last Name" value={childForm.lastName} onChange={v => setC("lastName", v)} required lettersOnly />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Sel label="Class" value={childForm.class} onChange={v => setC("class", v)}
                      options={CHILD_CLASSES} placeholder="Select class..." />
                    <Sel label="Gender" value={childForm.gender} onChange={v => setC("gender", v)}
                      options={[{ value: "male", label: "Male" }, { value: "female", label: "Female" }]} placeholder="Select..." />
                  </div>
                  <Inp label="Date of Birth" value={childForm.dateOfBirth} onChange={v => setC("dateOfBirth", v)} type="date" />

                  <ParentGuardianPicker
                    selectedParent={childSelectedParent}
                    onSelectParent={m => setChildSelectedParent(m)}
                    onClearParent={() => setChildSelectedParent(null)}
                    useExternal={childUseExternal}
                    onToggleExternal={() => {
                      setChildUseExternal(!childUseExternal);
                      setChildSelectedParent(null);
                      setChildParentExternal("");
                    }}
                    parentExternal={childParentExternal}
                    onParentExternalChange={setChildParentExternal}
                  />
                </>
              )}

              {/* ── TEEN FORM ── */}
              {regType === "teen" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Inp label="First Name" value={teenForm.firstName} onChange={v => setT("firstName", v)} required lettersOnly />
                    <Inp label="Last Name" value={teenForm.lastName} onChange={v => setT("lastName", v)} required lettersOnly />
                  </div>

                  {/* Gender toggle buttons (matching admin) */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-700">Gender</label>
                    <div className="flex gap-2">
                      {["male", "female"].map(g => (
                        <button key={g} type="button"
                          className={`flex-1 py-2 rounded-lg border text-sm font-medium capitalize transition-colors ${teenForm.gender === g ? "bg-purple-700 text-white border-purple-700" : "bg-white text-gray-700 border-gray-200 hover:border-purple-300"}`}
                          onClick={() => setT("gender", g)}>
                          {g}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Inp label="Phone 1" value={teenForm.phone1} onChange={v => setT("phone1", v)} type="tel" />
                    <Inp label="Phone 2" value={teenForm.phone2} onChange={v => setT("phone2", v)} type="tel" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Inp label="Date of Birth" value={teenForm.dateOfBirth} onChange={v => setT("dateOfBirth", v)} type="date" />
                    <Inp label="Date Joined" value={teenForm.dateJoined} onChange={v => setT("dateJoined", v)} type="date" />
                  </div>
                  <Inp label="Place of Residence" value={teenForm.placeOfResidence} onChange={v => setT("placeOfResidence", v)} />

                  <label className="flex items-center gap-2 cursor-pointer py-1">
                    <input type="checkbox" checked={teenForm.foundationSchoolCompleted}
                      onChange={e => setT("foundationSchoolCompleted", e.target.checked)} className="w-4 h-4 accent-purple-700" />
                    <span className="text-sm text-gray-700">Foundation School</span>
                  </label>
                  {teenForm.foundationSchoolCompleted && (
                    <Inp label="Foundation School Date" value={teenForm.foundationSchoolDate} onChange={v => setT("foundationSchoolDate", v)} type="date" />
                  )}

                  <ParentGuardianPicker
                    selectedParent={teenSelectedParent}
                    onSelectParent={m => setTeenSelectedParent(m)}
                    onClearParent={() => setTeenSelectedParent(null)}
                    useExternal={teenUseExternal}
                    onToggleExternal={() => {
                      setTeenUseExternal(!teenUseExternal);
                      setTeenSelectedParent(null);
                      setTeenParentExternal("");
                    }}
                    parentExternal={teenParentExternal}
                    onParentExternalChange={setTeenParentExternal}
                  />
                </>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>
              )}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setStep("welcome")}
                  className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors">
                  Back
                </button>
                <button type="submit"
                  className={`flex-1 py-3 rounded-xl text-white text-sm font-bold transition-colors ${
                    regType === "member" ? "bg-purple-600 hover:bg-purple-700" :
                    regType === "child" ? "bg-yellow-600 hover:bg-yellow-700" : "bg-blue-600 hover:bg-blue-700"
                  }`}>
                  Review &amp; Confirm →
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── REVIEW ── */}
        {step === "review" && (
          <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className={`px-5 py-4 ${
              regType === "member" ? "bg-purple-700" : regType === "child" ? "bg-yellow-600" : "bg-blue-700"
            }`}>
              <p className="text-white font-bold">Review Your Information</p>
              <p className="text-white/70 text-xs">Please check all details before submitting</p>
            </div>

            <div className="p-5 space-y-4">
              {regType === "member" && memberForm.profilePhoto && (
                <div className="flex justify-center py-2">
                  <img src={memberForm.profilePhoto} alt="Profile" className="w-24 h-24 rounded-full object-cover border-4 border-purple-100 shadow" />
                </div>
              )}

              {regType === "member" && (
                <div className="divide-y divide-gray-50">
                  {memberForm.title && <Field label="Title" value={memberForm.title} />}
                  <Field label="Full Name" value={`${memberForm.firstName} ${memberForm.lastName}`} />
                  <Field label="Gender" value={memberForm.gender === "male" ? "Male" : "Female"} />
                  <Field label="Phone 1" value={memberForm.phone1} />
                  <Field label="Residential Address" value={memberForm.residentialAddress} />
                  {memberForm.maritalStatus && <Field label="Marital Status" value={memberForm.maritalStatus.charAt(0).toUpperCase() + memberForm.maritalStatus.slice(1)} />}
                  {memberForm.maritalStatus === "married" && spouseMember && <Field label="Spouse" value={`${spouseMember.firstName} ${spouseMember.lastName}`} />}
                  {memberForm.weddingDate && <Field label="Wedding Date" value={fmtDate(memberForm.weddingDate)} />}
                  {selectedCell && <Field label="Cell" value={`${selectedCell.name}${selectedCell.seniorCellName ? ` › ${selectedCell.seniorCellName}` : ""}${selectedCell.pcfName ? ` › ${selectedCell.pcfName}` : ""}`} />}
                  {memberForm.phone2 && <Field label="Phone 2" value={memberForm.phone2} />}
                  {memberForm.email && <Field label="Email" value={memberForm.email} />}
                  {memberForm.occupation && <Field label="Occupation" value={memberForm.occupation} />}
                  {memberForm.emergencyContact && <Field label="Emergency Contact" value={memberForm.emergencyContact} />}
                  {memberForm.dateOfBirth && <Field label="Date of Birth" value={fmtDate(memberForm.dateOfBirth)} />}
                  {memberForm.dateJoined && <Field label="Date Joined" value={fmtDate(memberForm.dateJoined)} />}
                  {memberForm.foundationSchoolDate && <Field label="Foundation School" value={fmtDate(memberForm.foundationSchoolDate)} />}
                  <Field label="Baptized" value={memberForm.isBaptized ? "Yes" : "No"} />
                </div>
              )}

              {regType === "child" && (
                <div className="divide-y divide-gray-50">
                  <Field label="Full Name" value={`${childForm.firstName} ${childForm.lastName}`} />
                  <Field label="Class" value={CHILD_CLASSES.find(c => c.value === childForm.class)?.label ?? childForm.class} />
                  {childForm.gender && <Field label="Gender" value={childForm.gender === "male" ? "Male" : "Female"} />}
                  {childForm.dateOfBirth && <Field label="Date of Birth" value={fmtDate(childForm.dateOfBirth)} />}
                  {!childUseExternal && childSelectedParent && (
                    <Field label="Parent / Guardian" value={`${childSelectedParent.firstName} ${childSelectedParent.lastName}`} />
                  )}
                  {childUseExternal && childParentExternal && <Field label="Parent / Guardian" value={childParentExternal} />}
                  {!childUseExternal && childSelectedParent && <Field label="Parent Status" value="✓ Linked to member in database" />}
                </div>
              )}

              {regType === "teen" && (
                <div className="divide-y divide-gray-50">
                  <Field label="Full Name" value={`${teenForm.firstName} ${teenForm.lastName}`} />
                  {teenForm.gender && <Field label="Gender" value={teenForm.gender === "male" ? "Male" : "Female"} />}
                  {teenForm.phone1 && <Field label="Phone 1" value={teenForm.phone1} />}
                  {teenForm.phone2 && <Field label="Phone 2" value={teenForm.phone2} />}
                  {teenForm.dateOfBirth && <Field label="Date of Birth" value={fmtDate(teenForm.dateOfBirth)} />}
                  {teenForm.dateJoined && <Field label="Date Joined" value={fmtDate(teenForm.dateJoined)} />}
                  {teenForm.placeOfResidence && <Field label="Place of Residence" value={teenForm.placeOfResidence} />}
                  <Field label="Foundation School" value={teenForm.foundationSchoolCompleted ? "Completed" : "Not completed"} />
                  {teenForm.foundationSchoolCompleted && teenForm.foundationSchoolDate && (
                    <Field label="Foundation School Date" value={fmtDate(teenForm.foundationSchoolDate)} />
                  )}
                  {!teenUseExternal && teenSelectedParent && (
                    <Field label="Parent / Guardian" value={`${teenSelectedParent.firstName} ${teenSelectedParent.lastName}`} />
                  )}
                  {teenUseExternal && teenParentExternal && <Field label="Parent / Guardian" value={teenParentExternal} />}
                  {!teenUseExternal && teenSelectedParent && <Field label="Parent Status" value="✓ Linked to member in database" />}
                </div>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>
              )}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setStep("form"); setError(null); window.scrollTo(0, 0); }}
                  className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors flex items-center justify-center gap-1.5">
                  <ChevronLeft className="w-4 h-4" /> Edit
                </button>
                <button type="button" onClick={handleSubmit} disabled={submitting}
                  className={`flex-1 py-3 rounded-xl text-white text-sm font-bold transition-colors disabled:opacity-60 ${
                    regType === "member" ? "bg-purple-600 hover:bg-purple-700" :
                    regType === "child" ? "bg-yellow-600 hover:bg-yellow-700" : "bg-blue-600 hover:bg-blue-700"
                  }`}>
                  {submitting ? "Submitting..." : "Submit ✓"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── SUCCESS ── */}
        {step === "success" && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
              <div className="bg-green-600 px-5 py-4 flex items-center gap-3">
                <CheckCircle className="w-6 h-6 text-white" />
                <div>
                  <p className="text-white font-bold">Registration Successful!</p>
                  <p className="text-green-100 text-xs">
                    {regType === "member" ? "Your account has been created" : regType === "child" ? "Child registered successfully" : "Teen registered successfully"}
                  </p>
                </div>
              </div>

              {(regType === "member" || regType === "teen") && successData && (
                <div className="p-5 space-y-4">
                  <p className="text-sm text-gray-600 text-center font-medium">
                    Welcome, <strong>{successData.name}</strong>! Save your login details below.
                  </p>

                  <div className="bg-purple-50 border-2 border-purple-200 rounded-xl p-4 space-y-3">
                    <p className="text-xs font-bold text-purple-700 uppercase tracking-wide text-center">Your Login Details</p>
                    <div className="space-y-2">
                      <div className="bg-white rounded-lg px-4 py-3 border border-purple-200">
                        <p className="text-xs text-gray-400 mb-0.5">Membership ID (Username)</p>
                        <p className="text-lg font-black text-purple-800 font-mono tracking-wide">{successData.membershipId}</p>
                      </div>
                      <div className="bg-white rounded-lg px-4 py-3 border border-purple-200">
                        <p className="text-xs text-gray-400 mb-0.5">Login PIN (Password)</p>
                        <p className="text-3xl font-black text-purple-700 font-mono tracking-[0.3em]">{successData.pin}</p>
                      </div>
                    </div>
                    <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
                      <p className="text-xs text-orange-700 font-semibold text-center">
                        ⚠ Screenshot or save this page — you'll need these to log in!
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col items-center gap-2 py-2">
                    <p className="text-xs text-gray-500 font-medium">Your QR Code</p>
                    <div className="bg-white border-4 border-purple-100 rounded-2xl p-3 shadow-inner">
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(successData.membershipId)}&bgcolor=ffffff&color=4B0082&margin=4`}
                        alt={`QR Code for ${successData.membershipId}`}
                        className="w-40 h-40"
                        onError={e => (e.currentTarget.style.display = "none")}
                      />
                    </div>
                    <p className="text-xs text-gray-400">Scan to identify yourself at church events</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => downloadCredentials(successData)}
                      className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold transition-colors">
                      <Download className="w-4 h-4" /> Save as Text
                    </button>
                    <button onClick={handleCopy}
                      className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl border-2 border-purple-200 text-purple-700 text-sm font-bold hover:bg-purple-50 transition-colors">
                      <Copy className="w-4 h-4" /> {copied ? "Copied!" : "Copy All"}
                    </button>
                  </div>

                  <div className="flex items-center gap-3 bg-gray-50 rounded-xl p-4 border border-gray-100">
                    <LogIn className="w-5 h-5 text-purple-700 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800">Access Member Portal</p>
                      <p className="text-xs text-gray-500">Use your Membership ID &amp; PIN above</p>
                    </div>
                    <Link href="/login"
                      className="text-xs font-bold text-purple-600 bg-purple-50 border border-purple-200 rounded-lg px-3 py-1.5 hover:bg-purple-100 transition-colors flex-shrink-0">
                      Login →
                    </Link>
                  </div>
                </div>
              )}

              {regType === "child" && (
                <div className="p-5">
                  <div className="bg-green-50 rounded-xl p-4 border border-green-100 text-center space-y-1">
                    <p className="text-sm text-gray-700">
                      <strong>Child</strong> has been registered successfully in our database.
                    </p>
                    {successData?.membershipId && (
                      <p className="text-xs text-gray-500 font-mono">ID: {successData.membershipId}</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white/10 rounded-2xl p-4 space-y-2.5 border border-white/20">
              <p className="text-purple-200 text-xs font-semibold uppercase tracking-wide text-center">Register someone else?</p>
              {[
                { type: "child" as RegType, icon: <Baby className="w-5 h-5 text-yellow-300 flex-shrink-0" />, label: "Register a Child" },
                { type: "teen" as RegType, icon: <Smile className="w-5 h-5 text-blue-300 flex-shrink-0" />, label: "Register a Teen" },
                { type: "member" as RegType, icon: <User className="w-5 h-5 text-purple-300 flex-shrink-0" />, label: "Register Another Member" },
              ].map(({ type, icon, label }) => (
                <button key={type} onClick={() => handleAddAnother(type)}
                  className="w-full bg-white/15 hover:bg-white/25 border border-white/20 rounded-xl py-3 px-4 flex items-center gap-3 transition-colors text-white">
                  {icon}
                  <span className="text-sm font-medium">{label}</span>
                  <ArrowRight className="w-4 h-4 ml-auto text-white/50" />
                </button>
              ))}
            </div>

            <p className="text-center text-purple-300 text-xs pb-4">Christ Embassy Kumasi 1 — Registration Portal</p>
          </div>
        )}
      </div>
    </div>
  );
}
