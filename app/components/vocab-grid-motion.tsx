"use client";

import { Children } from "react";
import { motion } from "framer-motion";

type Props = {
  children: React.ReactNode;
};

const containerVariants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.055,
      delayChildren: 0.04,
    },
  },
} as const;

const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0 },
} as const;

export function VocabGridMotion({ children }: Props) {
  const items = Children.toArray(children);

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3"
    >
      {items.map((item, index) => (
        <motion.div
          key={index}
          variants={itemVariants}
          whileHover={{ y: -3 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          {item}
        </motion.div>
      ))}
    </motion.div>
  );
}

