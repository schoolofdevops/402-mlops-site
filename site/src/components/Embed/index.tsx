import React, { useRef, useCallback } from 'react';
import useBaseUrl from '@docusaurus/useBaseUrl';
import styles from './styles.module.css';

export interface EmbedProps {
  /** Path relative to site root, e.g. "sims/reconcile.html" */
  src: string;
  title?: string;
  /** aspect ratio, default 16/9 */
  ratio?: string;
}

/**
 * Embeds a self-contained interactive (served from /static/sims/) as a responsive
 * inline player with a toolbar: native fullscreen toggle + open-in-new-tab link.
 */
export default function Embed({ src, title = 'Interactive', ratio = '16 / 9' }: EmbedProps): JSX.Element {
  const url = useBaseUrl(src);
  const frameRef = useRef<HTMLDivElement>(null);

  const goFullscreen = useCallback(() => {
    const el = frameRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void el.requestFullscreen?.();
    }
  }, []);

  return (
    <div className={styles.box}>
      <div className={styles.bar}>
        <span className={styles.label}>🕹 {title}</span>
        <span className={styles.actions}>
          <button type="button" className={styles.btn} onClick={goFullscreen}>
            ⛶ Fullscreen
          </button>
          <a className={styles.full} href={url} target="_blank" rel="noopener noreferrer">
            Open in new tab ↗
          </a>
        </span>
      </div>
      <div ref={frameRef} className={styles.frame} style={{ aspectRatio: ratio }}>
        <iframe src={url} title={title} loading="lazy" allowFullScreen />
      </div>
    </div>
  );
}
