import styles from "@/components/LessonCard.module.css";

export interface LessonCardProps {
  title: string;
  subtitle: string;
  status: "done" | "learning" | "locked";
  current: number;
  total: number;
}

const RADIUS = 18;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function toPercent(current: number, total: number): number {
  if (!Number.isFinite(total) || total <= 0) {
    return 0;
  }
  const raw = Math.round((Math.max(current, 0) / total) * 100);
  return Math.max(0, Math.min(raw, 100));
}

function statusLabel(status: LessonCardProps["status"]): string {
  if (status === "done") {
    return "Hoàn thành";
  }
  if (status === "learning") {
    return "Đang học";
  }
  return "Chưa học";
}

function statusBadgeClass(status: LessonCardProps["status"]): string {
  if (status === "done") {
    return styles.badgeDone;
  }
  if (status === "learning") {
    return styles.badgeLearning;
  }
  return styles.badgeLocked;
}

function statusRingClass(status: LessonCardProps["status"]): string {
  if (status === "done") {
    return styles.ringProgressDone;
  }
  if (status === "learning") {
    return styles.ringProgressLearning;
  }
  return styles.ringProgressLocked;
}

export default function LessonCard({ title, subtitle, status, current, total }: LessonCardProps) {
  const percent = toPercent(current, total);
  const dashOffset = CIRCUMFERENCE - (percent / 100) * CIRCUMFERENCE;

  return (
    <article className={styles.card}>
      <div className={styles.header}>
        <div>
          <p className={styles.title}>{title}</p>
          <p className={styles.subtitle}>{subtitle}</p>
        </div>
        <span className={`${styles.badge} ${statusBadgeClass(status)}`}>{statusLabel(status)}</span>
      </div>

      <div className={styles.footer}>
        <p className={styles.progressCopy}>
          {Math.max(current, 0)}/{Math.max(total, 0)} mẫu
        </p>

        <div className={styles.ringWrap} aria-label={`Tiến độ ${percent}%`}>
          <svg className={styles.ringSvg} viewBox="0 0 46 46" role="img">
            <circle className={styles.ringTrack} cx="23" cy="23" r={RADIUS} />
            <circle
              className={`${styles.ringProgress} ${statusRingClass(status)}`}
              cx="23"
              cy="23"
              r={RADIUS}
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={dashOffset}
            />
          </svg>
          <span className={styles.ringPercent}>{percent}%</span>
        </div>
      </div>
    </article>
  );
}
