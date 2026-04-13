import type { ReactNode } from "react";

type Props = {
  title: string;
  subtitle?: string;
  children: ReactNode;
};

export function SectionCard({ title, subtitle, children }: Props) {
  return (
    <section className="panel p-5">
      <header>
        <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
        {subtitle ? (
          <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
        ) : null}
      </header>
      <div className="mt-4">{children}</div>
    </section>
  );
}
