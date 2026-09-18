'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import Hls from 'hls.js';

const REACTIONS = ['😂','😱','❤️','🍿','🔥','😭','👀','👏','🎬','😍'];
const CHAT_EMOJIS = ['🍿','😂','😱','❤️','🔥','😭','👀','🎬','👏','😎','💀','😡','✨','🙈','😘','💋','😍','💕','💗','💖','😽','😻','🐱','🐈','😺','😸','😹','😿','🌹',':]',':['];
const ROLE_EMOJIS = ['', '❤️','⭐','🔥','🌙','🎬','🍿','👑','🌸','✨','💞','🎧','😈','💎','⚡','🌊','☕','🚀','🎮','😘','💋','😍','💕','💗','💖','😽','😻','🐱','🐈','😺','😸','😹','😿','🌹'];
const ROLE_COLORS = ['#ff5c7c','#ff9f43','#ffd166','#54d49a','#4dd0e1','#6c8cff','#b983ff','#f472b6','#7c4dff','#5bd0c5','#ff7a59','#8bd450','#f6a6ff','#7aa2ff'];
const CHAT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const CHAT_AUDIO_MAX_BYTES = 8 * 1024 * 1024;
const CHAT_VOICE_MAX_MS = 5 * 60 * 1000;

function Icon({ name, size = 20, strokeWidth = 1.9 }) {
  const common = { width:size, height:size, viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', strokeWidth, strokeLinecap:'round', strokeLinejoin:'round', 'aria-hidden':'true' };
  const paths = {
    play:<polygon points="6 4 20 12 6 20 6 4" fill="currentColor" stroke="none"/>,
    pause:<><rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/></>,
    volume:<><path d="M11 5 6.8 9H3v6h3.8L11 19V5Z"/><path d="M15 9.5a4 4 0 0 1 0 5"/><path d="M17.7 7a7.5 7.5 0 0 1 0 10"/></>,
    muted:<><path d="M11 5 6.8 9H3v6h3.8L11 19V5Z"/><path d="m16 10 5 5M21 10l-5 5"/></>,
    fullscreen:<><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/></>,
    panelClose:<><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 4v16"/><path d="m15 9-3 3 3 3"/></>,
    panelOpen:<><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 4v16"/><path d="m12 9 3 3-3 3"/></>,
    users:<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    copy:<><rect x="9" y="9" width="10" height="10" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></>,
    close:<><path d="m6 6 12 12M18 6 6 18"/></>,
    smile:<><circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/></>,
    send:<><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></>,
    chat:<><path d="M21 15a4 4 0 0 1-4 4H8l-5 3 1.5-5A7 7 0 0 1 3 13V8a5 5 0 0 1 5-5h9a4 4 0 0 1 4 4Z"/><path d="M8 10h.01M12 10h.01M16 10h.01"/></>,
    crown:<><path d="m3 7 4 4 5-7 5 7 4-4-2 11H5L3 7Z"/><path d="M5 21h14"/></>,
    user:<><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
    back:<><path d="m15 18-6-6 6-6"/></>,
    link:<><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.2"/><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.2"/></>,
    reactions:<><circle cx="12" cy="12" r="9"/><path d="M8.5 14.5c1 1 2.1 1.5 3.5 1.5s2.5-.5 3.5-1.5M9 9h.01M15 9h.01"/><path d="M18.5 4.5 20 3m-1.5 1.5L21 5"/></>,
    chevron:<path d="m8 10 4 4 4-4"/>,
    sync:<><path d="M20 7h-5V2"/><path d="M4 17h5v5"/><path d="M5.6 9a7.5 7.5 0 0 1 12.7-2L20 7"/><path d="M18.4 15a7.5 7.5 0 0 1-12.7 2L4 17"/></>,
    tag:<><path d="M20 13 13 20 4 11V4h7l9 9Z"/><circle cx="8.5" cy="8.5" r="1.2"/></>,
    check:<path d="m5 12 4 4L19 6"/>,
    bell:<><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
    trash:<><path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="m6 7 1 14h10l1-14"/><path d="M9 7V4h6v3"/></>,
    lock:<><rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><path d="M12 14v3"/></>,
    shield:<><path d="M12 3 19 6v5c0 4.7-2.8 8.2-7 10-4.2-1.8-7-5.3-7-10V6l7-3Z"/><path d="m9.5 12 1.6 1.6 3.7-4"/></>,
    userMinus:<><path d="M15 21v-2a6 6 0 0 0-12 0v2"/><circle cx="9" cy="7" r="4"/><path d="M17 11h5"/></>,
    more:<><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/></>,
    image:<><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="m21 15-5-5L5 20"/></>,
    camera:<><path d="M14.5 5 13 3h-2L9.5 5H6a3 3 0 0 0-3 3v9a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3V8a3 3 0 0 0-3-3h-3.5Z"/><circle cx="12" cy="12.5" r="3.5"/></>,
    mic:<><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/></>,
    doubleCheck:<><path d="m3.5 12 3.2 3.2L13 8.9"/><path d="m9.5 14.5 1.8 1.8L20.5 7"/></>,
    reply:<><path d="m9 17-5-5 5-5"/><path d="M4 12h9a7 7 0 0 1 7 7v1"/></>,
    bookmark:<><path d="M6 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v17l-6-4-6 4V4Z"/></>,
    history:<><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/></>,
  };
  return <svg {...common}>{paths[name] || paths.user}</svg>;
}

function formatClock(seconds) {
  if (!Number.isFinite(seconds)) return '00:00';
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}` : `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}
function formatTime(ms) { return new Intl.DateTimeFormat('fa-IR',{hour:'2-digit',minute:'2-digit'}).format(new Date(ms)); }
function displayHost(value) { try { return new URL(value).hostname.replace(/^www\./,''); } catch { return 'لینک ویدیو'; } }
function isHlsUrl(value) { return /\.m3u8($|\?)/i.test(String(value || '')); }
function qualityLabel(value) { const n=Number(value); return Number.isFinite(n)&&n>0?`${Math.round(n)}p`:'نامشخص'; }
function normalizedQualityOptions(values) { return [...new Set((Array.isArray(values)?values:[]).map(Number).filter(n=>Number.isFinite(n)&&n>=144&&n<=4320))].sort((a,b)=>a-b); }
function applyHlsQualityMode(hls, mode) {
  if(!hls)return;
  const levels=Array.isArray(hls.levels)?hls.levels:[];
  if(mode==='auto'){hls.currentLevel=-1;hls.nextLevel=-1;return;}
  if(!levels.length)return;
  let targetIndex=-1;
  for(let i=0;i<levels.length;i+=1){
    const height=Number(levels[i]?.height)||0;
    if(!height)continue;
    if(targetIndex<0){targetIndex=i;continue;}
    const current=Number(levels[targetIndex]?.height)||0;
    if((mode==='high'&&height>current)||(mode==='low'&&height<current))targetIndex=i;
  }
  if(targetIndex>=0){hls.currentLevel=targetIndex;hls.nextLevel=targetIndex;}
}
function typingLabel(users) {
  const names=(users||[]).map(item=>item.name).filter(Boolean);
  if(!names.length)return '';
  if(names.length===1)return `${names[0]} داره می‌نویسه`;
  if(names.length===2)return `${names[0]} و ${names[1]} دارن می‌نویسن`;
  return `${names[0]} و ${names.length-1} نفر دیگه دارن می‌نویسن`;
}

