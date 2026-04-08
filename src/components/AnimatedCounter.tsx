import { useEffect, useRef, useState } from "react";
import { useInView, animate } from "framer-motion";

interface AnimatedCounterProps {
  value: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  className?: string;
}

export default function AnimatedCounter({ value, prefix = "", suffix = "", duration = 1.2, className = "" }: AnimatedCounterProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const [displayed, setDisplayed] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const controls = animate(0, value, {
      duration,
      ease: "easeOut",
      onUpdate: (v) => setDisplayed(Math.round(v)),
    });
    return () => controls.stop();
  }, [inView, value, duration]);

  return (
    <span ref={ref} className={className}>
      {prefix}{displayed.toLocaleString()}{suffix}
    </span>
  );
}
