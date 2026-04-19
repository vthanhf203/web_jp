"use client";

import Link from "next/link";
import { motion, type Variants } from "framer-motion";

type GrammarPointCardItem = {
  id: string;
  href: string;
  order: number;
  title: string;
  meaning: string;
};

type GrammarPointCardsProps = {
  items: GrammarPointCardItem[];
};

const listVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.05,
    },
  },
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      type: "spring",
      stiffness: 220,
      damping: 22,
    },
  },
};

export default function GrammarPointCards({ items }: GrammarPointCardsProps) {
  return (
    <motion.div
      variants={listVariants}
      initial="hidden"
      animate="show"
      className="grid gap-4 md:grid-cols-2"
    >
      {items.map((point) => (
        <motion.div key={point.id} variants={cardVariants}>
          <Link
            href={point.href}
            className="group block rounded-2xl bg-white px-5 py-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all duration-300 hover:translate-x-2 hover:shadow-[0_16px_36px_rgb(99,102,241,0.12)]"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Mau {point.order}
            </p>
            <p className="mt-2 text-xl font-bold text-slate-800">
              {point.title || `Mau ${point.order}`}
            </p>
            {point.meaning ? (
              <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-slate-500">{point.meaning}</p>
            ) : (
              <p className="mt-2 text-sm leading-relaxed text-slate-400">Chua co mo ta ngan.</p>
            )}
          </Link>
        </motion.div>
      ))}
    </motion.div>
  );
}

