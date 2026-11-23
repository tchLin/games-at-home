import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// Explicitly opt-in troubleshooting. No analytics, network requests, room data,
// account data, form contents or audio are collected or transmitted.
export function readLayout() {
  const measure = (selector) => {
    const element = document.querySelector(selector);
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    const css = getComputedStyle(element);
    return {
      box: [rect.x, rect.y, rect.width, rect.height].map(Math.round),
      client: [element.clientWidth, element.clientHeight],
      scroll: [element.scrollWidth, element.scrollHeight],
      width: css.width, maxWidth: css.maxWidth, minWidth: css.minWidth,
      height: css.height, minHeight: css.minHeight,
      zoom: css.zoom, transform: css.transform, contain: css.contain,
      display: css.display, background: css.backgroundColor,
    };
  };
  return {
    check: 'viewport-1',
    browser: navigator.userAgent,
    inner: [innerWidth, innerHeight],
    outer: [outerWidth, outerHeight],
    screen: [screen.width, screen.height],
    availableScreen: [screen.availWidth, screen.availHeight],
    pixelRatio: devicePixelRatio,
    visualViewport: window.visualViewport ? {
      width: window.visualViewport.width, height: window.visualViewport.height,
      scale: window.visualViewport.scale, offsetLeft: window.visualViewport.offsetLeft, offsetTop: window.visualViewport.offsetTop,
    } : null,
    embedded: window.self !== window.top,
    stylesheet: [...document.styleSheets].map((sheet) => sheet.href ? new URL(sheet.href).pathname.split('/').pop() : 'inline'),
    html: measure('html'), body: measure('body'), root: measure('#root'), shell: measure('.page-shell'),
  };
}

export default function LayoutCheck() {
  const [report, setReport] = useState(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const refresh = () => setReport(readLayout());
    const frame = requestAnimationFrame(refresh);
    window.addEventListener('resize', refresh);
    window.visualViewport?.addEventListener('resize', refresh);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', refresh);
      window.visualViewport?.removeEventListener('resize', refresh);
    };
  }, []);
  const copy = async () => {
    const current = readLayout();
    setReport(current);
    try { await navigator.clipboard.writeText(JSON.stringify(current, null, 2)); setCopied(true); }
    catch { setCopied(false); }
  };
  return createPortal(<aside className="layout-check" aria-label="Display troubleshooting">
    <h2>Display check</h2>
    <p>Copy these measurements into our chat so I can identify the white border. No account, room, or recording data is included.</p>
    <button className="button" onClick={copy}>{copied ? 'Copied · paste into chat' : 'Copy display measurements'}</button>
    <details><summary>View measurements</summary><pre>{JSON.stringify(report, null, 2)}</pre></details>
    <a href={location.pathname}>Close display check</a>
  </aside>, document.body);
}
