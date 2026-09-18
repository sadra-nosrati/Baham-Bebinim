'use client';

import { useEffect, useRef, useState } from 'react';
import { decryptPrivateBytes } from '@/lib/privateRoomCrypto';

function useNearViewport(rootMargin = '240px') {
  const ref = useRef(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (ready) return;
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') { setReady(true); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setReady(true); observer.disconnect(); }
    }, { rootMargin });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ready, rootMargin]);
  return [ref, ready];
}

export function useEncryptedMediaUrl({ src, cipher, privateKey, mime = 'application/octet-stream', enabled = true }) {
  const [state, setState] = useState({ url: '', loading: false, error: '' });
  useEffect(() => {
    let disposed = false;
    let objectUrl = '';
    if (!enabled || !src || !cipher || !privateKey) {
      setState({ url: '', loading: false, error: enabled && src ? 'missing-key' : '' });
      return undefined;
    }
    setState({ url: '', loading: true, error: '' });
    (async () => {
      try {
        const response = await fetch(src, { cache: 'no-store', credentials: 'same-origin' });
        if (!response.ok) throw new Error(`media-${response.status}`);
        const encrypted = await response.arrayBuffer();
        const decrypted = await decryptPrivateBytes(privateKey, cipher, encrypted);
        if (disposed) return;
        objectUrl = URL.createObjectURL(new Blob([decrypted], { type: mime || 'application/octet-stream' }));
        setState({ url: objectUrl, loading: false, error: '' });
      } catch {
        if (!disposed) setState({ url: '', loading: false, error: 'decrypt-failed' });
      }
    })();
    return () => { disposed = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [src, cipher?.iv, cipher?.v, privateKey, mime, enabled]);
  return state;
}

export function EncryptedImage({ src, cipher, privateKey, mime, alt = 'تصویر خصوصی', className = '', fallback = null }) {
  const [wrapRef, near] = useNearViewport();
  const { url, loading, error } = useEncryptedMediaUrl({ src, cipher, privateKey, mime, enabled: near });
  return <span ref={wrapRef} className={`encrypted-image-wrap ${className}`.trim()}>
    {url ? <a href={url} target="_blank" rel="noreferrer" className="chat-image-link"><img className="chat-image" src={url} alt={alt} loading="lazy"/></a> :
      <span className={`private-media-placeholder ${error ? 'error' : ''}`}>{fallback || (loading ? 'در حال بازکردن تصویر خصوصی…' : error ? 'تصویر خصوصی باز نشد' : 'تصویر خصوصی')}</span>}
  </span>;
}

export function EncryptedAudioLoader({ src, cipher, privateKey, mime, children }) {
  const [wrapRef, near] = useNearViewport('320px');
  const state = useEncryptedMediaUrl({ src, cipher, privateKey, mime, enabled: near });
  return <div ref={wrapRef} className="encrypted-audio-wrap">{children(state)}</div>;
}
