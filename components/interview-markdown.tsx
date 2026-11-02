import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "./interview-markdown.module.css";

export function InterviewMarkdown({ children, compact = false }: { children: string; compact?: boolean }) {
  return <div className={`${styles.content}${compact ? ` ${styles.compact}` : ""}`}>
    <Markdown remarkPlugins={[remarkGfm]} components={{
      table: ({ children }) => <div className={styles.tableScroll}><table>{children}</table></div>,
    }}>{children}</Markdown>
  </div>;
}