function imageMimeFromFile(file){
  const direct=String(file?.type||'').toLowerCase();
  if(direct.startsWith('image/'))return direct;
  const ext=String(file?.name||'').toLowerCase().match(/\.[a-z0-9]+$/)?.[0]||'';
  return ({'.jpg':'image/jpeg','.jpeg':'image/jpeg','.jfif':'image/jpeg','.png':'image/png','.gif':'image/gif','.webp':'image/webp','.avif':'image/avif','.heic':'image/heic','.heif':'image/heif','.bmp':'image/bmp','.tif':'image/tiff','.tiff':'image/tiff','.ico':'image/x-icon','.svg':'image/svg+xml'})[ext]||'';
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
function escapeRegExp(value){return String(value||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
function replyPreviewText(reply){
  if(!reply)return '';
  if(reply.text)return reply.text;
  if(reply.hasImage)return reply.imageName?`تصویر: ${reply.imageName}`:'تصویر';
  if(reply.hasAudio)return `ویس ${formatClock((Number(reply.audioDurationMs)||0)/1000)}`;
  return 'پیام';
}
function renderChatText(text,mentions,selfId){
  const source=String(text||'');
  const unique=[];
  const seen=new Set();
  for(const mention of Array.isArray(mentions)?mentions:[]){
    const token=`@${mention?.name||''}`;
    if(token.length<2||seen.has(token))continue;
    seen.add(token);
    unique.push({token,id:mention.id});
  }
  if(!unique.length)return source;
  unique.sort((a,b)=>b.token.length-a.token.length);
  const byToken=new Map(unique.map(item=>[item.token,item]));
  const regex=new RegExp(`(${unique.map(item=>escapeRegExp(item.token)).join('|')})`,'g');
  return source.split(regex).map((part,index)=>{
    const mention=byToken.get(part);
    return mention?<span key={`${mention.id}-${index}`} className={`chat-mention ${mention.id===selfId?'is-self':''}`}>{part}</span>:part;
  });
}

function preferredVoiceMime(){
  if(typeof MediaRecorder==='undefined')return '';
  const types=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus','audio/webm'];
  return types.find(type=>MediaRecorder.isTypeSupported?.(type))||'';
}
function VoiceMessage({src,durationMs=0}){
  const audioRef=useRef(null);
  const [playing,setVoicePlaying]=useState(false), [time,setVoiceTime]=useState(0), [voiceDuration,setVoiceDuration]=useState(Math.max(0,Number(durationMs)||0)/1000);
  useEffect(()=>{setVoicePlaying(false);setVoiceTime(0);setVoiceDuration(Math.max(0,Number(durationMs)||0)/1000)},[src,durationMs]);
  function toggle(){const audio=audioRef.current;if(!audio)return;if(audio.paused)audio.play().catch(()=>{});else audio.pause();}
  function seek(value){const audio=audioRef.current;if(!audio)return;const next=Number(value)||0;audio.currentTime=next;setVoiceTime(next);}
  return <div className="chat-voice-player" dir="ltr">
    <button type="button" className="chat-voice-play" onClick={toggle} aria-label={playing?'توقف ویس':'پخش ویس'}><Icon name={playing?'pause':'play'} size={17}/></button>
    <div className="chat-voice-track"><input type="range" min="0" max={Math.max(voiceDuration,0.1)} step="0.05" value={Math.min(time,voiceDuration||0)} onChange={e=>seek(e.target.value)}/><span>{formatClock(playing?time:voiceDuration)}</span></div>
    <Icon name="mic" size={15}/>
    <audio ref={audioRef} src={src} preload="metadata" onLoadedMetadata={e=>setVoiceDuration(Number.isFinite(e.currentTarget.duration)?e.currentTarget.duration:voiceDuration)} onTimeUpdate={e=>setVoiceTime(e.currentTarget.currentTime||0)} onPlay={()=>setVoicePlaying(true)} onPause={()=>setVoicePlaying(false)} onEnded={()=>{setVoicePlaying(false);setVoiceTime(0)}}/>
  </div>;
}

export default function WatchRoom({ roomId, initialName = '' }) {
  const videoRef = useRef(null), hlsRef = useRef(null), socketRef = useRef(null), messagesRef = useRef(null), chatInputRef = useRef(null), imageInputRef = useRef(null), cameraInputRef=useRef(null);
  const timelineWrapRef=useRef(null), timelinePreviewVideoRef=useRef(null), timelinePreviewHlsRef=useRef(null), previewSeekPendingRef=useRef(0), previewSeekTimerRef=useRef(null), previewLastSeekAtRef=useRef(0), timelineLongPressRef=useRef({timer:null,active:false,startX:0});
  const voiceRecorderRef=useRef(null), voiceStreamRef=useRef(null), voiceChunksRef=useRef([]), voiceStartAtRef=useRef(0), voiceTimerRef=useRef(null), voiceAutoStopRef=useRef(null), voiceHoldRef=useRef(false), voiceCancelRef=useRef(false), voiceStartXRef=useRef(0);
  const pendingImageUrlRef=useRef(''), reportedSeenRef=useRef(new Set());
  const ignoringRemote = useRef(false), chatOpenRef = useRef(false), pendingPlaybackRef = useRef(null), clockOffsetRef = useRef(0), clockReadyRef = useRef(false);
  const fullscreenIdleTimerRef = useRef(null), desktopIdleTimerRef=useRef(null), volumeHoverCloseRef=useRef(null), presenceTimerRef=useRef(null), controlsVisibleRef = useRef(true), swallowedStageTapRef = useRef(false), viewportBaseHeightRef = useRef(0), viewportOrientationRef = useRef(''), controlsBlockerRef=useRef(false);
  const typingIdleTimerRef=useRef(null), lastTypingEmitRef=useRef(0), typingTimersRef=useRef(new Map()), joinPasswordRef=useRef(''), joinRoomRef=useRef(null), qualityModeRef=useRef('auto');
  const [selfId,setSelfId]=useState('');
  const [room,setRoom]=useState({hostId:null,videoUrl:'',originalUrl:'',provider:'direct',videoTitle:'',qualityMode:'auto',qualityOptions:[],playback:{playing:false,time:0,rate:1},members:[],roles:[],videoSuggestions:[],passwordProtected:false,messages:[]});
  const [message,setMessage]=useState(''), [chatOpen,setChatOpen]=useState(false), [showMembers,setShowMembers]=useState(false), [showEmojiTray,setShowEmojiTray]=useState(false);
  const [showReactions,setShowReactions]=useState(false), [showVolume,setShowVolume]=useState(false), [showQuality,setShowQuality]=useState(false), [showSource,setShowSource]=useState(false), [showLeaveConfirm,setShowLeaveConfirm]=useState(false);
  const [showPlaybackRequest,setShowPlaybackRequest]=useState(false), [requestCooldownUntil,setRequestCooldownUntil]=useState(0), [requestCooldownLeft,setRequestCooldownLeft]=useState(0), [hostPlaybackRequest,setHostPlaybackRequest]=useState(null);
  const [showRoleManager,setShowRoleManager]=useState(false), [roleTarget,setRoleTarget]=useState(null), [newRoleName,setNewRoleName]=useState('');
  const [showSavedVideos,setShowSavedVideos]=useState(false), [savedVideos,setSavedVideos]=useState([]), [savedVideoBusy,setSavedVideoBusy]=useState(''), [savingProgress,setSavingProgress]=useState(false);
  const [newRoleEmoji,setNewRoleEmoji]=useState('❤️'), [newRoleColor,setNewRoleColor]=useState('#ff5c7c');
  const [videoInput,setVideoInput]=useState(''), [suggestionInput,setSuggestionInput]=useState(''), [resolvingSuggestionId,setResolvingSuggestionId]=useState(''), [connected,setConnected]=useState(false), [reactions,setReactions]=useState([]), [unread,setUnread]=useState(0), [uploadingImage,setUploadingImage]=useState(false);
  const [showImageSource,setShowImageSource]=useState(false), [pendingImage,setPendingImage]=useState(null), [imageCaption,setImageCaption]=useState('');
  const [voiceRecording,setVoiceRecording]=useState(false), [voiceDurationMs,setVoiceDurationMs]=useState(0), [voiceCancelArmed,setVoiceCancelArmed]=useState(false), [voiceSending,setVoiceSending]=useState(false);
  const [pageVisible,setPageVisible]=useState(true), [desktopChatVisible,setDesktopChatVisible]=useState(false);
  const [timelinePreview,setTimelinePreview]=useState({visible:false,time:0,left:60}), [timelinePreviewActivated,setTimelinePreviewActivated]=useState(false);
  const [needsGesture,setNeedsGesture]=useState(false), [notice,setNotice]=useState(''), [presenceNotice,setPresenceNotice]=useState(null), [resolving,setResolving]=useState(false), [pseudoFullscreen,setPseudoFullscreen]=useState(false);
  const [fullscreenActive,setFullscreenActive]=useState(false), [controlsVisible,setControlsVisible]=useState(true), [desktopControlsVisible,setDesktopControlsVisible]=useState(true), [fullscreenChatCollapsed,setFullscreenChatCollapsed]=useState(false), [keyboardOpen,setKeyboardOpen]=useState(false);
  const [typingUsers,setTypingUsers]=useState([]), [passwordRequired,setPasswordRequired]=useState(false), [joinPassword,setJoinPassword]=useState(''), [passwordError,setPasswordError]=useState('');
  const [showRoomSecurity,setShowRoomSecurity]=useState(false), [roomPassword,setRoomPassword]=useState(''), [savingPassword,setSavingPassword]=useState(false);
  const [memberActionTarget,setMemberActionTarget]=useState(null), [memberActionBusy,setMemberActionBusy]=useState(false);
  const [replyTo,setReplyTo]=useState(null), [mentionState,setMentionState]=useState(null), [selectedMentionIds,setSelectedMentionIds]=useState([]), [mentionIndex,setMentionIndex]=useState(0), [sendingMessage,setSendingMessage]=useState(false);
  const [playing,setPlaying]=useState(false), [currentTime,setCurrentTime]=useState(0), [duration,setDuration]=useState(0), [volume,setVolume]=useState(1), [muted,setMuted]=useState(false), [rate,setRate]=useState(1), [detectedQuality,setDetectedQuality]=useState(0);
  const isHost=Boolean(selfId&&room.hostId===selfId);
  const selfMember=(room.members||[]).find(member=>member.id===selfId);
  const isAdmin=Boolean(selfMember?.isAdmin);
  const canModerate=isHost||isAdmin;
  const roleMap=useMemo(()=>new Map((room.roles||[]).map(role=>[role.id,role])),[room.roles]);
  const mentionCandidates=useMemo(()=>{
    if(!mentionState)return [];
    const query=String(mentionState.query||'').trim().toLocaleLowerCase('fa');
    return (room.members||[])
      .filter(member=>member.id!==selfId)
      .filter(member=>!query||String(member.name||'').toLocaleLowerCase('fa').includes(query))
      .slice(0,6);
  },[mentionState,room.members,selfId]);
  const videoSuggestions=room.videoSuggestions||[];
  const qualityOptions=normalizedQualityOptions(room.qualityOptions);
  const qualityMode=room.qualityMode||'auto';
  const qualityMin=qualityOptions[0]||0, qualityMax=qualityOptions[qualityOptions.length-1]||0;
  const isiOS=useMemo(()=>typeof navigator!=='undefined'&&/iPad|iPhone|iPod/.test(navigator.userAgent),[]);

  const showNotice=useCallback((text)=>{ setNotice(text); clearTimeout(showNotice.timer); showNotice.timer=setTimeout(()=>setNotice(''),2400); },[]);
  const applyRemotePlayback=useCallback(async(playback)=>{
    const video=videoRef.current;
    if(!video||!playback)return;
    pendingPlaybackRef.current=playback;
    ignoringRemote.current=true;

    const baseRate=Number.isFinite(playback.rate)?playback.rate:1;
    const estimatedServerNow=clockReadyRef.current?Date.now()+clockOffsetRef.current:null;
    const elapsed=playback.playing&&estimatedServerNow!==null&&Number.isFinite(playback.updatedAt)
      ?Math.max(0,Math.min(5,(estimatedServerNow-playback.updatedAt)/1000))
      :0;
    const expected=Math.max(0,playback.time+elapsed*baseRate);
    const drift=expected-video.currentTime;
    const absDrift=Math.abs(drift);

    if(!playback.playing){
      if(absDrift>.12)video.currentTime=expected;
      if(Math.abs(video.playbackRate-baseRate)>.001)video.playbackRate=baseRate;
    }else if(absDrift>.35){
      video.currentTime=expected;
      if(Math.abs(video.playbackRate-baseRate)>.001)video.playbackRate=baseRate;
    }else if(absDrift>.08){
      const correction=Math.max(.96,Math.min(1.04,1+drift*.16));
      const correctedRate=Math.max(.5,Math.min(2,baseRate*correction));
      if(Math.abs(video.playbackRate-correctedRate)>.002)video.playbackRate=correctedRate;
    }else if(Math.abs(video.playbackRate-baseRate)>.002){
      video.playbackRate=baseRate;
    }

    try{
      if(playback.playing&&video.paused){await video.play();setNeedsGesture(false)}
      else if(!playback.playing&&!video.paused)video.pause();
    }catch{ if(playback.playing)setNeedsGesture(true); }
    setPlaying(playback.playing);
    setCurrentTime(expected);
    setRate(baseRate);
    setTimeout(()=>{ignoringRemote.current=false},120);
  },[]);

  const emitPlaybackSnapshot=useCallback(()=>{
    const v=videoRef.current;
    if(!isHost||!v||ignoringRemote.current)return;
    socketRef.current?.emit('playback:update',{
      playing:!v.paused,
      time:v.currentTime,
      rate:v.playbackRate,
      sampledAt:clockReadyRef.current?Date.now()+clockOffsetRef.current:null,
    });
  },[isHost]);

  useEffect(()=>{chatOpenRef.current=chatOpen},[chatOpen]);
  useEffect(()=>{controlsBlockerRef.current=Boolean(chatOpen||showMembers||showReactions||showVolume||showQuality||showPlaybackRequest||showSource||showRoomSecurity||showRoleManager||showSavedVideos||showLeaveConfirm||needsGesture);},[chatOpen,showMembers,showReactions,showVolume,showQuality,showPlaybackRequest,showSource,showRoomSecurity,showRoleManager,showLeaveConfirm,showSavedVideos,needsGesture]);
  useEffect(()=>{qualityModeRef.current=room.qualityMode||'auto';if(hlsRef.current)applyHlsQualityMode(hlsRef.current,qualityModeRef.current)},[room.qualityMode]);

  const revealDesktopControls=useCallback(()=>{
    if(typeof window==='undefined')return;
    setDesktopControlsVisible(true);
    clearTimeout(desktopIdleTimerRef.current);
    const hideWhenIdle=()=>{
      if(controlsBlockerRef.current){
        desktopIdleTimerRef.current=setTimeout(hideWhenIdle,700);
        return;
      }
      setDesktopControlsVisible(false);
    };
    desktopIdleTimerRef.current=setTimeout(hideWhenIdle,5000);
  },[]);

  useEffect(()=>{if(room.videoUrl)revealDesktopControls();},[room.videoUrl,revealDesktopControls]);

  useEffect(()=>{
    if(typeof window==='undefined')return;
    const media=window.matchMedia?.('(hover:hover) and (pointer:fine)');
    const syncDesktopControls=()=>{
      clearTimeout(desktopIdleTimerRef.current);
      revealDesktopControls();
    };
    syncDesktopControls();
    media?.addEventListener?.('change',syncDesktopControls);
    window.addEventListener('resize',syncDesktopControls);
    return()=>{
      media?.removeEventListener?.('change',syncDesktopControls);
      window.removeEventListener('resize',syncDesktopControls);
      clearTimeout(desktopIdleTimerRef.current);
    };
  },[revealDesktopControls]);

  const revealFullscreenControls=useCallback(()=>{
    controlsVisibleRef.current=true;
    setControlsVisible(true);
    clearTimeout(fullscreenIdleTimerRef.current);
    if(!fullscreenActive)return;
    fullscreenIdleTimerRef.current=setTimeout(()=>{
      if(chatOpenRef.current||needsGesture||showMembers||showReactions||showVolume||showQuality||showPlaybackRequest||showSource||showRoomSecurity||showRoleManager||showSavedVideos||showLeaveConfirm)return;
      controlsVisibleRef.current=false;
      setControlsVisible(false);
    },5000);
  },[fullscreenActive,needsGesture,showMembers,showReactions,showVolume,showQuality,showPlaybackRequest,showSource,showRoleManager,showSavedVideos,showLeaveConfirm]);

  useEffect(()=>{
    const syncFullscreenState=()=>{
      const shell=document.getElementById('watch-shell');
      const nativeFullscreen=document.fullscreenElement===shell||document.webkitFullscreenElement===shell;
      const active=Boolean(nativeFullscreen||pseudoFullscreen);
      setFullscreenActive(active);
      controlsVisibleRef.current=true;
      setControlsVisible(true);
      clearTimeout(fullscreenIdleTimerRef.current);
      if(active){
        fullscreenIdleTimerRef.current=setTimeout(()=>{
          if(!chatOpenRef.current&& !needsGesture){controlsVisibleRef.current=false;setControlsVisible(false);}
        },5000);
      }
    };
    document.addEventListener('fullscreenchange',syncFullscreenState);
    document.addEventListener('webkitfullscreenchange',syncFullscreenState);
    syncFullscreenState();
    return()=>{
      document.removeEventListener('fullscreenchange',syncFullscreenState);
      document.removeEventListener('webkitfullscreenchange',syncFullscreenState);
      clearTimeout(fullscreenIdleTimerRef.current);
    };
  },[pseudoFullscreen,needsGesture]);

  useEffect(()=>{
    if(!fullscreenActive){
      setFullscreenChatCollapsed(false);
      return;
    }
    revealFullscreenControls();
  },[fullscreenActive,chatOpen,showMembers,showReactions,showVolume,showPlaybackRequest,showSource,showRoleManager,showSavedVideos,showLeaveConfirm,needsGesture,revealFullscreenControls]);

  useEffect(()=>{
    if(typeof window==='undefined')return;
    const shell=document.getElementById('watch-shell');
    const vv=window.visualViewport;
    if(!shell)return;
    viewportOrientationRef.current=window.innerWidth>window.innerHeight?'landscape':'portrait';
    viewportBaseHeightRef.current=Math.max(window.innerHeight||0,document.documentElement.clientHeight||0,vv?.height||0);
    const updateViewport=()=>{
      const visualHeight=vv?.height||window.innerHeight||0;
      const visualTop=vv?.offsetTop||0;
      const activeElement=document.activeElement;
      const activeChatInput=activeElement===chatInputRef.current||Boolean(activeElement?.matches?.('input,textarea')&&activeElement?.closest?.('.chat-panel'));
      const layoutHeight=Math.max(window.innerHeight||0,document.documentElement.clientHeight||0);
      const candidate=Math.max(layoutHeight,visualHeight+visualTop);
      const orientation=window.innerWidth>window.innerHeight?'landscape':'portrait';
      if(!activeChatInput&&orientation!==viewportOrientationRef.current){viewportOrientationRef.current=orientation;viewportBaseHeightRef.current=candidate;}
      else if(!activeChatInput)viewportBaseHeightRef.current=Math.max(viewportBaseHeightRef.current,candidate,visualHeight);
      // Use the CURRENT layout viewport instead of the historical tallest viewport.
      // Mobile address-bar changes otherwise look like extra keyboard height and create a large gap.
      const visualBottomInset=Math.max(0,layoutHeight-(visualTop+visualHeight));
      const keyboardInset=activeChatInput?visualBottomInset:0;
      shell.style.setProperty('--vv-height',`${visualHeight}px`);
      shell.style.setProperty('--vv-top',`${visualTop}px`);
      shell.style.setProperty('--vv-bottom-edge',`${visualBottomInset}px`);
      shell.style.setProperty('--vv-bottom',`${keyboardInset}px`);
      shell.style.setProperty('--keyboard-inset',`${keyboardInset}px`);
      setKeyboardOpen(Boolean(activeChatInput));
    };
    updateViewport();
    const onFocusChange=()=>{requestAnimationFrame(updateViewport);setTimeout(updateViewport,180);};
    vv?.addEventListener('resize',updateViewport);
    vv?.addEventListener('scroll',updateViewport);
    window.addEventListener('resize',updateViewport);
    window.addEventListener('orientationchange',updateViewport);
    document.addEventListener('focusin',onFocusChange);
    document.addEventListener('focusout',onFocusChange);
    return()=>{
      vv?.removeEventListener('resize',updateViewport);
      vv?.removeEventListener('scroll',updateViewport);
      window.removeEventListener('resize',updateViewport);
      window.removeEventListener('orientationchange',updateViewport);
      document.removeEventListener('focusin',onFocusChange);
      document.removeEventListener('focusout',onFocusChange);
    };
  },[]);

  useEffect(()=>{
    const socket=io({transports:['polling'],upgrade:false,reconnection:true,reconnectionAttempts:Infinity,reconnectionDelay:700,timeout:10000});
    socketRef.current=socket;
    let storedName='';
    let clientKey='';
    try{
      storedName=sessionStorage.getItem('baham-bebinim-name')||localStorage.getItem('baham-bebinim-name')||sessionStorage.getItem('watch-name')||localStorage.getItem('watch-name')||'';
      clientKey=localStorage.getItem('baham-bebinim-client-id')||sessionStorage.getItem('baham-bebinim-client-id')||localStorage.getItem('watch-client-id')||sessionStorage.getItem('watch-client-id')||'';
    }catch{}
    const name=(initialName||storedName||'مهمان').trim().slice(0,30)||'مهمان';
    if(!clientKey)clientKey=globalThis.crypto?.randomUUID?.().replace(/-/g,'')||`c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,10)}`;
    try{localStorage.setItem('baham-bebinim-client-id',clientKey);sessionStorage.setItem('baham-bebinim-client-id',clientKey);}catch{}
    let disposed=false;

    function clockSample(){
      return new Promise(resolve=>{
        const sent=Date.now();
        let settled=false;
        const timer=setTimeout(()=>{if(!settled){settled=true;resolve(null)}},1400);
        socket.emit('clock:ping',(payload)=>{
          if(settled)return;
          settled=true;
          clearTimeout(timer);
          const received=Date.now();
          const serverNow=Number(payload?.serverNow);
          if(!Number.isFinite(serverNow))return resolve(null);
          const rtt=received-sent;
          resolve({rtt,offset:serverNow-((sent+received)/2)});
        });
      });
    }

    async function calibrateClock(samples=3){
      const results=(await Promise.all(Array.from({length:samples},()=>clockSample()))).filter(Boolean);
      if(!results.length||disposed)return;
      results.sort((a,b)=>a.rtt-b.rtt);
      clockOffsetRef.current=results[0].offset;
      clockReadyRef.current=true;
    }

    function joinRoom(passwordValue=joinPasswordRef.current){
      if(disposed||!socket.connected)return;
      const normalizedRoom=normalizeRoomCode(roomId);
      socket.timeout(5000).emit('room:probe',{roomId:normalizedRoom},(probeErr,probe)=>{
        if(disposed)return;
        if(probeErr||!probe?.ok){
          const wait=probe?.error==='rate-limit'?3000:1800;
          showNotice(probe?.error==='rate-limit'?'درخواست‌ها زیاد شده؛ چند لحظه صبر کن':'بررسی اتاق انجام نشد؛ دوباره تلاش می‌کنم');
          setTimeout(()=>{if(!disposed&&socket.connected)joinRoom(passwordValue)},wait);
          return;
        }
        if(probe.passwordRequired&&!passwordValue){
          setPasswordRequired(true);
          setPasswordError('');
          return;
        }
        socket.timeout(6000).emit('room:join',{roomId:normalizedRoom,name,clientKey,password:passwordValue},(err,result)=>{
          if(disposed)return;
          if(result?.error==='password-required'||result?.error==='invalid-password'){
            setPasswordRequired(true);
            setPasswordError(result.error==='invalid-password'?'رمز اتاق درست نیست':'این اتاق رمز دارد');
            return;
          }
          if(err||!result?.ok){
            if(result?.error==='room-full'){showNotice('ظرفیت این اتاق تکمیل شده');return;}
            if(result?.error==='server-busy'){showNotice('سرور فعلاً شلوغه؛ چند لحظه بعد دوباره وارد شو');return;}
            const wait=result?.error==='rate-limit'?3500:1800;
            showNotice(result?.error==='rate-limit'?'درخواست‌ها زیاد شده؛ چند لحظه صبر کن':'اتصال اتاق کامل نشد؛ دوباره تلاش می‌کنم');
            setTimeout(()=>{if(!disposed&&socket.connected)joinRoom(passwordValue)},wait);
            return;
          }
          joinPasswordRef.current=passwordValue||'';
          setPasswordRequired(false);
          setPasswordError('');
          setJoinPassword('');
          setSelfId(result.selfId);
          setRoom(result.room);
          setVideoInput(result.room.originalUrl||result.room.videoUrl||'');
          pendingPlaybackRef.current=result.room.playback;
          socket.emit('saved-video:list',(savedResult)=>{if(!disposed&&savedResult?.ok)setSavedVideos(Array.isArray(savedResult.items)?savedResult.items:[]);});
          calibrateClock(3).then(()=>{
            if(!disposed&&socket.connected)socket.emit('playback:request-sync');
          });
        });
      });
    }
    joinRoomRef.current=joinRoom;

    socket.on('connect',()=>{setConnected(true);joinRoom();});
    socket.on('server:busy',()=>showNotice('سرور فعلاً ظرفیت اتصال جدید نداره؛ چند لحظه بعد دوباره امتحان کن'));
    socket.on('disconnect',()=>setConnected(false));
    socket.on('room:state',(next)=>{setRoom(next);pendingPlaybackRef.current=next.playback;});
    socket.on('room:video',(data)=>{setRoom(prev=>({...prev,...data}));setVideoInput(data.originalUrl||data.videoUrl);pendingPlaybackRef.current=data.playback;setNeedsGesture(false);});
    socket.on('playback:sync',(playback)=>{setRoom(prev=>({...prev,playback}));applyRemotePlayback(playback);});
    socket.on('chat:message',(msg)=>{setRoom(prev=>({...prev,messages:[...prev.messages,msg].slice(-150)}));if(!chatOpenRef.current)setUnread(n=>n+1);});
    socket.on('chat:seen',(payload)=>{const ids=new Set(payload?.ids||[]);if(!ids.size)return;setRoom(prev=>({...prev,messages:(prev.messages||[]).map(msg=>ids.has(msg.id)?{...msg,seen:true}:msg)}));});
    socket.on('chat:prune',(payload)=>{const ids=new Set(payload?.ids||[]);if(!ids.size)return;setRoom(prev=>({...prev,messages:(prev.messages||[]).filter(msg=>!ids.has(msg.id))}));});
    socket.on('chat:typing',(payload)=>{
      const id=String(payload?.senderId||'');
      if(!id||id===socket.id)return;
      const clearUser=()=>setTypingUsers(prev=>prev.filter(item=>item.id!==id));
      clearTimeout(typingTimersRef.current.get(id));
      if(!payload?.typing){typingTimersRef.current.delete(id);clearUser();return;}
      setTypingUsers(prev=>[...prev.filter(item=>item.id!==id),{id,name:String(payload?.senderName||'مهمان').slice(0,30)}].slice(-3));
      const timer=setTimeout(()=>{typingTimersRef.current.delete(id);clearUser();},2600);
      typingTimersRef.current.set(id,timer);
    });
    socket.on('reaction:show',(r)=>{const item={...r,lane:Math.floor(Math.random()*72)+8};setReactions(prev=>[...prev.slice(-16),item]);setTimeout(()=>setReactions(prev=>prev.filter(x=>x.id!==item.id)),2200);});
    socket.on('room:presence',(payload)=>{
      const type=payload?.type==='leave'?'leave':'join';
      const memberName=String(payload?.memberName||'یک نفر').slice(0,30);
      clearTimeout(presenceTimerRef.current);
      setPresenceNotice({type,memberName});
      presenceTimerRef.current=setTimeout(()=>setPresenceNotice(null),3200);
    });
    socket.on('room:kicked',()=>{showNotice('از اتاق خارج شدی');setTimeout(()=>{window.location.href='/'},900);});
    socket.on('playback:action-request',(request)=>{setHostPlaybackRequest(request);showNotice(`${request.requesterName} درخواست ${request.action==='pause'?'توقف':'پخش'} فیلم را فرستاد`);});
    socket.on('video:suggestion:new',(suggestion)=>{showNotice(`${suggestion?.senderName||'یک نفر'} یک فیلم پیشنهاد داد`);});

    const clockTimer=setInterval(()=>{if(socket.connected)calibrateClock(1)},15000);
    return()=>{disposed=true;clearInterval(clockTimer);clearTimeout(desktopIdleTimerRef.current);clearTimeout(volumeHoverCloseRef.current);clearTimeout(presenceTimerRef.current);clearTimeout(typingIdleTimerRef.current);clearTimeout(timelineLongPressRef.current.timer);clearTimeout(previewSeekTimerRef.current);clearInterval(voiceTimerRef.current);clearTimeout(voiceAutoStopRef.current);try{if(voiceRecorderRef.current&&voiceRecorderRef.current.state!=='inactive'){voiceCancelRef.current=true;voiceRecorderRef.current.stop();}}catch{};voiceStreamRef.current?.getTracks?.().forEach(track=>track.stop());if(pendingImageUrlRef.current)URL.revokeObjectURL(pendingImageUrlRef.current);for(const timer of typingTimersRef.current.values())clearTimeout(timer);typingTimersRef.current.clear();joinRoomRef.current=null;socket.emit('chat:typing',{typing:false});socket.emit('room:leave');socket.disconnect();};
  },[roomId,initialName,applyRemotePlayback,showNotice]);

  useEffect(()=>{
    const video=videoRef.current;
    if(hlsRef.current){hlsRef.current.destroy();hlsRef.current=null;}
    setDetectedQuality(0);
    if(!room.videoUrl){
      if(video){try{video.pause()}catch{};video.removeAttribute('src');video.load?.();}
      setPlaying(false);setCurrentTime(0);setDuration(0);setRate(1);setNeedsGesture(false);
      return;
    }
    if(!video)return;
    const hlsSource=isHlsUrl(room.videoUrl);
    if(hlsSource&&Hls.isSupported()){
      const hls=new Hls({enableWorker:true,lowLatencyMode:false});hlsRef.current=hls;hls.loadSource(room.videoUrl);hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED,()=>{
        const options=normalizedQualityOptions((hls.levels||[]).map(level=>level?.height));
        if(isHost&&options.length)socketRef.current?.emit('room:report-quality-options',{options});
        applyHlsQualityMode(hls,qualityModeRef.current);
        pendingPlaybackRef.current&&applyRemotePlayback(pendingPlaybackRef.current);
      });
      hls.on(Hls.Events.LEVEL_SWITCHED,(_,data)=>{
        const level=hls.levels?.[Number(data?.level)];
        const height=Number(level?.height)||0;
        if(height)setDetectedQuality(height);
      });
      hls.on(Hls.Events.ERROR,(_,data)=>{if(data.fatal)showNotice('پخش این لینک HLS با خطا روبه‌رو شد')});
    }else{video.src=room.videoUrl;video.load();}
    return()=>{if(hlsRef.current){hlsRef.current.destroy();hlsRef.current=null;}};
  },[room.videoUrl,isHost,applyRemotePlayback,showNotice]);

  useEffect(()=>{
    if(!timelinePreviewActivated||!room.videoUrl)return;
    const video=timelinePreviewVideoRef.current;
    if(!video)return;
    if(timelinePreviewHlsRef.current){timelinePreviewHlsRef.current.destroy();timelinePreviewHlsRef.current=null;}
    try{video.pause();video.removeAttribute('src');video.load?.();}catch{}
    const applyPending=()=>{const target=Math.max(0,previewSeekPendingRef.current||0);try{if(Number.isFinite(video.duration)&&video.duration>0)video.currentTime=Math.min(target,Math.max(0,video.duration-.05));else video.currentTime=target;}catch{}};
    if(isHlsUrl(room.videoUrl)&&Hls.isSupported()){
      const previewHls=new Hls({enableWorker:true,lowLatencyMode:false,maxBufferLength:8,maxMaxBufferLength:16});
      timelinePreviewHlsRef.current=previewHls;
      previewHls.loadSource(room.videoUrl);previewHls.attachMedia(video);
      previewHls.on(Hls.Events.MANIFEST_PARSED,applyPending);
    }else{
      video.src=room.videoUrl;video.load();
      video.addEventListener('loadedmetadata',applyPending,{once:true});
    }
    return()=>{if(timelinePreviewHlsRef.current){timelinePreviewHlsRef.current.destroy();timelinePreviewHlsRef.current=null;}try{video.pause();video.removeAttribute('src');video.load?.();}catch{}};
  },[timelinePreviewActivated,room.videoUrl]);

  useEffect(()=>{
    if(typeof document==='undefined'||typeof window==='undefined')return;
    const sync=()=>{setPageVisible(document.visibilityState==='visible');setDesktopChatVisible(window.innerWidth>820);};
    sync();
    document.addEventListener('visibilitychange',sync);window.addEventListener('resize',sync);
    return()=>{document.removeEventListener('visibilitychange',sync);window.removeEventListener('resize',sync);};
  },[]);

  useEffect(()=>{
    if(!connected||!selfId||!pageVisible)return;
    const visible=chatOpen||(desktopChatVisible&&!(fullscreenActive&&fullscreenChatCollapsed));
    if(!visible)return;
    const ids=(room.messages||[]).filter(msg=>msg.senderId!==selfId&&!msg.seen&&!reportedSeenRef.current.has(msg.id)).map(msg=>msg.id).slice(-50);
    if(!ids.length)return;
    const timer=setTimeout(()=>{
      ids.forEach(id=>reportedSeenRef.current.add(id));
      const socket=socketRef.current;if(!socket?.connected){ids.forEach(id=>reportedSeenRef.current.delete(id));return;}
      socket.timeout(3500).emit('chat:seen',{messageIds:ids},(error,result)=>{if(error||!result?.ok)ids.forEach(id=>reportedSeenRef.current.delete(id));});
    },220);
    return()=>clearTimeout(timer);
  },[room.messages,chatOpen,desktopChatVisible,fullscreenActive,fullscreenChatCollapsed,connected,selfId,pageVisible]);

  useEffect(()=>{
    const shouldScroll=chatOpen||(typeof window!=='undefined'&&window.innerWidth>920);
    if(chatOpen)setUnread(0);
    if(shouldScroll)setTimeout(()=>{const box=messagesRef.current;if(box)box.scrollTo({top:box.scrollHeight,behavior:'smooth'});},40);
  },[chatOpen,room.messages.length]);

  useEffect(()=>{
    if(!isHost||!connected||!room.videoUrl)return;
    const timer=setInterval(()=>{
      const v=videoRef.current;
      if(v&&!v.paused)emitPlaybackSnapshot();
    },750);
    return()=>clearInterval(timer);
  },[isHost,connected,room.videoUrl,emitPlaybackSnapshot]);

  useEffect(()=>{
    if(!requestCooldownUntil){setRequestCooldownLeft(0);return;}
    const tick=()=>{
      const left=Math.max(0,Math.ceil((requestCooldownUntil-Date.now())/1000));
      setRequestCooldownLeft(left);
      if(!left)setRequestCooldownUntil(0);
    };
    tick();
    const timer=setInterval(tick,1000);
    return()=>clearInterval(timer);
  },[requestCooldownUntil]);

  function broadcastPlayback(){emitPlaybackSnapshot();}
  function requestSync(){if(!isHost)socketRef.current?.emit('playback:request-sync');}
  function handleLoadedMetadata(event){
    const video=event.currentTarget;
    setDuration(video.duration||0);
    const height=Number(video.videoHeight)||0;
    if(height)setDetectedQuality(height);
    if(isHost&&height&&!isHlsUrl(room.videoUrl)&&room.provider==='direct'&&!qualityOptions.length){
      socketRef.current?.emit('room:report-quality-options',{options:[height]});
    }
    requestSync();
    pendingPlaybackRef.current&&applyRemotePlayback(pendingPlaybackRef.current);
  }
  function setRoomQuality(mode){
    if(!canModerate||!room.videoUrl)return;
    socketRef.current?.emit('room:set-quality',{mode},result=>{
      if(result?.ok){
        const label=mode==='high'?'کیفیت بالا':mode==='low'?'کیفیت کم‌مصرف':'کیفیت خودکار';
        showNotice(`${label} برای اتاق تنظیم شد`);
      }else showNotice('تغییر کیفیت انجام نشد');
    });
  }
  function onTimeUpdate(){const v=videoRef.current;if(!v)return;setCurrentTime(v.currentTime);setPlaying(!v.paused);}
  function togglePlay(){const v=videoRef.current;if(!v||!isHost)return;v.paused?v.play().catch(()=>{}):v.pause();}
  function sendPlaybackRequest(action){
    if(isHost||requestCooldownLeft>0)return;
    socketRef.current?.emit('playback:request-action',{action},(result)=>{
      if(result?.ok){
        setRequestCooldownUntil(Date.now()+Number(result.cooldownMs||10000));
        setShowPlaybackRequest(false);
        showNotice(action==='pause'?'درخواست توقف برای میزبان ارسال شد':'درخواست پخش برای میزبان ارسال شد');
      }else if(result?.error==='cooldown'){
        setRequestCooldownUntil(Date.now()+Number(result.retryAfterMs||10000));
        setShowPlaybackRequest(false);
        showNotice('برای درخواست بعدی کمی صبر کن');
      }else if(result?.error==='host-offline')showNotice('میزبان الان در اتاق نیست');
      else showNotice('ارسال درخواست انجام نشد');
    });
  }
  function applyHostPlaybackRequest(){
    const request=hostPlaybackRequest;
    const v=videoRef.current;
    if(!isHost||!request||!v)return setHostPlaybackRequest(null);
    if(request.action==='pause'){if(!v.paused)v.pause();else broadcastPlayback();}
    else {if(v.paused)v.play().catch(()=>showNotice('پخش فیلم انجام نشد'));else broadcastPlayback();}
    setHostPlaybackRequest(null);
  }
  function seekTo(value){const v=videoRef.current;if(!v||!isHost)return;v.currentTime=Number(value);setCurrentTime(v.currentTime);broadcastPlayback();}
  function seekTimelinePreview(time){
    const target=Math.max(0,Math.min(Number(duration)||0,Number(time)||0));
    previewSeekPendingRef.current=target;
    const apply=()=>{
      previewSeekTimerRef.current=null;previewLastSeekAtRef.current=Date.now();
      const preview=timelinePreviewVideoRef.current;
      if(preview&&preview.readyState>=1){try{const next=previewSeekPendingRef.current;preview.currentTime=Number.isFinite(preview.duration)&&preview.duration>0?Math.min(next,Math.max(0,preview.duration-.05)):next;}catch{}}
    };
    const elapsed=Date.now()-previewLastSeekAtRef.current;
    if(elapsed>=90){clearTimeout(previewSeekTimerRef.current);apply();}
    else {clearTimeout(previewSeekTimerRef.current);previewSeekTimerRef.current=setTimeout(apply,90-elapsed);}
  }
  function updateTimelinePreview(clientX,visible=true){
    const wrap=timelineWrapRef.current;
    if(!wrap||!duration)return;
    const rect=wrap.getBoundingClientRect();
    const ratio=Math.max(0,Math.min(1,(Number(clientX)-rect.left)/Math.max(rect.width,1)));
    const time=ratio*duration;
    const left=Math.max(54,Math.min(rect.width-54,ratio*rect.width));
    if(!timelinePreviewActivated)setTimelinePreviewActivated(true);
    setTimelinePreview({visible,time,left});
    seekTimelinePreview(time);
  }
  function handleTimelinePointerDown(e){
    if(!duration)return;
    clearTimeout(timelineLongPressRef.current.timer);
    timelineLongPressRef.current={timer:null,active:e.pointerType==='mouse',startX:e.clientX};
    if(e.pointerType==='mouse'){updateTimelinePreview(e.clientX,true);return;}
    timelineLongPressRef.current.timer=setTimeout(()=>{timelineLongPressRef.current.active=true;updateTimelinePreview(timelineLongPressRef.current.startX,true);},360);
  }
  function handleTimelinePointerMove(e){
    if(!duration)return;
    if(e.pointerType==='mouse'){updateTimelinePreview(e.clientX,true);return;}
    if(timelineLongPressRef.current.active)updateTimelinePreview(e.clientX,true);
  }
  function hideTimelinePreview(e){
    clearTimeout(timelineLongPressRef.current.timer);
    timelineLongPressRef.current.active=false;
    if(!e||e.pointerType!=='mouse'||e.type==='pointerleave')setTimelinePreview(prev=>({...prev,visible:false}));
  }
  function seekBy(seconds){const v=videoRef.current;if(!v||!isHost||!room.videoUrl)return;const max=Number.isFinite(v.duration)&&v.duration>0?v.duration:Infinity;v.currentTime=Math.max(0,Math.min(max,v.currentTime+Number(seconds||0)));setCurrentTime(v.currentTime);broadcastPlayback();revealDesktopControls();if(fullscreenActive)revealFullscreenControls();}
  function changeRate(){const v=videoRef.current;if(!v||!isHost)return;const list=[1,1.25,1.5,.75],next=list[(list.indexOf(v.playbackRate)+1)%list.length];v.playbackRate=next;setRate(next);broadcastPlayback();}
  function toggleMute(){const v=videoRef.current;if(!v)return;v.muted=!v.muted;setMuted(v.muted);}
  function setLocalVolume(value){const v=videoRef.current;if(!v)return;const n=Number(value);try{v.volume=n;v.muted=n===0;setVolume(n);setMuted(n===0);}catch{showNotice('صدا را با دکمه‌های گوشی تنظیم کن');}}
  async function toggleFullscreen(){
    const shell=document.getElementById('watch-shell');
    if(!shell)return;
    const nativeFullscreen=document.fullscreenElement||document.webkitFullscreenElement;
    try{
      if(nativeFullscreen||pseudoFullscreen){
        if(document.fullscreenElement&&document.exitFullscreen)await document.exitFullscreen();
        else if(document.webkitFullscreenElement&&document.webkitExitFullscreen)await document.webkitExitFullscreen();
        setPseudoFullscreen(false);
        try{screen.orientation?.unlock?.();}catch{}
        controlsVisibleRef.current=true;
        setControlsVisible(true);
        return;
      }
      let nativeEntered=false;
      if(shell.requestFullscreen){await shell.requestFullscreen();nativeEntered=true;}
      else if(shell.webkitRequestFullscreen){await shell.webkitRequestFullscreen();nativeEntered=true;}
      if(!nativeEntered)setPseudoFullscreen(true);
      controlsVisibleRef.current=true;
      setControlsVisible(true);
      try{await screen.orientation?.lock?.('landscape');}catch{}
    }catch{
      setPseudoFullscreen(true);
      controlsVisibleRef.current=true;
      setControlsVisible(true);
      try{await screen.orientation?.lock?.('landscape');}catch{}
    }
  }
  async function unlockPlayback(){await applyRemotePlayback(pendingPlaybackRef.current||room.playback);requestSync();}
  function setVideo(){if(!isHost||!videoInput.trim()||resolving)return;setResolving(true);socketRef.current?.emit('room:set-video',{url:videoInput.trim()},(result)=>{setResolving(false);if(result?.ok){showNotice(result.provider==='aparat'?'لینک آپارات آماده و فیلم تنظیم شد':'فیلم اتاق تغییر کرد');setShowSource(false);}else if(result?.error==='aparat-resolve-failed')showNotice('لینک آپارات قابل دریافت نبود؛ لینک مستقیم را وارد کن');else if(result?.error==='invalid-url')showNotice('لینک ویدیو معتبر نیست');else showNotice('امکان تغییر فیلم نیست');});}
  function clearVideo(){if(!isHost||!room.videoUrl)return;socketRef.current?.emit('room:clear-video',(result)=>{if(result?.ok){setVideoInput('');setShowSource(false);showNotice('ویدیو از اتاق حذف شد');}else showNotice('حذف ویدیو انجام نشد');});}
  function suggestVideo(e){
    e?.preventDefault();
    const url=suggestionInput.trim();
    if(isHost||!url)return;
    socketRef.current?.emit('video:suggest',{url},(result)=>{
      if(result?.ok){setSuggestionInput('');setShowSource(false);showNotice('پیشنهاد برای میزبان ارسال شد');}
      else if(result?.error==='invalid-url')showNotice('لینک معتبر نیست');
      else if(result?.error==='duplicate')showNotice('این لینک را قبلاً پیشنهاد دادی');
      else if(result?.error==='cooldown')showNotice('چند ثانیه صبر کن و دوباره پیشنهاد بده');
      else if(result?.error==='host-offline')showNotice('میزبان الان در اتاق نیست');
      else showNotice('ارسال پیشنهاد انجام نشد');
    });
  }
  function rejectSuggestion(suggestionId){
    if(!isHost)return;
    socketRef.current?.emit('video:suggestion-remove',{suggestionId},(result)=>{
      if(result?.ok)showNotice('پیشنهاد رد شد');
      else showNotice('حذف پیشنهاد انجام نشد');
    });
  }
  function acceptSuggestion(suggestion){
    if(!isHost||!suggestion?.id||resolvingSuggestionId)return;
    setResolvingSuggestionId(suggestion.id);
    socketRef.current?.emit('video:suggestion-accept',{suggestionId:suggestion.id},(result)=>{
      setResolvingSuggestionId('');
      if(result?.ok){setVideoInput(suggestion.url);setShowSource(false);showNotice(result.provider==='aparat'?'پیشنهاد آپارات آماده و روی اتاق گذاشته شد':'پیشنهاد روی اتاق گذاشته شد');}
      else if(result?.error==='aparat-resolve-failed')showNotice('این لینک آپارات قابل دریافت نبود');
      else if(result?.error==='invalid-url')showNotice('لینک پیشنهاد معتبر نیست');
      else showNotice('این لینک مستقیماً قابل پخش نیست؛ لینک مستقیم ویدیو را امتحان کن');
    });
  }
  function stopTyping(){clearTimeout(typingIdleTimerRef.current);lastTypingEmitRef.current=0;socketRef.current?.emit('chat:typing',{typing:false});}
  function signalTyping(value){
    const active=Boolean(String(value||'').trim());
    clearTimeout(typingIdleTimerRef.current);
    if(!active){stopTyping();return;}
    const now=Date.now();
    if(now-lastTypingEmitRef.current>750){lastTypingEmitRef.current=now;socketRef.current?.emit('chat:typing',{typing:true});}
    typingIdleTimerRef.current=setTimeout(stopTyping,1300);
  }
  function updateMentionState(value,cursor=value.length){
    const before=String(value||'').slice(0,Math.max(0,cursor));
    const start=before.lastIndexOf('@');
    if(start<0){setMentionState(null);return;}
    const previous=start>0?before[start-1]:'';
    const query=before.slice(start+1);
    const completedMention=selectedMentionIds.some(id=>{const member=(room.members||[]).find(item=>item.id===id);return member&&query.startsWith(`${member.name} `);});
    if(completedMention||(previous&&!/[\s([{:،؛!?]/u.test(previous))||query.length>30||/[\n\r@،؛!?]/u.test(query)){setMentionState(null);return;}
    setMentionState({start,end:cursor,query});
    setMentionIndex(0);
  }
  function handleMessageChange(e){
    const value=e.target.value;
    const cursor=e.target.selectionStart??value.length;
    setMessage(value);
    setSelectedMentionIds(prev=>prev.filter(id=>{const member=(room.members||[]).find(item=>item.id===id);return member&&value.includes(`@${member.name}`);}));
    updateMentionState(value,cursor);
    signalTyping(value);
  }
  function focusChatInput(cursor){requestAnimationFrame(()=>{const input=chatInputRef.current;if(!input)return;input.focus({preventScroll:true});const at=Number.isFinite(cursor)?cursor:input.value.length;try{input.setSelectionRange(at,at);}catch{}});}
  function insertMention(member){
    if(!member?.id||!member.name)return;
    let next='';
    let cursor=0;
    if(mentionState){
      const before=message.slice(0,mentionState.start);
      const after=message.slice(mentionState.end);
      const token=`@${member.name} `;
      next=`${before}${token}${after}`.slice(0,500);
      cursor=Math.min(500,before.length+token.length);
    }else{
      const spacer=message&&!/\s$/u.test(message)?' ':'';
      next=`${message}${spacer}@${member.name} `.slice(0,500);
      cursor=next.length;
    }
    setMessage(next);
    setSelectedMentionIds(prev=>prev.includes(member.id)?prev:[...prev,member.id].slice(-8));
    setMentionState(null);
    setMentionIndex(0);
    signalTyping(next);
    focusChatInput(cursor);
  }
  function tagMessageSender(msg){
    const member=(room.members||[]).find(item=>item.id===msg?.senderId);
    if(!member){showNotice('این کاربر دیگر در اتاق نیست');return;}
    openChat();
    insertMention(member);
  }
  function startReply(msg){
    if(!msg?.id)return;
    setReplyTo({id:msg.id,senderId:msg.senderId,senderName:msg.senderName,text:String(msg.text||'').slice(0,160),hasImage:Boolean(msg.imageUrl),imageName:msg.imageName||'',hasAudio:Boolean(msg.audioUrl),audioDurationMs:Number(msg.audioDurationMs)||0});
    setMentionState(null);
    openChat();
    focusChatInput();
  }
  function scrollToReplyTarget(id){
    if(!id)return;
    const box=messagesRef.current;
    const target=box?.querySelector(`[data-message-id="${id}"]`);
    if(!target)return;
    target.scrollIntoView({behavior:'smooth',block:'center'});
    target.classList.add('reply-target-flash');
    setTimeout(()=>target.classList.remove('reply-target-flash'),900);
  }
  function handleChatKeyDown(e){
    if(mentionState&&mentionCandidates.length){
      if(e.key==='ArrowDown'){e.preventDefault();setMentionIndex(index=>(index+1)%mentionCandidates.length);return;}
      if(e.key==='ArrowUp'){e.preventDefault();setMentionIndex(index=>(index-1+mentionCandidates.length)%mentionCandidates.length);return;}
      if(e.key==='Enter'||e.key==='Tab'){e.preventDefault();insertMention(mentionCandidates[Math.min(mentionIndex,mentionCandidates.length-1)]);return;}
      if(e.key==='Escape'){e.preventDefault();setMentionState(null);return;}
    }
    if(e.key==='Escape'&&replyTo){e.preventDefault();setReplyTo(null);}
  }
  function clearPendingImage(){
    if(pendingImageUrlRef.current){URL.revokeObjectURL(pendingImageUrlRef.current);pendingImageUrlRef.current='';}
    setPendingImage(null);setImageCaption('');
    if(imageInputRef.current)imageInputRef.current.value='';
    if(cameraInputRef.current)cameraInputRef.current.value='';
  }
  function prepareChatImage(file){
    if(!file||uploadingImage)return;
    const imageType=imageMimeFromFile(file);
    if(!imageType){showNotice('فرمت تصویر شناخته نشد');return;}
    if(file.size>CHAT_IMAGE_MAX_BYTES){showNotice('حداکثر حجم تصویر ۵ مگابایت است');return;}
    if(pendingImageUrlRef.current)URL.revokeObjectURL(pendingImageUrlRef.current);
    const previewUrl=URL.createObjectURL(file);pendingImageUrlRef.current=previewUrl;
    setPendingImage({file,previewUrl,imageType});setImageCaption('');setShowImageSource(false);setShowEmojiTray(false);
  }
  async function sendChatImage(){
    if(!pendingImage?.file||uploadingImage)return;
    const socket=socketRef.current;if(!socket?.connected){showNotice('اتصال چت برقرار نیست');return;}
    const file=pendingImage.file, imageType=pendingImage.imageType||imageMimeFromFile(file);
    setUploadingImage(true);
    try{
      const data=await file.arrayBuffer();
      socket.emit('chat:image',{name:file.name||'image',type:imageType,size:file.size,data,caption:imageCaption.trim(),replyToId:replyTo?.id||''},result=>{
        setUploadingImage(false);
        if(result?.ok){showNotice('تصویر ارسال شد');setShowEmojiTray(false);setReplyTo(null);clearPendingImage();}
        else if(result?.error==='image-too-large')showNotice('حداکثر حجم تصویر ۵ مگابایت است');
        else if(result?.error==='rate-limit')showNotice('چند ثانیه بعد دوباره امتحان کن');
        else showNotice('ارسال تصویر انجام نشد');
      });
    }catch{setUploadingImage(false);showNotice('خواندن تصویر انجام نشد');}
  }
  function chooseChatImage(){
    if(uploadingImage||voiceRecording)return;
    const mobile=typeof window!=='undefined'&&(window.innerWidth<=920||window.matchMedia?.('(pointer:coarse)').matches);
    if(mobile){setShowImageSource(value=>!value);setShowEmojiTray(false);return;}
    imageInputRef.current?.click();
  }
  function openChatImageSource(source){setShowImageSource(false);if(source==='camera')cameraInputRef.current?.click();else imageInputRef.current?.click();}
  function stopVoiceTracks(){voiceStreamRef.current?.getTracks?.().forEach(track=>track.stop());voiceStreamRef.current=null;}
  async function sendVoiceBlob(blob,durationMs){
    if(!blob?.size)return;
    if(blob.size>CHAT_AUDIO_MAX_BYTES){showNotice('حجم ویس بیش از حد مجاز شد');return;}
    const socket=socketRef.current;if(!socket?.connected){showNotice('اتصال چت برقرار نیست');return;}
    setVoiceSending(true);
    try{
      const data=await blob.arrayBuffer();
      socket.emit('chat:voice',{type:blob.type||'audio/webm',size:blob.size,data,durationMs,replyToId:replyTo?.id||''},result=>{
        setVoiceSending(false);
        if(result?.ok){setReplyTo(null);showNotice('ویس ارسال شد');}
        else if(result?.error==='audio-too-large')showNotice('حجم ویس بیش از حد مجاز است');
        else if(result?.error==='audio-too-short')showNotice('ویس خیلی کوتاه بود');
        else if(result?.error==='rate-limit')showNotice('کمی صبر کن و دوباره ویس بفرست');
        else showNotice('ارسال ویس انجام نشد');
      });
    }catch{setVoiceSending(false);showNotice('ارسال ویس انجام نشد');}
  }
  function stopVoiceRecording(cancel=false){
    voiceHoldRef.current=false;
    if(cancel)voiceCancelRef.current=true;
    clearInterval(voiceTimerRef.current);clearTimeout(voiceAutoStopRef.current);
    const recorder=voiceRecorderRef.current;
    if(recorder&&recorder.state!=='inactive'){try{recorder.stop();}catch{stopVoiceTracks();setVoiceRecording(false);}}
    else {stopVoiceTracks();setVoiceRecording(false);}
  }
  async function startVoiceRecording(e){
    if(voiceRecording||voiceSending||message.trim()||pendingImage)return;
    e.preventDefault();
    voiceHoldRef.current=true;voiceCancelRef.current=false;setVoiceCancelArmed(false);voiceStartXRef.current=Number(e.clientX)||0;
    try{e.currentTarget.setPointerCapture?.(e.pointerId);}catch{}
    if(typeof navigator==='undefined'||!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){voiceHoldRef.current=false;showNotice('ضبط ویس در این مرورگر پشتیبانی نمی‌شود');return;}
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
      if(!voiceHoldRef.current){stream.getTracks().forEach(track=>track.stop());return;}
      voiceStreamRef.current=stream;voiceChunksRef.current=[];
      const mime=preferredVoiceMime();
      const recorder=mime?new MediaRecorder(stream,{mimeType:mime}):new MediaRecorder(stream);
      voiceRecorderRef.current=recorder;voiceStartAtRef.current=Date.now();setVoiceDurationMs(0);setVoiceRecording(true);
      recorder.ondataavailable=event=>{if(event.data?.size)voiceChunksRef.current.push(event.data);};
      recorder.onstop=()=>{
        const duration=Math.max(0,Math.min(CHAT_VOICE_MAX_MS,Date.now()-voiceStartAtRef.current));
        const canceled=voiceCancelRef.current;
        const chunks=voiceChunksRef.current.slice();voiceChunksRef.current=[];voiceRecorderRef.current=null;
        stopVoiceTracks();setVoiceRecording(false);setVoiceCancelArmed(false);setVoiceDurationMs(0);
        if(canceled)return;
        const blob=new Blob(chunks,{type:recorder.mimeType||mime||'audio/webm'});
        if(duration<250||!blob.size){showNotice('ویس خیلی کوتاه بود');return;}
        sendVoiceBlob(blob,duration);
      };
      recorder.start(250);
      voiceTimerRef.current=setInterval(()=>setVoiceDurationMs(Math.min(CHAT_VOICE_MAX_MS,Date.now()-voiceStartAtRef.current)),100);
      voiceAutoStopRef.current=setTimeout(()=>{voiceCancelRef.current=false;stopVoiceRecording(false);},CHAT_VOICE_MAX_MS);
    }catch{voiceHoldRef.current=false;stopVoiceTracks();setVoiceRecording(false);showNotice('برای ارسال ویس، دسترسی میکروفن را فعال کن');}
  }
  function moveVoiceRecording(e){
    if(!voiceRecording)return;
    const cancel=(Number(e.clientX)||0)<voiceStartXRef.current-72;
    voiceCancelRef.current=cancel;setVoiceCancelArmed(cancel);
  }
  function finishVoiceRecording(){if(!voiceHoldRef.current&&!voiceRecording)return;stopVoiceRecording(voiceCancelRef.current);}
  function sendMessage(e){
    e?.preventDefault();
    const text=message.trim();
    const socket=socketRef.current;
    if(!text||sendingMessage)return;
    if(!socket?.connected){showNotice('اتصال چت برقرار نیست');return;}
    setSendingMessage(true);
    socket.emit('chat:send',{text,mentionIds:selectedMentionIds,replyToId:replyTo?.id||''},result=>{
      setSendingMessage(false);
      if(result?.ok){stopTyping();setMessage('');setSelectedMentionIds([]);setMentionState(null);setReplyTo(null);setShowEmojiTray(false);}
      else if(result?.error==='rate-limit')showNotice('کمی صبر کن و دوباره پیام بفرست');
      else showNotice('ارسال پیام انجام نشد');
    });
  }
  const insertEmoji=e=>{const next=`${message}${e}`.slice(0,500);setMessage(next);setMentionState(null);signalTyping(next);focusChatInput(next.length);};
  function submitJoinPassword(e){e?.preventDefault();const value=joinPassword.slice(0,64);if(!value)return;setPasswordError('');joinPasswordRef.current=value;joinRoomRef.current?.(value);}
  function saveRoomPassword(e){
    e?.preventDefault();
    if(!isHost||savingPassword)return;
    const value=roomPassword.slice(0,64);
    setSavingPassword(true);
    socketRef.current?.emit('room:set-password',{password:value},(result)=>{
      setSavingPassword(false);
      if(result?.ok){joinPasswordRef.current=value;setShowRoomSecurity(false);setRoomPassword('');showNotice(result.passwordProtected?'رمز اتاق فعال شد':'رمز اتاق برداشته شد');}
      else if(result?.error==='too-short')showNotice('رمز اتاق حداقل ۴ کاراکتر باشد');
      else showNotice('تغییر رمز اتاق انجام نشد');
    });
  }
  const sendReaction=e=>{socketRef.current?.emit('reaction:send',{emoji:e});};
  function openMemberActions(member){
    if(!member||member.id===selfId)return;
    setShowMembers(false);
    setMemberActionTarget(member);
  }
  function setMemberAdmin(member,admin){
    if(!isHost||!member||member.id===room.hostId)return;
    setMemberActionBusy(true);
    socketRef.current?.emit('room:set-admin',{memberId:member.id,admin},result=>{
      setMemberActionBusy(false);
      if(result?.ok){showNotice(admin?'مدیر اضافه شد':'دسترسی مدیریت برداشته شد');setMemberActionTarget(null);}
      else if(result?.error==='admin-limit')showNotice('حداکثر ۳ مدیر می‌تونی داشته باشی');
      else showNotice('تغییر مدیر انجام نشد');
    });
  }
  function kickMember(member){
    if(!canModerate||!member||member.id===selfId||member.id===room.hostId)return;
    setMemberActionBusy(true);
    socketRef.current?.emit('room:kick',{memberId:member.id},result=>{
      setMemberActionBusy(false);
      if(result?.ok){showNotice(`${member.name} از اتاق خارج شد`);setMemberActionTarget(null);}
      else if(result?.error==='cannot-kick-admin')showNotice('مدیر نمی‌تونه مدیر دیگه رو خارج کنه');
      else showNotice('خارج کردن عضو انجام نشد');
    });
  }

  function openRoleManager(member){
    if(!member||(member.id!==selfId&&!isHost))return;
    closeFloating();
    setRoleTarget({id:member.id,name:member.id===selfId?'شما':member.name});
    setNewRoleName('');
    setNewRoleEmoji('❤️');
    setNewRoleColor('#ff5c7c');
    setShowRoleManager(true);
  }
  function assignRole(roleId){
    if(!roleTarget||(roleTarget.id!==selfId&&!isHost))return;
    socketRef.current?.emit('role:assign',{memberId:roleTarget.id,roleId:roleId||null},(result)=>{
      if(result?.ok){showNotice(roleId?'رول اختصاص داده شد':'رول حذف شد');setShowRoleManager(false);}
      else showNotice('تغییر رول انجام نشد');
    });
  }
  function createAndAssignRole(e){
    e?.preventDefault();
    const name=newRoleName.trim();
    if(!roleTarget||!name||(roleTarget.id!==selfId&&!isHost))return;
    socketRef.current?.emit('role:create',{name,memberId:roleTarget.id,emoji:newRoleEmoji,color:newRoleColor},(result)=>{
      if(result?.ok){showNotice('رول ساخته و اختصاص داده شد');setNewRoleName('');setNewRoleEmoji('❤️');setNewRoleColor('#ff5c7c');setShowRoleManager(false);}
      else if(result?.error==='role-limit')showNotice('حداکثر تعداد رول‌های این اتاق ساخته شده');
      else showNotice('ساخت رول انجام نشد');
    });
  }
  function closeRoleManager(){setShowRoleManager(false);setRoleTarget(null);setNewRoleName('');setNewRoleEmoji('❤️');setNewRoleColor('#ff5c7c');}
  function refreshSavedVideos(){
    const socket=socketRef.current;
    if(!socket?.connected)return;
    socket.emit('saved-video:list',result=>{if(result?.ok)setSavedVideos(Array.isArray(result.items)?result.items:[]);});
  }
  function openSavedVideoLibrary(){closeFloating();setShowSavedVideos(true);refreshSavedVideos();}
  function saveCurrentProgress(){
    if(!canModerate||!room.videoUrl||savingProgress)return;
    const socket=socketRef.current;if(!socket?.connected)return showNotice('اتصال برقرار نیست');
    setSavingProgress(true);
    socket.emit('saved-video:save',result=>{
      setSavingProgress(false);
      if(result?.ok){setSavedVideos(Array.isArray(result.items)?result.items:[]);showNotice('ادامهٔ این ویدیو ذخیره شد');}
      else if(result?.error==='forbidden')showNotice('فقط میزبان یا مدیر می‌تواند ذخیره کند');
      else showNotice('ذخیره ویدیو انجام نشد');
    });
  }
  function useSavedVideo(item){
    if(!item||savedVideoBusy)return;
    if(!canModerate){showNotice('برای پخش در این اتاق باید میزبان یا مدیر باشی');return;}
    setSavedVideoBusy(item.id);
    socketRef.current?.emit('saved-video:use',{id:item.id},result=>{
      setSavedVideoBusy('');
      if(result?.ok){setShowSavedVideos(false);showNotice(`از ${formatClock(item.time||0)} آماده شد`);}
      else if(result?.error==='forbidden')showNotice('اجازه تغییر ویدیو در این اتاق را نداری');
      else showNotice('بازکردن ویدیوی ذخیره‌شده انجام نشد');
    });
  }
  function deleteSavedVideo(item){
    if(!item||savedVideoBusy)return;
    setSavedVideoBusy(item.id);
    socketRef.current?.emit('saved-video:delete',{id:item.id},result=>{
      setSavedVideoBusy('');
      if(result?.ok){setSavedVideos(Array.isArray(result.items)?result.items:[]);showNotice('از لیست ذخیره‌ها حذف شد');}
      else showNotice('حذف ذخیره انجام نشد');
    });
  }
  function closeFloating(){setShowMembers(false);setShowReactions(false);setShowVolume(false);setShowQuality(false);setShowPlaybackRequest(false);}
  function closeChat(){stopTyping();setChatOpen(false);setShowEmojiTray(false);setShowImageSource(false);setMentionState(null);}
  function openChat(){closeFloating();const desktopCinema=typeof window!=='undefined'&&window.innerWidth>920&&window.matchMedia?.('(hover:hover) and (pointer:fine)').matches;if(fullscreenActive&&desktopCinema){setFullscreenChatCollapsed(false);setUnread(0);return;}setChatOpen(true);setUnread(0);}
  function toggleMembers(){const next=!showMembers;closeFloating();setShowMembers(next);}
  function toggleReactions(){const next=!showReactions;closeFloating();setShowReactions(next);}
  function openVolumePanel(){clearTimeout(volumeHoverCloseRef.current);closeFloating();setShowVolume(true);revealDesktopControls();if(fullscreenActive)revealFullscreenControls();}
  function handleVolumeButton(){
    clearTimeout(volumeHoverCloseRef.current);
    if(showVolume){toggleMute();revealDesktopControls();if(fullscreenActive)revealFullscreenControls();return;}
    openVolumePanel();
  }
  function volumePointerEnter(e){if(e.pointerType==='mouse'&&window.matchMedia?.('(hover:hover) and (pointer:fine)').matches)openVolumePanel();}
  function volumePointerLeave(e){if(e.pointerType!=='mouse')return;clearTimeout(volumeHoverCloseRef.current);volumeHoverCloseRef.current=setTimeout(()=>setShowVolume(false),320);}
  function toggleQuality(){const next=!showQuality;closeFloating();setShowQuality(next);}
  function leaveRoom(){socketRef.current?.emit('room:leave');socketRef.current?.disconnect();window.location.href='/';}
  function stagePointerDown(e){
    if(e.target?.closest?.('button,input,textarea,.floating-panel,.player-controls,.chat-panel'))return;
    if(fullscreenActive){
      if(!controlsVisibleRef.current){swallowedStageTapRef.current=true;revealFullscreenControls();return;}
      revealFullscreenControls();
      return;
    }
    if(!desktopControlsVisible){swallowedStageTapRef.current=true;revealDesktopControls();return;}
    revealDesktopControls();
  }
  function stageClick(e){
    if(swallowedStageTapRef.current){swallowedStageTapRef.current=false;return;}
    if(fullscreenActive)revealFullscreenControls();else revealDesktopControls();
    if(!isHost||!room.videoUrl||needsGesture)return;
    if(e.target.closest('button,input,textarea,.floating-panel,.player-controls,.chat-panel'))return;
    togglePlay();
  }

  useEffect(()=>{
    function onKeyDown(e){
      if(e.key==='Escape'){
        if(showLeaveConfirm)return setShowLeaveConfirm(false);
        if(memberActionTarget)return setMemberActionTarget(null);
        if(showRoleManager)return closeRoleManager();
        if(showSavedVideos)return setShowSavedVideos(false);
        if(showRoomSecurity)return setShowRoomSecurity(false);
        if(showSource)return setShowSource(false);
        if(chatOpen)return closeChat();
        closeFloating();
        return;
      }
      const target=e.target;
      const interactive=target?.closest?.('input,textarea,select,button,[contenteditable="true"],.chat-panel,.floating-panel,.modal-backdrop');
      if((e.key==='f'||e.key==='F')&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!interactive&&room.videoUrl){e.preventDefault();toggleFullscreen();return;}
      if(e.key!=='ArrowRight'&&e.key!=='ArrowLeft')return;
      if(interactive)return;
      if(!isHost||!room.videoUrl||!videoRef.current)return;
      e.preventDefault();
      seekBy(e.key==='ArrowRight'?5:-5);
    }
    window.addEventListener('keydown',onKeyDown);
    return()=>window.removeEventListener('keydown',onKeyDown);
  },[chatOpen,memberActionTarget,showLeaveConfirm,showRoleManager,showSavedVideos,showRoomSecurity,showSource,showMembers,showReactions,showVolume,showQuality,showPlaybackRequest,isHost,room.videoUrl,fullscreenActive,pseudoFullscreen]);

  const floatingOpen=showMembers||showReactions||showVolume||showQuality||showPlaybackRequest;

  return <main id="watch-shell" className={`watch-shell ${chatOpen?'chat-is-open':''} ${pseudoFullscreen?'app-fullscreen':''} ${fullscreenActive?'is-fullscreen':''} ${fullscreenActive&&fullscreenChatCollapsed?'fullscreen-chat-collapsed':''} ${fullscreenActive&&!controlsVisible?'fullscreen-ui-hidden':''} ${!desktopControlsVisible?'desktop-controls-hidden':''} ${keyboardOpen?'keyboard-open':''}`}>
    {notice&&<div className="toast">{notice}</div>}
    {presenceNotice&&<div className={`presence-toast ${presenceNotice.type}`} role="status"><span><Icon name={presenceNotice.type==='leave'?'userMinus':'user'} size={17}/></span><div><b>{presenceNotice.memberName}</b><small>{presenceNotice.type==='leave'?'از اتاق خارج شد':'وارد اتاق شد'}</small></div></div>}
    {isHost&&hostPlaybackRequest&&<div className="host-request-card" role="status"><span className="host-request-icon"><Icon name="bell" size={19}/></span><div><b>{hostPlaybackRequest.requesterName}</b><span>درخواست {hostPlaybackRequest.action==='pause'?'توقف':'پخش'} فیلم داده</span></div><button type="button" className="host-request-do" onClick={applyHostPlaybackRequest}>انجام بده</button><button type="button" className="host-request-close" onClick={()=>setHostPlaybackRequest(null)} aria-label="بستن"><Icon name="close" size={16}/></button></div>}
    <header className="room-header">
      <button className="header-icon brand-back" onClick={()=>setShowLeaveConfirm(true)} aria-label="خروج"><Icon name="back"/></button>
      <div className="room-title"><b>{room.videoTitle||'Baham Bebinim'}</b><span className={connected?'online-dot connected':'online-dot'}>{connected?'متصل':'در حال اتصال'}</span></div>
      <div className="room-actions">
        {isHost&&<button className={`header-icon security-button ${room.passwordProtected?'active':''}`} onClick={()=>{setRoomPassword('');setShowRoomSecurity(true)}} aria-label={room.passwordProtected?'تنظیم رمز اتاق':'گذاشتن رمز برای اتاق'}><Icon name="lock"/>{room.passwordProtected&&<span className="security-dot"/>}</button>}
        {canModerate&&room.videoUrl&&<button className={`header-icon quality-button ${showQuality?'active':''}`} onClick={toggleQuality} aria-label="تنظیم کیفیت پخش" title="کیفیت پخش"><span>HD</span></button>}
        <button className={`header-icon suggestions-button ${isHost&&videoSuggestions.length?'has-suggestions':''}`} onClick={()=>setShowSource(true)} aria-label={isHost?'تنظیم لینک و بررسی پیشنهادها':'پیشنهاد فیلم'}><Icon name="link"/>{isHost&&videoSuggestions.length>0&&<small>{videoSuggestions.length>9?'9+':videoSuggestions.length}</small>}</button>
        <button className="room-code" onClick={()=>{navigator.clipboard?.writeText(roomId);showNotice('کد اتاق کپی شد')}}><span>{roomId}</span><Icon name="copy" size={16}/></button>
        <button className="header-icon members-button" onClick={toggleMembers} aria-label="اعضا"><Icon name="users"/><small>{room.members.length}</small></button>
      </div>
    </header>

    {floatingOpen&&<button type="button" className="dismiss-layer" onClick={closeFloating} aria-label="بستن پنجره باز"/>}

    {showMembers&&<div className="members-popover floating-panel"><div className="popover-head"><div><b>اعضای اتاق</b><small>{isHost?'رول و مدیریت اعضا':isAdmin?'رول خودت و مدیریت اعضای عادی':'برای خودت رول بساز یا اعضای آنلاین را ببین'}</small></div><button onClick={()=>setShowMembers(false)}><Icon name="close"/></button></div>{room.members.map(m=>{const role=roleMap.get(m.roleId);const roleName=role?.name||'';const isNew=Date.now()-(m.joinedAt||0)<180000;const canManageMember=(isHost&&m.id!==selfId)||(isAdmin&&m.id!==selfId&&m.id!==room.hostId&&!m.isAdmin);const canManageRole=isHost||m.id===selfId;return <div className="member-row" key={m.id}><span className={`member-avatar ${m.isAdmin?'admin-avatar':''}`}><Icon name={m.id===room.hostId?'crown':m.isAdmin?'shield':'user'} size={17}/></span><div className="member-main"><b>{m.id===selfId?'شما':m.name}</b><div className="member-badges">{m.id===room.hostId&&<small className="system-badge host-label">میزبان</small>}{m.isAdmin&&<small className="system-badge admin-label">مدیر</small>}{m.id===selfId&&<small className="system-badge self-label">شما</small>}{isNew&&m.id!==selfId&&<small className="system-badge new-label">جدید</small>}{roleName&&<span className="member-role-badge" style={{'--role-color':role?.color||'#6c8cff'}}>{role?.emoji&&<span className="role-emoji">{role.emoji}</span>}{roleName}</span>}</div></div>{canManageRole&&<button type="button" className="role-manage-btn" onClick={()=>openRoleManager(m)} aria-label={m.id===selfId?'تنظیم رول خودم':`تنظیم رول ${m.name}`}><Icon name="tag" size={14}/><span>{roleName?'تغییر':'رول'}</span></button>}{canManageMember&&<button type="button" className="member-more-btn" onClick={()=>openMemberActions(m)} aria-label={`مدیریت ${m.name}`}><Icon name="more" size={17}/></button>}</div>})}</div>}
    {showQuality&&canModerate&&room.videoUrl&&<div className="quality-popover floating-panel" onClick={e=>e.stopPropagation()}><div className="quality-popover-head"><div><b>کیفیت پخش اتاق</b><small>{qualityOptions.length>1?`کیفیت‌های تشخیص‌داده‌شده: ${qualityMin}p تا ${qualityMax}p`:qualityOptions.length===1?`منبع فعلی: ${qualityLabel(qualityOptions[0])}`:'در حال تشخیص کیفیت منبع'}</small></div><span className="quality-current">{detectedQuality?qualityLabel(detectedQuality):'—'}</span></div><div className="quality-mode-buttons"><button type="button" className={qualityMode==='auto'?'active':''} onClick={()=>setRoomQuality('auto')}><b>خودکار</b><small>تعادل کیفیت و اتصال</small></button><button type="button" className={qualityMode==='low'?'active':''} onClick={()=>setRoomQuality('low')}><b>کم</b><small>{qualityMin?qualityLabel(qualityMin):'کم‌مصرف'}</small></button><button type="button" className={qualityMode==='high'?'active':''} onClick={()=>setRoomQuality('high')}><b>بالا</b><small>{qualityMax?qualityLabel(qualityMax):'بیشترین موجود'}</small></button></div><p>این انتخاب برای همه افراد اتاق از سمت سرور Sync می‌شود. اگر منبع فقط یک کیفیت داشته باشد، همان کیفیت پخش می‌شود.</p></div>}


    <div className="watch-grid">
      <section className="cinema-panel">
        <div className="video-stage" id="video-stage" onPointerDown={stagePointerDown} onPointerEnter={e=>{if(e.pointerType==='mouse'){revealDesktopControls();if(fullscreenActive)revealFullscreenControls()}}} onPointerMove={e=>{if(e.pointerType==='mouse'){revealDesktopControls();if(fullscreenActive)revealFullscreenControls()}}} onClick={stageClick}>
          {room.videoUrl?<video ref={videoRef} playsInline preload="metadata" onLoadedMetadata={handleLoadedMetadata} onDurationChange={e=>setDuration(e.currentTarget.duration||0)} onTimeUpdate={onTimeUpdate} onPlay={()=>{setPlaying(true);if(isHost)broadcastPlayback()}} onPause={()=>{setPlaying(false);if(isHost)broadcastPlayback()}} onSeeked={()=>isHost&&broadcastPlayback()} onRateChange={e=>{setRate(e.currentTarget.playbackRate);if(isHost)broadcastPlayback()}} onError={()=>room.videoUrl&&showNotice('این لینک داخل مرورگر قابل پخش نیست؛ لینک مستقیم ویدیو را امتحان کن')}/>:<div className="empty-player"><span className="empty-play"><Icon name="play" size={28}/></span><h2>هنوز فیلمی انتخاب نشده</h2><p>{isHost?'لینک مستقیم، آپارات یا منبع قابل‌پخش را وارد کن.':'منتظر انتخاب فیلم توسط میزبان باش؛ می‌تونی از دکمه لینک، فیلم پیشنهاد بدی.'}</p></div>}
          <div className="reaction-layer" aria-hidden="true">{reactions.map(r=><span key={r.id} className="flying-reaction" style={{left:`${r.lane}%`}}>{r.emoji}</span>)}</div>
          {!isHost&&room.videoUrl&&<div className="viewer-badge">کنترل زمان با میزبان</div>}
          {needsGesture&&room.videoUrl&&<button className="gesture-overlay" onClick={unlockPlayback}><span><Icon name="play" size={26}/></span><b>برای شروع همزمان لمس کن</b><small>مرورگر اجازهٔ پخش خودکار با صدا نداده است</small></button>}

          <div className="stage-shortcuts">
            <button className="stage-pill mobile-only" onClick={e=>{e.stopPropagation();openChat()}} aria-label="چت"><Icon name="chat"/>{unread>0&&<small>{unread>99?'99+':unread}</small>}</button>
            <button className="stage-pill landscape-source-shortcut" onClick={e=>{e.stopPropagation();setShowSource(true)}} aria-label={isHost?'تنظیم فیلم و پیشنهادها':'پیشنهاد فیلم'}><Icon name="link"/>{isHost&&videoSuggestions.length>0&&<small>{videoSuggestions.length>9?'9+':videoSuggestions.length}</small>}</button>
            {isHost&&<button className={`stage-pill security-stage-shortcut ${room.passwordProtected?'active':''}`} onClick={e=>{e.stopPropagation();setRoomPassword('');setShowRoomSecurity(true)}} aria-label="امنیت اتاق"><Icon name="lock"/>{room.passwordProtected&&<span className="security-dot"/>}</button>}
            {(canModerate||savedVideos.length>0)&&<button className="stage-pill saved-video-shortcut" onClick={e=>{e.stopPropagation();openSavedVideoLibrary()}} aria-label="ویدیوهای ذخیره‌شده" title="ویدیوهای ذخیره‌شده"><Icon name="bookmark"/>{savedVideos.length>0&&<small>{savedVideos.length>9?'9+':savedVideos.length}</small>}</button>}
            <button className="stage-pill video-reaction-shortcut mobile-only" onClick={e=>{e.stopPropagation();toggleReactions()}} aria-label="واکنش"><Icon name="reactions"/></button>
          </div>
          {typingUsers.length>0&&!chatOpen&&!showReactions&&<div className="stage-typing-hint mobile-only" aria-live="polite"><span className="typing-dots"><i/><i/><i/></span><b>{typingLabel(typingUsers)}</b><span>…</span></div>}
          {showReactions&&<div className="reaction-picker floating-panel" onClick={e=>e.stopPropagation()}>{REACTIONS.map(e=><button key={e} onClick={()=>sendReaction(e)}>{e}</button>)}</div>}
          {room.videoUrl&&<>
            {showPlaybackRequest&&<div className="playback-request-menu floating-panel" onClick={e=>e.stopPropagation()}><b>درخواست از میزبان</b><small>فقط میزبان کنترل فیلم را تغییر می‌دهد</small><button type="button" onClick={()=>sendPlaybackRequest('pause')}><Icon name="pause" size={17}/><span>فیلم رو Pause کن</span></button><button type="button" onClick={()=>sendPlaybackRequest('play')}><Icon name="play" size={17}/><span>فیلم رو شروع کن</span></button></div>}
            <div className={`player-controls ${isHost?'host-controls':'viewer-controls'} ${showVolume?'volume-open':''}`} onPointerDown={()=>{revealDesktopControls();if(fullscreenActive)revealFullscreenControls()}} onClick={e=>e.stopPropagation()}>
              {isHost?<button className="control-btn primary-control" onClick={togglePlay} aria-label="پخش یا توقف" title="پخش / توقف"><Icon name={playing?'pause':'play'} size={21}/></button>:<div className="viewer-request-wrap"><button className={`control-btn request-control ${requestCooldownLeft>0?'cooldown':''}`} onClick={()=>{if(requestCooldownLeft>0)return;const next=!showPlaybackRequest;closeFloating();setShowPlaybackRequest(next)}} aria-label="درخواست از میزبان" title={requestCooldownLeft>0?`درخواست بعدی تا ${requestCooldownLeft} ثانیه دیگر`:'درخواست از میزبان'}><Icon name="bell" size={20}/>{requestCooldownLeft>0&&<small>{requestCooldownLeft}</small>}</button></div>}
              <span className="time-label current">{formatClock(currentTime)}</span>
              <div ref={timelineWrapRef} className={`timeline-wrap ${isHost?'seek-enabled':'preview-only'}`} onPointerDown={handleTimelinePointerDown} onPointerMove={handleTimelinePointerMove} onPointerUp={hideTimelinePreview} onPointerCancel={hideTimelinePreview} onPointerLeave={e=>{if(e.pointerType==='mouse')hideTimelinePreview(e)}} onContextMenu={e=>e.preventDefault()}>
                <input className="timeline" type="range" min="0" max={Math.max(duration||0,1)} step="0.1" value={Math.min(currentTime,duration||0)} onChange={e=>isHost&&seekTo(e.target.value)} aria-label={isHost?'زمان ویدیو؛ برای جابه‌جایی بکش':'زمان ویدیو؛ برای پیش‌نمایش نگه دار'} aria-disabled={!isHost||!duration} tabIndex={isHost?0:-1}/>
                {timelinePreviewActivated&&<div className={`timeline-preview ${timelinePreview.visible?'visible':''}`} style={{left:`${timelinePreview.left}px`}} aria-hidden="true"><div className="timeline-preview-frame"><video ref={timelinePreviewVideoRef} muted playsInline preload="metadata"/></div><b>{formatClock(timelinePreview.time)}</b></div>}
              </div>
              <span className="time-label total">{formatClock(duration)}</span>
              <div className="volume-control-wrap" onPointerEnter={volumePointerEnter} onPointerLeave={volumePointerLeave}>
                {showVolume&&<div className="volume-popover floating-panel" onPointerEnter={e=>{clearTimeout(volumeHoverCloseRef.current);e.stopPropagation()}} onClick={e=>e.stopPropagation()}>{isiOS?<div className="ios-volume-note"><Icon name="volume"/><span>در iPhone صدا را با دکمه‌های کناری گوشی تنظیم کن.</span></div>:<><button type="button" className="volume-popover-mute" onClick={toggleMute} aria-label={muted?'وصل کردن صدا':'قطع صدا'}><Icon name={muted||volume===0?'muted':'volume'} size={18}/></button><input type="range" min="0" max="1" step="0.05" value={muted?0:volume} onChange={e=>setLocalVolume(e.target.value)} aria-label="میزان صدا"/><span>{Math.round((muted?0:volume)*100)}٪</span></>}</div>}
                <button className="control-btn volume-control-btn" onClick={handleVolumeButton} aria-label={muted?'صدا قطع است':'صدا'} title={showVolume?'کلیک برای قطع/وصل صدا':'تنظیم صدا'}><Icon name={muted||volume===0?'muted':'volume'}/></button>
              </div>
              {isHost&&<button className="rate-control aux-control" onClick={changeRate} aria-label="سرعت پخش">{rate}×</button>}
              <button className="control-btn" onClick={toggleFullscreen} aria-label="تمام صفحه" title="تمام صفحه (F)"><Icon name="fullscreen"/></button>
            </div>
          </>}
        </div>

        <div className="desktop-tools">
          <div className="reaction-bar"><span>واکنش سریع</span><div>{REACTIONS.map(e=><button key={e} onClick={()=>sendReaction(e)}>{e}</button>)}</div></div>
          {isHost&&<div className="source-box"><div><b>منبع فیلم</b><small>لینک مستقیم MP4 / WebM / M3U8، آپارات یا پیشنهاد کاربران</small></div><div className="source-row"><input value={videoInput} onChange={e=>setVideoInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&setVideo()} placeholder="https://..."/><button onClick={setVideo} disabled={resolving}>{resolving?'در حال آماده‌سازی…':'تنظیم فیلم'}</button>{videoSuggestions.length>0&&<button type="button" className="suggestion-open-btn" onClick={()=>setShowSource(true)}>پیشنهادها {videoSuggestions.length}</button>}{room.videoUrl&&<button type="button" className="clear-video-btn" onClick={clearVideo}><Icon name="trash" size={16}/><span>حذف</span></button>}</div></div>}
        </div>
      </section>

      {fullscreenActive&&<button type="button" className="fullscreen-chat-toggle" onClick={()=>setFullscreenChatCollapsed(value=>!value)} aria-label={fullscreenChatCollapsed?'نمایش چت':'جمع کردن چت'} title={fullscreenChatCollapsed?'نمایش چت':'جمع کردن چت'}><Icon name={fullscreenChatCollapsed?'panelOpen':'panelClose'} size={20}/></button>}

      <button type="button" className={`chat-backdrop ${chatOpen?'open':''}`} onClick={closeChat} aria-label="بستن چت"/>
      <aside className={`chat-panel ${chatOpen?'mobile-open':''}`} onClick={e=>e.stopPropagation()}>
        <div className="chat-grabber mobile-only" onClick={closeChat}><span/></div>
        <div className="chat-head"><div><b>چت زنده</b><span>{room.members.length} نفر در اتاق</span></div><button className="mobile-close" onClick={closeChat}><Icon name="close"/></button></div>
        <div className="messages" ref={messagesRef}>
          {room.messages.length===0&&<div className="empty-chat"><span><Icon name="chat" size={26}/></span><b>هنوز پیامی نیست</b><small>اولین پیام را تو بفرست؛ فقط اسپویل نکن.</small></div>}
          {room.messages.map(msg=>{
            const role=roleMap.get(msg.roleId);
            const mentionsSelf=Boolean(selfId&&(msg.mentions||[]).some(item=>item.id===selfId));
            return <article key={msg.id} data-message-id={msg.id} className={`${msg.senderId===selfId?'message mine':'message'} ${msg.isHost?'host-message':''} ${msg.isAdmin?'admin-message':''} ${msg.imageUrl?'image-message':''} ${msg.audioUrl?'voice-message':''} ${msg.replyTo?'reply-message':''} ${mentionsSelf?'mentions-me':''}`}>
              <div className="message-top">
                <b>{msg.isHost&&<Icon name="crown" size={13}/>} {msg.isAdmin&&<Icon name="shield" size={12}/>}<span>{msg.senderId===selfId?'شما':msg.senderName}</span>{msg.isAdmin&&<span className="chat-system-badge admin">مدیر</span>}{mentionsSelf&&<span className="chat-system-badge mention">تگ شدی</span>}{role&&<span className="chat-role-badge" style={{'--role-color':role.color||'#6c8cff'}}>{role.emoji&&<span className="role-emoji">{role.emoji}</span>}{role.name}</span>}</b>
                <div className="message-meta">{msg.senderId!==selfId&&<button type="button" className="message-action" onClick={()=>tagMessageSender(msg)} aria-label={`تگ کردن ${msg.senderName}`} title="تگ"><Icon name="tag" size={12}/></button>}<button type="button" className="message-action" onClick={()=>startReply(msg)} aria-label={`پاسخ به ${msg.senderName}`} title="ریپلای"><Icon name="reply" size={13}/></button><time>{formatTime(msg.createdAt)}</time>{msg.senderId===selfId&&<span className={`message-delivery ${msg.seen?'seen':''}`} title={msg.seen?'دیده شد':'ارسال شد'} aria-label={msg.seen?'دیده شد':'ارسال شد'}><Icon name={msg.seen?'doubleCheck':'check'} size={13}/></span>}</div>
              </div>
              {msg.replyTo&&<button type="button" className="message-reply-preview" onClick={()=>scrollToReplyTarget(msg.replyTo.id)}><span><Icon name="reply" size={13}/></span><div><b>{msg.replyTo.senderId===selfId?'شما':msg.replyTo.senderName}</b><small>{replyPreviewText(msg.replyTo)}</small></div></button>}
              {msg.audioUrl&&<VoiceMessage src={msg.audioUrl} durationMs={msg.audioDurationMs}/>}
              {msg.imageUrl&&<a className="chat-image-link" href={msg.imageUrl} target="_blank" rel="noreferrer" aria-label="باز کردن تصویر"><img className="chat-image" src={msg.imageUrl} alt={msg.imageName||'تصویر چت'} loading="lazy" onError={e=>{e.currentTarget.style.display='none';if(e.currentTarget.nextElementSibling)e.currentTarget.nextElementSibling.style.display='flex'}}/><span className="chat-image-fallback"><Icon name="image" size={16}/> باز کردن تصویر</span></a>}
              {msg.text&&<p>{renderChatText(msg.text,msg.mentions,selfId)}</p>}
            </article>;
          })}
          <div className={`typing-indicator ${typingUsers.length?'visible':''}`} aria-live="polite"><span className="typing-dots"><i/><i/><i/></span><b>{typingLabel(typingUsers)}</b>{typingUsers.length>0&&<span>…</span>}</div>
        </div>
        {pendingImage&&<div className="chat-image-compose"><div className="chat-image-compose-preview"><img src={pendingImage.previewUrl} alt="پیش‌نمایش تصویر انتخاب‌شده"/><button type="button" onClick={clearPendingImage} disabled={uploadingImage} aria-label="حذف تصویر"><Icon name="close" size={15}/></button></div><div className="chat-image-compose-body"><textarea value={imageCaption} onChange={e=>setImageCaption(e.target.value.slice(0,500))} placeholder="کپشن تصویر…" maxLength={500}/><button type="button" onClick={sendChatImage} disabled={uploadingImage}>{uploadingImage?'در حال ارسال…':'ارسال تصویر'}</button></div></div>}
        {showEmojiTray&&!pendingImage&&<div className="emoji-tray">{CHAT_EMOJIS.map((e,index)=><button type="button" key={`${e}-${index}`} onClick={()=>insertEmoji(e)}>{e}</button>)}</div>}
        <form className={`chat-form ${replyTo?'has-reply':''} ${voiceRecording?'voice-recording':''}`} onSubmit={sendMessage} autoComplete="off">
          {mentionState&&mentionCandidates.length>0&&<div className="mention-menu" role="listbox" aria-label="انتخاب کاربر برای تگ"><div className="mention-menu-title"><Icon name="tag" size={14}/><span>تگ کردن عضو</span></div><div className="mention-menu-list">{mentionCandidates.map((member,index)=><button type="button" role="option" aria-selected={index===mentionIndex} key={member.id} className={index===mentionIndex?'active':''} onMouseDown={e=>e.preventDefault()} onClick={()=>insertMention(member)}><span className="mention-avatar"><Icon name="user" size={14}/></span><b>{member.name}</b>{member.id===room.hostId&&<small>میزبان</small>}</button>)}</div></div>}
          {replyTo&&<div className="reply-compose-preview"><span className="reply-compose-icon"><Icon name="reply" size={15}/></span><div><b>پاسخ به {replyTo.senderId===selfId?'خودت':replyTo.senderName}</b><small>{replyPreviewText(replyTo)}</small></div><button type="button" onClick={()=>setReplyTo(null)} aria-label="لغو ریپلای"><Icon name="close" size={14}/></button></div>}
          {showImageSource&&<div className="chat-attachment-menu"><button type="button" onClick={()=>openChatImageSource('camera')}><span><Icon name="camera" size={17}/></span><div><b>دوربین</b><small>همین حالا عکس بگیر</small></div></button><button type="button" onClick={()=>openChatImageSource('gallery')}><span><Icon name="image" size={17}/></span><div><b>گالری</b><small>انتخاب از تصاویر گوشی</small></div></button></div>}
          {voiceRecording&&<div className={`voice-recording-ui ${voiceCancelArmed?'cancel-armed':''}`}><span className="voice-record-dot"/><b>{formatClock(voiceDurationMs/1000)}</b><small>{voiceCancelArmed?'رها کن تا لغو شود':'برای لغو به چپ بکش'}</small><button type="button" onClick={()=>stopVoiceRecording(true)}>لغو</button></div>}
          <button type="button" className={`emoji-toggle ${showEmojiTray?'active':''}`} onClick={()=>{setShowEmojiTray(v=>!v);setShowImageSource(false);setMentionState(null)}} aria-label="ایموجی" disabled={voiceRecording}><Icon name="smile"/></button>
          <button type="button" className={`chat-image-btn ${uploadingImage?'uploading':''}`} onClick={chooseChatImage} disabled={uploadingImage||voiceRecording} aria-label="ارسال تصویر"><Icon name="image" size={18}/></button>
          <input ref={imageInputRef} className="chat-image-input" type="file" accept="image/*,.heic,.heif,.avif,.tif,.tiff,.bmp,.jfif,.svg" onChange={e=>prepareChatImage(e.target.files?.[0])}/>
          <input ref={cameraInputRef} className="chat-image-input" type="file" accept="image/*" capture="environment" onChange={e=>prepareChatImage(e.target.files?.[0])}/>
          <input ref={chatInputRef} name="room-chat-message" value={message} onChange={handleMessageChange} onKeyDown={handleChatKeyDown} onClick={e=>updateMentionState(e.currentTarget.value,e.currentTarget.selectionStart??e.currentTarget.value.length)} onFocus={e=>{setShowEmojiTray(false);setShowImageSource(false);updateMentionState(e.currentTarget.value,e.currentTarget.selectionStart??e.currentTarget.value.length);setTimeout(()=>window.visualViewport?.dispatchEvent?.(new Event('resize')),0)}} onBlur={()=>setKeyboardOpen(false)} placeholder={voiceRecording?'در حال ضبط ویس…':uploadingImage?'در حال ارسال تصویر…':'پیام بنویس…'} maxLength={500} autoComplete="off" autoCorrect="off" autoCapitalize="sentences" spellCheck={false} inputMode="text" enterKeyHint="send" aria-autocomplete="list" aria-expanded={Boolean(mentionState&&mentionCandidates.length)} data-lpignore="true" data-1p-ignore="true" data-form-type="other" disabled={voiceRecording}/>
          {message.trim()?<button className="send-btn" aria-label="ارسال" disabled={sendingMessage||voiceRecording}><Icon name="send" size={19}/></button>:<button type="button" className={`chat-voice-btn ${voiceRecording?'recording':''} ${voiceSending?'sending':''}`} aria-label="برای ضبط ویس نگه دار" title="برای ضبط ویس نگه دار" disabled={voiceSending||Boolean(pendingImage)} onPointerDown={startVoiceRecording} onPointerMove={moveVoiceRecording} onPointerUp={finishVoiceRecording} onPointerCancel={()=>stopVoiceRecording(true)}><Icon name="mic" size={18}/></button>}
        </form>
      </aside>
    </div>

    {showSavedVideos&&<div className="modal-backdrop saved-video-backdrop" onClick={()=>!savedVideoBusy&&setShowSavedVideos(false)}><div className="saved-video-modal" role="dialog" aria-modal="true" aria-labelledby="saved-video-title" onClick={e=>e.stopPropagation()}><div className="popover-head"><div><b id="saved-video-title">ویدیوهای ذخیره‌شده</b><small>این لیست برای پروفایل همین مرورگر است و به اتاق خاصی وابسته نیست.</small></div><button type="button" onClick={()=>setShowSavedVideos(false)}><Icon name="close"/></button></div>{canModerate&&room.videoUrl&&<button type="button" className="save-current-progress" onClick={saveCurrentProgress} disabled={savingProgress}><span><Icon name="bookmark" size={18}/></span><div><b>{savingProgress?'در حال ذخیره…':'ذخیره تا اینجای ویدیو'}</b><small>{room.videoTitle||displayHost(room.originalUrl||room.videoUrl)} · {formatClock(currentTime)}</small></div></button>}<div className="saved-video-list">{savedVideos.length===0?<div className="saved-video-empty"><span><Icon name="history" size={23}/></span><b>هنوز چیزی ذخیره نکردی</b><small>{canModerate?'وقتی فیلم در حال پخش است، موقعیت فعلی را ذخیره کن.':'ذخیره‌ها وقتی میزبان یا مدیر باشی از همینجا قابل استفاده‌اند.'}</small></div>:savedVideos.map(item=><article className="saved-video-card" key={item.id}><div className="saved-video-card-main"><b>{item.videoTitle||displayHost(item.originalUrl)}</b><span>{displayHost(item.originalUrl)}</span><small><Icon name="history" size={13}/> ادامه از {formatClock(item.time||0)}</small></div><div className="saved-video-actions"><button type="button" className="saved-video-use" onClick={()=>useSavedVideo(item)} disabled={Boolean(savedVideoBusy)||!canModerate}>{savedVideoBusy===item.id?'…':'ادامه'}</button><button type="button" className="saved-video-delete" onClick={()=>deleteSavedVideo(item)} disabled={Boolean(savedVideoBusy)} aria-label="حذف ذخیره"><Icon name="trash" size={15}/></button></div></article>)}</div><div className="saved-video-footer"><button type="button" onClick={()=>{setShowSavedVideos(false);setShowSource(true)}}><Icon name="link" size={16}/><span>{isHost?'انتخاب ویدیوی دیگر':'پیشنهاد ویدیوی دیگر'}</span></button>{!canModerate&&savedVideos.length>0&&<small>برای پخش یک ذخیره در اتاق باید میزبان یا مدیر باشی.</small>}</div></div></div>}
    {memberActionTarget&&<div className="modal-backdrop member-action-backdrop" onClick={()=>!memberActionBusy&&setMemberActionTarget(null)}><div className="member-action-modal" onClick={e=>e.stopPropagation()}><div className="member-action-head"><span className={`member-action-avatar ${memberActionTarget.isAdmin?'admin':''}`}><Icon name={memberActionTarget.isAdmin?'shield':'user'} size={20}/></span><div><b>{memberActionTarget.name}</b><small>{memberActionTarget.isAdmin?'مدیر اتاق':'عضو اتاق'}</small></div><button type="button" onClick={()=>setMemberActionTarget(null)} disabled={memberActionBusy}><Icon name="close"/></button></div>{isHost&&memberActionTarget.id!==room.hostId&&<button type="button" className={`member-action-admin ${memberActionTarget.isAdmin?'remove':''}`} disabled={memberActionBusy} onClick={()=>setMemberAdmin(memberActionTarget,!memberActionTarget.isAdmin)}><Icon name="shield" size={18}/><div><b>{memberActionTarget.isAdmin?'برداشتن مدیریت':'مدیر کردن'}</b><small>{memberActionTarget.isAdmin?'دسترسی مدیریت این عضو حذف می‌شود':'حداکثر ۳ مدیر کمکی برای اتاق'}</small></div></button>}{canModerate&&memberActionTarget.id!==room.hostId&&(!isAdmin||!memberActionTarget.isAdmin)&&<button type="button" className="member-action-kick" disabled={memberActionBusy} onClick={()=>kickMember(memberActionTarget)}><Icon name="userMinus" size={18}/><div><b>خارج کردن از اتاق</b><small>این کار فقط همین نشست کاربر را خارج می‌کند</small></div></button>}</div></div>}
    {passwordRequired&&<div className="modal-backdrop password-gate-backdrop"><form className="password-gate-modal" onSubmit={submitJoinPassword} onClick={e=>e.stopPropagation()}><span className="password-gate-icon"><Icon name="lock" size={23}/></span><div><h3>این اتاق رمز دارد</h3><p>برای ورود، رمز اتاق را وارد کن.</p></div><input autoFocus type="password" value={joinPassword} onChange={e=>{setJoinPassword(e.target.value.slice(0,64));setPasswordError('')}} placeholder="رمز اتاق" maxLength={64} autoComplete="current-password"/><div className={`password-gate-error ${passwordError?'visible':''}`}>{passwordError||' '}</div><button type="submit" disabled={!joinPassword}>ورود به اتاق</button><a href="/">برگشت به صفحه اول</a></form></div>}
    {showRoomSecurity&&isHost&&<div className="modal-backdrop" onClick={()=>setShowRoomSecurity(false)}><form className="room-security-modal" onSubmit={saveRoomPassword} onClick={e=>e.stopPropagation()}><div className="popover-head"><div><b>رمز اتاق</b><small>{room.passwordProtected?'این اتاق الان با رمز محافظت می‌شود':'در صورت نیاز برای ورود اعضای جدید رمز بگذار'}</small></div><button type="button" onClick={()=>setShowRoomSecurity(false)}><Icon name="close"/></button></div><div className="security-status"><span className={room.passwordProtected?'protected':''}><Icon name="lock" size={16}/></span><div><b>{room.passwordProtected?'رمز فعال است':'بدون رمز'}</b><small>اعضایی که همین حالا داخل اتاق هستند خارج نمی‌شوند.</small></div></div><label>رمز جدید<input autoFocus type="password" value={roomPassword} onChange={e=>setRoomPassword(e.target.value.slice(0,64))} placeholder={room.passwordProtected?'برای تغییر رمز، رمز جدید را بنویس':'حداقل ۴ کاراکتر'} maxLength={64} autoComplete="new-password"/></label><button className="modal-submit" type="submit" disabled={savingPassword||!roomPassword}>{savingPassword?'در حال ذخیره…':room.passwordProtected?'تغییر رمز':'فعال کردن رمز'}</button>{room.passwordProtected&&<button className="security-remove" type="button" disabled={savingPassword} onClick={()=>{setSavingPassword(true);socketRef.current?.emit('room:set-password',{password:''},result=>{setSavingPassword(false);if(result?.ok){joinPasswordRef.current='';setShowRoomSecurity(false);setRoomPassword('');showNotice('رمز اتاق برداشته شد')}else showNotice('برداشتن رمز انجام نشد')})}}>برداشتن رمز اتاق</button>}</form></div>}
    {showRoleManager&&roleTarget&&<div className="modal-backdrop role-backdrop" onClick={closeRoleManager}><div className="role-modal" role="dialog" aria-modal="true" aria-labelledby="role-title" onClick={e=>e.stopPropagation()}><div className="popover-head"><div><b id="role-title">رول برای {roleTarget.name}</b><small>{roleTarget.id===selfId&&!isHost?'فقط رول خودت را می‌توانی تغییر بدهی':'عنوان، رنگ و نشانهٔ رول کنار نام شخص در چت دیده می‌شود'}</small></div><button type="button" onClick={closeRoleManager}><Icon name="close"/></button></div><div className="role-list"><button type="button" className="role-choice role-none" onClick={()=>assignRole(null)}><span>بدون رول</span></button>{(room.roles||[]).map(role=>{const member=room.members.find(m=>m.id===roleTarget.id);const active=member?.roleId===role.id;return <button type="button" key={role.id} className={`role-choice ${active?'active':''}`} style={{'--role-color':role.color||'#6c8cff'}} onClick={()=>assignRole(role.id)}><span><span className="role-choice-dot"/>{role.emoji&&<span className="role-emoji">{role.emoji}</span>}{role.name}</span>{active&&<Icon name="check" size={16}/>}</button>})}</div><form className="role-create-form" onSubmit={createAndAssignRole}><label>رول جدید</label><input autoFocus value={newRoleName} onChange={e=>setNewRoleName(e.target.value)} placeholder="نام رول" maxLength={24}/><div className="role-style-section"><span>ایموجی</span><div className="role-emoji-picker">{ROLE_EMOJIS.map((emoji,index)=><button type="button" key={`${emoji}-${index}`} className={newRoleEmoji===emoji?'active':''} onClick={()=>setNewRoleEmoji(emoji)} aria-label={emoji?`انتخاب ${emoji}`:'بدون ایموجی'}>{emoji||<Icon name="close" size={14}/>}</button>)}</div></div><div className="role-style-section"><span>رنگ</span><div className="role-color-picker">{ROLE_COLORS.map(color=><button type="button" key={color} className={newRoleColor===color?'active':''} style={{'--swatch':color}} onClick={()=>setNewRoleColor(color)} aria-label={`انتخاب رنگ ${color}`}><span/></button>)}</div></div><div className="role-preview"><small>پیش‌نمایش</small><span className="chat-role-badge" style={{'--role-color':newRoleColor}}>{newRoleEmoji&&<span className="role-emoji">{newRoleEmoji}</span>}{newRoleName.trim()||'نام رول'}</span></div><button type="submit" className="role-create-submit" disabled={!newRoleName.trim()}>ساخت و اختصاص</button></form></div></div>}
    {showSource&&<div className="modal-backdrop" onClick={()=>setShowSource(false)}><div className="source-modal" onClick={e=>e.stopPropagation()}>{isHost?<><div className="popover-head"><div><b>انتخاب فیلم</b><small>لینک خودت یا پیشنهادهای اعضای اتاق</small></div><button onClick={()=>setShowSource(false)}><Icon name="close"/></button></div><input autoFocus value={videoInput} onChange={e=>setVideoInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&setVideo()} placeholder="https://..."/><p>آپارات خودکار آماده می‌شود. لینک مستقیم MP4 / WebM / M3U8 از سایت‌های دیگر هم پخش می‌شود؛ بعضی صفحه‌های عادی یا ویدیوهای محافظت‌شده ممکن است لینک مستقیم لازم داشته باشند.</p><div className="source-modal-actions"><button className="modal-submit" onClick={setVideo} disabled={resolving}>{resolving?'در حال آماده‌سازی…':'پخش در اتاق'}</button>{room.videoUrl&&<button type="button" className="modal-clear-video" onClick={clearVideo}><Icon name="trash" size={17}/><span>حذف ویدیو</span></button>}</div><div className="suggestion-review"><div className="suggestion-review-head"><b>پیشنهادهای اعضا</b><small>{videoSuggestions.length?`${videoSuggestions.length} پیشنهاد در انتظار بررسی`:'هنوز پیشنهادی نیست'}</small></div>{videoSuggestions.length>0&&<div className="suggestion-list">{videoSuggestions.map(item=><article className="suggestion-card" key={item.id}><div className="suggestion-meta"><b>{item.senderName}</b><span>{displayHost(item.url)}</span></div><a href={item.url} target="_blank" rel="noreferrer" className="suggestion-url" title={item.url}>{item.url}</a><div className="suggestion-actions"><button type="button" className="suggestion-accept" onClick={()=>acceptSuggestion(item)} disabled={Boolean(resolvingSuggestionId)}>{resolvingSuggestionId===item.id?'در حال بررسی…':'استفاده از این لینک'}</button><button type="button" className="suggestion-reject" onClick={()=>rejectSuggestion(item.id)} disabled={Boolean(resolvingSuggestionId)}>رد</button></div></article>)}</div>}</div></>:<form className="suggest-video-form" onSubmit={suggestVideo}><div className="popover-head"><div><b>پیشنهاد فیلم</b><small>لینک فیلم را برای میزبان بفرست</small></div><button type="button" onClick={()=>setShowSource(false)}><Icon name="close"/></button></div><input autoFocus value={suggestionInput} onChange={e=>setSuggestionInput(e.target.value)} placeholder="https://example.com/video"/><p>می‌توانی لینک هر سایتی را پیشنهاد بدهی. میزبان قبل از پخش آن را بررسی می‌کند؛ برای بعضی سایت‌ها پخش داخل اتاق به لینک مستقیم ویدیو نیاز دارد.</p><button className="modal-submit" type="submit" disabled={!suggestionInput.trim()}>ارسال پیشنهاد به میزبان</button></form>}</div></div>}
    {showLeaveConfirm&&<div className="modal-backdrop leave-backdrop" onClick={()=>setShowLeaveConfirm(false)}><div className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="leave-title" onClick={e=>e.stopPropagation()}><span className="confirm-icon"><Icon name="back" size={24}/></span><h3 id="leave-title">از اتاق خارج می‌شی؟</h3><p>اگر خارج شوی، برای برگشت دوباره باید وارد همین کد اتاق شوی.</p><div className="confirm-actions"><button type="button" className="confirm-cancel" onClick={()=>setShowLeaveConfirm(false)}>نه، می‌مونم</button><button type="button" className="confirm-leave" onClick={leaveRoom}>بله، خروج</button></div></div></div>}
  </main>;
}
