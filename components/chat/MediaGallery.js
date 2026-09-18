'use client';

import { useState } from 'react';
import { EncryptedAudioLoader, EncryptedImage } from '@/components/chat/EncryptedMedia';

function MiniIcon({ kind }) {
  if (kind === 'audio') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V5l10-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/></svg>;
  if (kind === 'lock') return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="m21 15-5-5L5 20"/></svg>;
}

function GalleryImage({ item, privateKey, onJump }) {
  const content = item.content || {};
  return <article className="media-gallery-image-card">
    <div className="media-gallery-image-frame">
      {item.privateEncrypted ? <EncryptedImage src={item.imageUrl} cipher={item.mediaCipher} privateKey={privateKey} mime={content.image?.mime || 'image/jpeg'} alt={content.image?.name || 'تصویر خصوصی'}/> :
        <a href={item.imageUrl} target="_blank" rel="noreferrer"><img src={item.imageUrl} alt={item.imageName || 'تصویر چت'} loading="lazy"/></a>}
    </div>
    <button type="button" onClick={()=>onJump(item.id)}><b>{item.senderName || 'کاربر'}</b><small>{new Date(item.createdAt).toLocaleTimeString('fa-IR',{hour:'2-digit',minute:'2-digit'})}</small></button>
  </article>;
}

function GalleryAudio({ item, privateKey, onJump }) {
  const content = item.content || {};
  const duration = Number(content.audio?.durationMs || item.audioDurationMs || 0);
  const [loadPrivateAudio, setLoadPrivateAudio] = useState(false);
  return <article className="media-gallery-audio-card">
    <span className="media-gallery-audio-icon"><MiniIcon kind="audio"/></span>
    <div className="media-gallery-audio-main">
      <div><b>{item.senderName || 'کاربر'}</b><small>{duration ? `${Math.max(1,Math.round(duration/1000))} ثانیه` : 'ویس'}</small></div>
      {item.privateEncrypted ? (loadPrivateAudio ? <EncryptedAudioLoader src={item.audioUrl} cipher={item.mediaCipher} privateKey={privateKey} mime={content.audio?.mime || 'audio/webm'}>{({url,loading,error})=>url?<audio src={url} controls preload="metadata"/>:<span className={`media-gallery-audio-state ${error?'error':''}`}>{loading?'در حال بازکردن ویس خصوصی…':error?'ویس خصوصی باز نشد':'ویس خصوصی'}</span>}</EncryptedAudioLoader> : <button type="button" className="media-gallery-private-audio-load" onClick={()=>setLoadPrivateAudio(true)}><MiniIcon kind="lock"/><span>باز کردن ویس خصوصی</span></button>) : <audio src={item.audioUrl} controls preload="metadata"/>}
    </div>
    <button type="button" className="media-gallery-jump" onClick={()=>onJump(item.id)} aria-label="رفتن به پیام">↗</button>
  </article>;
}

export default function MediaGallery({ open, onClose, messages, decryptedById, privateKey, onJump }) {
  if (!open) return null;
  const enriched = (messages || []).map(message => ({ ...message, content: decryptedById?.[message.id] || null }));
  const images = enriched.filter(item => item.imageUrl);
  const audios = enriched.filter(item => item.audioUrl);
  const hasAny = images.length || audios.length;

  return <div className="chat-media-gallery" role="dialog" aria-modal="false" aria-label="گالری چت">
    <div className="chat-media-gallery-head"><div><b>رسانه‌های چت</b><small>{images.length} تصویر · {audios.length} ویس</small></div><button type="button" onClick={onClose} aria-label="بستن">×</button></div>
    {!hasAny ? <div className="chat-media-gallery-empty"><span><MiniIcon kind="image"/></span><b>هنوز رسانه‌ای نیست</b><small>تصاویر و ویس‌های همین چت بدون ساخت کپی جدا اینجا نمایش داده می‌شوند.</small></div> : <div className="chat-media-gallery-scroll">
      {images.length>0&&<section><div className="chat-media-section-title"><b>تصاویر</b><span>{images.length}</span></div><div className="media-gallery-grid">{images.slice().reverse().map(item=><GalleryImage key={item.id} item={item} privateKey={privateKey} onJump={onJump}/>)}</div></section>}
      {audios.length>0&&<section><div className="chat-media-section-title"><b>ویس‌ها</b><span>{audios.length}</span></div><div className="media-gallery-audio-list">{audios.slice().reverse().map(item=><GalleryAudio key={item.id} item={item} privateKey={privateKey} onJump={onJump}/>)}</div></section>}
    </div>}
  </div>;
}
