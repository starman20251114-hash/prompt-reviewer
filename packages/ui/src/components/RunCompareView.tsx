import { useRef, useState } from "react";
import type { Run } from "../lib/api";
import styles from "./RunCompareView.module.css";

function getLastAssistantMessage(run: Run): string {
  return [...run.conversation].reverse().find((message) => message.role === "assistant")?.content ?? "";
}

export function diffLines(
  a: string,
  b: string,
): { type: "same" | "removed" | "added"; text: string }[] {
  const aLines = a.split("\n");
  const bLines = b.split("\n");
  const result: { type: "same" | "removed" | "added"; text: string }[] = [];

  const maxLen = Math.max(aLines.length, bLines.length);
  let ai = 0;
  let bi = 0;

  while (ai < aLines.length || bi < bLines.length) {
    const currentA = aLines[ai];
    const currentB = bLines[bi];

    if (currentA !== undefined && currentB !== undefined && currentA === currentB) {
      result.push({ type: "same", text: currentA });
      ai++;
      bi++;
    } else {
      const aRemainder = aLines.slice(ai);
      const bRemainder = bLines.slice(bi);

      let foundInA = -1;
      let foundInB = -1;
      const lookAhead = Math.min(5, maxLen);

      for (let d = 0; d < lookAhead; d++) {
        const candidateB = bRemainder[d];
        if (candidateB !== undefined && aRemainder.slice(0, lookAhead).includes(candidateB)) {
          foundInB = d;
          foundInA = aRemainder.indexOf(candidateB);
          break;
        }

        const candidateA = aRemainder[d];
        if (candidateA !== undefined && bRemainder.slice(0, lookAhead).includes(candidateA)) {
          foundInA = d;
          foundInB = bRemainder.indexOf(candidateA);
          break;
        }
      }

      if (foundInA > 0) {
        for (let i = 0; i < foundInA; i++) {
          const line = aRemainder[i];
          if (line !== undefined) {
            result.push({ type: "removed", text: line });
          }
        }
        ai += foundInA;
      } else if (foundInB > 0) {
        for (let i = 0; i < foundInB; i++) {
          const line = bRemainder[i];
          if (line !== undefined) {
            result.push({ type: "added", text: line });
          }
        }
        bi += foundInB;
      } else {
        if (currentA !== undefined) {
          result.push({ type: "removed", text: currentA });
          ai++;
        }
        if (currentB !== undefined) {
          result.push({ type: "added", text: currentB });
          bi++;
        }
      }
    }
  }

  return result;
}

type Props = {
  runA: Run;
  runB: Run;
  versionLabelA: string;
  versionLabelB: string;
  onClose: () => void;
};

export function RunCompareView({ runA, runB, versionLabelA, versionLabelB, onClose }: Props) {
  const [mode, setMode] = useState<"side-by-side" | "unified">("side-by-side");
  const scrollRefA = useRef<HTMLDivElement>(null);
  const scrollRefB = useRef<HTMLDivElement>(null);
  const isSyncing = useRef(false);

  function handleScrollA() {
    if (isSyncing.current || !scrollRefA.current || !scrollRefB.current) return;
    isSyncing.current = true;
    scrollRefB.current.scrollTop = scrollRefA.current.scrollTop;
    isSyncing.current = false;
  }

  function handleScrollB() {
    if (isSyncing.current || !scrollRefA.current || !scrollRefB.current) return;
    isSyncing.current = true;
    scrollRefA.current.scrollTop = scrollRefB.current.scrollTop;
    isSyncing.current = false;
  }

  const lastAssistantA = getLastAssistantMessage(runA);
  const lastAssistantB = getLastAssistantMessage(runB);
  const diff = diffLines(lastAssistantA, lastAssistantB);

  return (
    <div
      className={styles.overlay}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div className={styles.box}>
        <div className={styles.header}>
          <h3 className={styles.headerTitle}>Run 比較</h3>
          <div className={styles.headerActions}>
            <div className={styles.modeToggle}>
              {(["side-by-side", "unified"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`${styles.btnMode} ${mode === m ? styles.btnModeActive : styles.btnModeInactive}`}
                >
                  {m === "side-by-side" ? "並列" : "差分"}
                </button>
              ))}
            </div>
            <button type="button" onClick={onClose} className={styles.btnClose}>
              閉じる
            </button>
          </div>
        </div>

        <div className={styles.content}>
          {mode === "side-by-side" ? (
            <div className={styles.sideBySide}>
              <div className={`${styles.panel} ${styles.panelLeft}`}>
                <div className={`${styles.panelHeader} ${styles.panelHeaderA}`}>
                  <span>Run #{runA.id}</span>
                  <span className={styles.panelMeta}>{versionLabelA}</span>
                </div>
                <div ref={scrollRefA} className={styles.chatList} onScroll={handleScrollA}>
                  <div className={`${styles.bubbleWrapper} ${styles.bubbleWrapperAssistant}`}>
                    <span className={styles.bubbleRole}>Assistant</span>
                    <div className={`${styles.bubble} ${styles.bubbleAssistant}`}>{lastAssistantA}</div>
                  </div>
                </div>
              </div>
              <div className={styles.panel}>
                <div className={`${styles.panelHeader} ${styles.panelHeaderB}`}>
                  <span>Run #{runB.id}</span>
                  <span className={styles.panelMeta}>{versionLabelB}</span>
                </div>
                <div ref={scrollRefB} className={styles.chatList} onScroll={handleScrollB}>
                  <div className={`${styles.bubbleWrapper} ${styles.bubbleWrapperAssistant}`}>
                    <span className={styles.bubbleRole}>Assistant</span>
                    <div className={`${styles.bubble} ${styles.bubbleAssistant}`}>{lastAssistantB}</div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className={styles.unifiedView}>
              <div className={styles.unifiedHeader}>
                <span className={styles.unifiedLabelA}>ー Run #{runA.id}</span>
                <span className={styles.unifiedLabelB}>+ Run #{runB.id}</span>
              </div>
              <div className={styles.diffScroll}>
                {diff.map((line, i) => (
                  <div
                    key={`diff-${line.type}-${i}`}
                    className={`${styles.diffLine} ${
                      line.type === "removed"
                        ? styles.diffLineRemoved
                        : line.type === "added"
                          ? styles.diffLineAdded
                          : ""
                    }`}
                  >
                    <span className={styles.diffGutter}>
                      {line.type === "removed" ? "-" : line.type === "added" ? "+" : " "}
                    </span>
                    <span className={styles.diffText}>{line.text || "\u00a0"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
