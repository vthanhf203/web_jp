import Link from "next/link";

type AdminSection = "home" | "vocab" | "grammar" | "kanji" | "quiz";

const links: Array<{ id: AdminSection; href: string; label: string }> = [
  { id: "home", href: "/admin", label: "Tong quan" },
  { id: "vocab", href: "/admin/vocab", label: "Tu vung" },
  { id: "grammar", href: "/admin/grammar", label: "Ngu phap" },
  { id: "kanji", href: "/admin/kanji", label: "Kanji" },
  { id: "quiz", href: "/admin/quiz", label: "Bai tap" },
];

type Props = {
  active: AdminSection;
};

export function AdminNav({ active }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {links.map((link) => (
        <Link
          key={link.id}
          href={link.href}
          className={`rounded-xl border px-4 py-2 text-sm font-semibold transition ${
            active === link.id
              ? "border-blue-300 bg-blue-100 text-blue-800"
              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          {link.label}
        </Link>
      ))}
    </div>
  );
}
