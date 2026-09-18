'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

function roomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function normalizeRoomCode(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .trim()
    .replace(/[^\p{L}\p{N}_-]/gu, '')
    .slice(0, 48)
    .toUpperCase();
}

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [room, setRoom] = useState('');

  useEffect(() => {
    setRoom((current) => current || roomCode());
  }, []);

  function enter(e) {
    e.preventDefault();
    const safeRoom = normalizeRoomCode(room);
    const safeName = (name.trim() || 'مهمان').slice(0, 30);
    if (!safeRoom) return;

    // Some mobile/private browsers can block Web Storage. Never let that stop
    // navigation; only fall back to a one-time query value when storage fails.
    let storageWorked = false;
    try {
      sessionStorage.setItem('watch-name', safeName);
      localStorage.setItem('watch-name', safeName);
      storageWorked = sessionStorage.getItem('watch-name') === safeName;
    } catch {}

    const fallback = storageWorked ? '' : `?name=${encodeURIComponent(safeName)}`;
    router.push(`/room/${encodeURIComponent(safeRoom)}${fallback}`);
  }

  return (
    <main className="landing">
      <section className="hero-card">
        <div className="brand-mark"><span aria-hidden="true">PLAY</span></div>
        <p className="eyebrow">WATCH TOGETHER</p>
        <h1>فیلم رو باهم ببینید،<br/>حتی وقتی کنار هم نیستید.</h1>
        <p className="sub">اتاق خصوصی بساز، ویدیو رو همزمان پخش کن و وسط فیلم چت و ری‌اکشن بفرست.</p>
        <form onSubmit={enter} className="join-form">
          <label>اسم شما<input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلا صدرا" maxLength={30}/></label>
          <label>کد اتاق<input value={room} onChange={(e) => setRoom(normalizeRoomCode(e.target.value))} placeholder="مثلاً A1B2C3 یا 1" autoCapitalize="characters" autoCorrect="off" spellCheck={false} /></label>
          <button type="submit">ورود به اتاق <span>←</span></button>
        </form>
      </section>
    </main>
  );
}
