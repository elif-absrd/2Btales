import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ChangeEvent } from 'react';

import {

  ArrowLeft,
  
  ArrowRight,

  Camera,

  Check,

  ChevronLeft,

  ChevronRight,

  CircleHelp,

  Download,

  Leaf,

  Plus,

  RefreshCw,

  Upload,

  Volume2,

  VolumeX,

  X,

} from 'lucide-react';

import { getAllPhotos, getMeta, putMeta, putPhoto, putPhotos, removePhoto } from './db';

import type { PhotoFilter, PhotoRecord, PhotoView } from './types';

type View = 'booth' | 'book';

type PageTemplateId = 'autumn-memory' | 'music-collage' | 'vinyl-pop' | 'webhead';
type PageTemplateMode = 'auto' | 'manual';

type TemplateSlot = {
  left: number;
  top: number;
  width: number;
  height: number;
  rotation?: number;
};

type PageTemplate = { id: PageTemplateId; name: string; src: string; slots: TemplateSlot[] };
type ResolvedPage = { pageIndex: number; template: PageTemplate; photos: PhotoView[] };
type TurnDirection = 'next' | 'previous';
type TurnAnimation = { from: number; to: number; direction: TurnDirection } | null;

// Slot coordinates are measured from the transparent photo cut-outs in the supplied PNGs.
// The art layer stays above each photo so all frames, stickers and borders remain visible.
const PAGE_TEMPLATES: PageTemplate[] = [
  {
    id: 'autumn-memory',
    name: 'Autumn keepsake',
    src: '/templates/autumn-memory.png',
    slots: [
      { left: 32.4, top: 13.0, width: 56.1, height: 23.25 },
      { left: 8.0, top: 36.3, width: 43.4, height: 25.8 },
      { left: 58.4, top: 56.5, width: 19.7, height: 15.7 },
    ],
  },
  {
    id: 'music-collage',
    name: 'Music & memories',
    src: '/templates/music-collage.png',
    slots: [
      { left: 4.3, top: 1.3, width: 41.3, height: 26.5 },
      { left: 6.4, top: 32.2, width: 35.1, height: 25.5 },
      { left: 62.3, top: 50.0, width: 22.2, height: 10.95 },
      { left: 36.8, top: 78.0, width: 24.9, height: 12.2 },
    ],
  },
  {
    id: 'vinyl-pop',
    name: 'Vinyl & pop',
    src: '/templates/vinyl-pop.png',
    slots: [
      { left: 32.1, top: 11.8, width: 38.9, height: 24.0 },
      { left: 47.8, top: 39.0, width: 41.5, height: 19.8 },
      { left: 31.25, top: 67.3, width: 34.5, height: 18.0 },
    ],
  },
  {
    id: 'webhead',
    name: 'Spider-Man comic',
    src: '/templates/webhead.png',
    slots: [
      { left: 4.0, top: 2.25, width: 44.1, height: 25.4 },
      { left: 33.8, top: 33.5, width: 29.2, height: 26.2 },
      { left: 51.7, top: 62.45, width: 43.2, height: 25.0 },
    ],
  },
];

const AUTO_TEMPLATE_SEQUENCE: PageTemplateId[] = [
  'autumn-memory',
  'music-collage',
  'vinyl-pop',
  'webhead',
];

const TEMPLATE_BY_ID = Object.fromEntries(
  PAGE_TEMPLATES.map(template => [template.id, template]),
) as Record<PageTemplateId, PageTemplate>;

const FILTERS: { id: PhotoFilter; name: string; description: string; css: string; image: string }[] = [

  {

    id: 'autumn',

    name: 'Autumn haze',

    description: 'Warm & soft',

    css: 'sepia(.20) saturate(.90) contrast(.96) brightness(1.03)',

    image: '/assets/filter1.jpg',

  },

  {

    id: 'sepia',

    name: 'Old film',

    description: 'Golden sepia',

    css: 'sepia(.58) saturate(.78) contrast(.96) brightness(1.03)',

    image: '/assets/filter2.jpg',

  },

  {

    id: 'faded',

    name: 'Faded days',

    description: 'Quiet & matte',

    css: 'sepia(.16) saturate(.72) contrast(.82) brightness(1.10)',

    image: '/assets/filter3.jpg',

  },

  {

    id: 'moss',

    name: 'Moss & pine',

    description: 'Earthy greens',

    css: 'sepia(.10) saturate(.78) hue-rotate(9deg) contrast(.94)',

    image: '/assets/filter4.jpg',

  },

];

function filterStyle(filter: PhotoFilter) {

  return FILTERS.find(item => item.id === filter)?.css ?? FILTERS[0].css;

}

function toRecord(photo: PhotoView): PhotoRecord {

  return {

    id: photo.id, blob: photo.blob, createdAt: photo.createdAt, caption: photo.caption,

    filter: photo.filter, order: photo.order, originalName: photo.originalName,

  };

}

function newId() {

  return typeof crypto !== 'undefined' && 'randomUUID' in crypto

    ? crypto.randomUUID()

    : `photo-${Date.now()}-${Math.random().toString(16).slice(2)}`;

}

function formattedDate(timestamp: number) {

  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(timestamp);

}

export default function App() {

  const [view, setView] = useState<View>('booth');

  const [introMinimumDone, setIntroMinimumDone] = useState(false);

  const [introDismissed, setIntroDismissed] = useState(false);

  const [photos, setPhotos] = useState<PhotoView[]>([]);

  const [activeSpread, setActiveSpread] = useState(0);

  const [pageTemplateMode, setPageTemplateMode] = useState<PageTemplateMode>('auto');

  const [pageTemplateOverrides, setPageTemplateOverrides] = useState<Record<string, PageTemplateId>>({});

  const [turnAnimation, setTurnAnimation] = useState<TurnAnimation>(null);

  const [pageTurnSoundEnabled, setPageTurnSoundEnabled] = useState(true);

  const [filter, setFilter] = useState<PhotoFilter>('autumn');

  const [bookTitle, setBookTitle] = useState('Curly Tales');

  const [cameraReady, setCameraReady] = useState(false);

  const [cameraBusy, setCameraBusy] = useState(false);

  const [storageReady, setStorageReady] = useState(false);

  const [saving, setSaving] = useState(false);

  const [toast, setToast] = useState('');

  const [error, setError] = useState('');

  const [draggedPhotoId, setDraggedPhotoId] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const streamRef = useRef<MediaStream | null>(null);

  const urlMapRef = useRef(new Map<string, { blob: Blob; url: string }>());

  const photosRef = useRef<PhotoView[]>([]);

  const turnTimerRef = useRef<number | null>(null);

  const bookStageRef = useRef<HTMLDivElement>(null);

  const audioContextRef = useRef<AudioContext | null>(null);

  const resolvedPages = useMemo<ResolvedPage[]>(() => {
    const pages: ResolvedPage[] = [];
    let photoCursor = 0;
    let pageIndex = 0;

    // Each page consumes the number of photos that fit its selected collage artwork.
    while (photoCursor < photos.length || pages.length < 2) {
      const automaticId = AUTO_TEMPLATE_SEQUENCE[pageIndex % AUTO_TEMPLATE_SEQUENCE.length];
      const templateId = pageTemplateMode === 'manual'
        ? pageTemplateOverrides[String(pageIndex)] ?? automaticId
        : automaticId;
      const template = TEMPLATE_BY_ID[templateId] ?? TEMPLATE_BY_ID[automaticId];
      const pagePhotos = photos.slice(photoCursor, photoCursor + template.slots.length);
      pages.push({ pageIndex, template, photos: pagePhotos });
      photoCursor += template.slots.length;
      pageIndex += 1;
      if (pageIndex > photos.length + 5) break;
    }

    if (pages.length % 2 !== 0) {
      const pageIndex = pages.length;
      const automaticId = AUTO_TEMPLATE_SEQUENCE[pageIndex % AUTO_TEMPLATE_SEQUENCE.length];
      const templateId = pageTemplateMode === 'manual'
        ? pageTemplateOverrides[String(pageIndex)] ?? automaticId
        : automaticId;
      pages.push({ pageIndex, template: TEMPLATE_BY_ID[templateId] ?? TEMPLATE_BY_ID[automaticId], photos: [] });
    }

    return pages;
  }, [photos, pageTemplateMode, pageTemplateOverrides]);

  const spreadCount = Math.max(1, Math.ceil(resolvedPages.length / 2));

  const totalPages = spreadCount * 2;

  const shownPageStart = activeSpread * 2 + 1;

  const playPageTurnSound = useCallback(

    () => {

      if (!pageTurnSoundEnabled) return;

    try {

      const audio = new Audio('/sounds/page-turn.mp3');

      audio.volume = 0.90;

      void audio.play().catch(() => {});

    } catch {

      // Audio is decorative; unsupported or blocked audio must not prevent page turns.

    }

  }, [pageTurnSoundEnabled]);

  const flipSpread = useCallback((direction: TurnDirection) => {
    if (turnAnimation || turnTimerRef.current !== null) return;

    const nextIndex = direction === 'next'
      ? Math.min(spreadCount - 1, activeSpread + 1)
      : Math.max(0, activeSpread - 1);

    if (nextIndex === activeSpread) return;

    playPageTurnSound();
    setTurnAnimation({ from: activeSpread, to: nextIndex, direction });

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    turnTimerRef.current = window.setTimeout(() => {
      setActiveSpread(nextIndex);
      setTurnAnimation(null);
      turnTimerRef.current = null;
    }, reducedMotion ? 80 : 880);
  }, [activeSpread, playPageTurnSound, spreadCount, turnAnimation]);

const showToast = useCallback((message: string) => setToast(message), []);

  useEffect(() => {

    const timer = window.setTimeout(() => setIntroMinimumDone(true), 6500);

    return () => window.clearTimeout(timer);

  }, []);

  useEffect(() => {

    if (!introMinimumDone) return;

    const timer = window.setTimeout(() => setIntroDismissed(true), 720);

    return () => window.clearTimeout(timer);

  }, [introMinimumDone]);

  const attachPhotoUrls = useCallback((records: PhotoRecord[]) => {

    const keepIds = new Set(records.map(record => record.id));

    for (const [id, cached] of urlMapRef.current.entries()) {

      if (!keepIds.has(id)) {

        URL.revokeObjectURL(cached.url);

        urlMapRef.current.delete(id);

      }

    }

    return records.map(record => {

      const cached = urlMapRef.current.get(record.id);

      if (cached && cached.blob === record.blob) return { ...record, url: cached.url };

      if (cached) URL.revokeObjectURL(cached.url);

      const url = URL.createObjectURL(record.blob);

      urlMapRef.current.set(record.id, { blob: record.blob, url });

      return { ...record, url };

    });

  }, []);

  const refreshPhotos = useCallback(async () => {

    const records = await getAllPhotos();

    const next = attachPhotoUrls(records);

    photosRef.current = next;

    setPhotos(next);

  }, [attachPhotoUrls]);

  useEffect(() => {

    let cancelled = false;

    Promise.all([
      getAllPhotos(),
      getMeta<string>('bookTitle'),
      getMeta<number>('activeSpread'),
      getMeta<Record<string, PageTemplateId>>('pageTemplateOverrides'),
      getMeta<PageTemplateMode>('pageTemplateMode'),
    ])
      .then(([records, savedTitle, savedSpread, savedPageTemplates, savedTemplateMode]) => {

        if (cancelled) return;

        const loaded = attachPhotoUrls(records);

        photosRef.current = loaded;

        setPhotos(loaded);

        if (savedTitle) setBookTitle(savedTitle === 'Our little autumn' ? 'Curly Tales' : savedTitle);

        if (typeof savedSpread === 'number') setActiveSpread(Math.min(Math.max(0, savedSpread), Math.max(0, records.length - 1)));
        if (savedPageTemplates && typeof savedPageTemplates === 'object') {
          const validOverrides: Record<string, PageTemplateId> = {};
          for (const [key, value] of Object.entries(savedPageTemplates)) {
            if (PAGE_TEMPLATES.some(template => template.id === value)) validOverrides[key] = value as PageTemplateId;
          }
          setPageTemplateOverrides(validOverrides);
        }
        if (savedTemplateMode === 'auto' || savedTemplateMode === 'manual') setPageTemplateMode(savedTemplateMode);

        setStorageReady(true);

      })

      .catch(reason => {

        if (!cancelled) {

          setStorageReady(true);

          setError(reason instanceof Error ? reason.message : 'Local storage could not be opened.');

        }

      });

    return () => {

      cancelled = true;

      if (turnTimerRef.current !== null) window.clearTimeout(turnTimerRef.current);

      if (audioContextRef.current && audioContextRef.current.state !== 'closed') void audioContextRef.current.close();

      streamRef.current?.getTracks().forEach(track => track.stop());

      urlMapRef.current.forEach(item => URL.revokeObjectURL(item.url));

      urlMapRef.current.clear();

    };

  }, [attachPhotoUrls]);

  useEffect(() => {

    if (!toast) return;

    const timer = window.setTimeout(() => setToast(''), 3000);

    return () => window.clearTimeout(timer);

  }, [toast]);

  useEffect(() => {

    if (view === 'book') void putMeta('activeSpread', activeSpread).catch(() => undefined);

  }, [activeSpread, view]);

  useEffect(() => {
    if (!storageReady) return;
    void putMeta('pageTemplateOverrides', pageTemplateOverrides).catch(() => undefined);
  }, [pageTemplateOverrides, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    void putMeta('pageTemplateMode', pageTemplateMode).catch(() => undefined);
  }, [pageTemplateMode, storageReady]);

  const choosePageTemplate = (pageIndex: number, templateId: PageTemplateId) => {
    setPageTemplateOverrides(current => ({ ...current, [String(pageIndex)]: templateId }));
  };

  useEffect(() => {

    setActiveSpread(current => Math.min(current, Math.max(0, spreadCount - 1)));

  }, [spreadCount]);

useEffect(() => {

    if (view !== 'booth') {

      streamRef.current?.getTracks().forEach(track => track.stop());

      streamRef.current = null;

      setCameraReady(false);

    }

  }, [view]);

  const startCamera = async () => {

    setError('');

    if (!navigator.mediaDevices?.getUserMedia) {

      setError('Camera access is not available here. Open the site in a modern browser over localhost or HTTPS, or upload photos instead.');

      return;

    }

    setCameraBusy(true);

    setCameraReady(false);

    try {

      streamRef.current?.getTracks().forEach(track => track.stop());

      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });

      streamRef.current = stream;

      if (videoRef.current) {

        videoRef.current.srcObject = stream;

        await videoRef.current.play();

      }

      setCameraReady(true);

    } catch (reason) {

      setError(reason instanceof Error && reason.name === 'NotAllowedError'

        ? 'Camera permission was blocked. Allow camera access in your browser settings, or upload photos instead.'

        : 'Could not open the camera. Check that it is connected and not being used by another app.');

    } finally {

      setCameraBusy(false);

    }

  };

  const createRecord = async (blob: Blob, caption = '') => {

    const order = photosRef.current.length ? Math.max(...photosRef.current.map(photo => photo.order)) + 1 : 0;

    const record: PhotoRecord = {

      id: newId(), blob, createdAt: Date.now(), caption, filter,

      order,

    };

    await putPhoto(record);

    await refreshPhotos();

    showToast('Photo saved to scrapbook.');

    return record;

  };

  const capturePhoto = async () => {

    const video = videoRef.current;

    if (!cameraReady || !video || video.videoWidth === 0) {

      setError('The camera is still getting ready. Give it a moment and try again.');

      return;

    }

    setError('');

    const canvas = document.createElement('canvas');

    canvas.width = video.videoWidth;

    canvas.height = video.videoHeight;

    const context = canvas.getContext('2d');

    if (!context) {

      setError('This browser could not prepare the photo. Please try again.');

      return;

    }

    context.translate(canvas.width, 0);

    context.scale(-1, 1);

    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(async blob => {

      if (!blob) {

        setError('The photo could not be created. Please try again.');

        return;

      }

      try {

        await createRecord(blob, `Photo · ${formattedDate(Date.now())}`);

      } catch (reason) {

        setError(reason instanceof Error ? reason.message : 'Could not save this photo to your scrapbook.');

      }

    }, 'image/jpeg', 0.92);

  };

  const handleFiles = async (event: ChangeEvent<HTMLInputElement>) => {

    const files = Array.from(event.target.files ?? []).filter(file => file.type.startsWith('image/'));

    event.target.value = '';

    if (!files.length) return;

    setSaving(true);

    setError('');

    let added = 0;

    let nextOrder = photosRef.current.length ? Math.max(...photosRef.current.map(photo => photo.order)) + 1 : 0;

    try {

      for (const file of files) {

        const order = nextOrder++;

        const record: PhotoRecord = {

          id: newId(), blob: file, createdAt: Date.now() + added, caption: file.name.replace(/\.[^.]+$/, ''), filter, order, originalName: file.name,

        };

        await putPhoto(record);

        added += 1;

      }

      await refreshPhotos();

      showToast(`${added} ${added === 1 ? 'photo' : 'photos'} added to scrapbook.`);

    } catch (reason) {

      await refreshPhotos().catch(() => undefined);

      setError(reason instanceof Error ? reason.message : 'Some photos could not be saved.');

    } finally {

      setSaving(false);

    }

  };

  const updateCaption = async (id: string, caption: string) => {

    const current = photosRef.current.find(photo => photo.id === id);

    if (!current || current.caption === caption) return;

    const updated: PhotoRecord = { ...toRecord(current), caption };

    photosRef.current = photosRef.current.map(photo => photo.id === id ? { ...photo, caption } : photo);

    setPhotos(photosRef.current);

    try {

      await putPhoto(updated);

    } catch {

      showToast('Caption could not be saved. Please try again.');

    }

  };

  const deleteMemory = async (id: string) => {

    try {

      await removePhoto(id);

      await refreshPhotos();

      showToast('Photo removed.');

    } catch {

      showToast('Could not remove that photo.');

    }

  };

  const reorderPhotos = async (fromId: string, toId: string) => {

    if (fromId === toId) return;

    const next = [...photosRef.current];

    const from = next.findIndex(photo => photo.id === fromId);

    const to = next.findIndex(photo => photo.id === toId);

    if (from < 0 || to < 0) return;

    const [moved] = next.splice(from, 1);

    next.splice(to, 0, moved);

    const records = next.map((photo, index) => ({ ...photo, order: index }));

    photosRef.current = records;

    setPhotos(records);

    try {

      await putPhotos(records.map(toRecord));

      showToast('Scrapbook arrangement saved.');

    } catch {

      showToast('Could not save the new photo order.');

      await refreshPhotos();

    }

  };

  const saveBook = async () => {

    setSaving(true);

    try {

      await putPhotos(photosRef.current.map((photo, index) => ({ ...toRecord(photo), order: index })));

      await putMeta('bookTitle', bookTitle.trim() || 'Curly Tales');

      await putMeta('activeSpread', activeSpread);
      await putMeta('pageTemplateOverrides', pageTemplateOverrides);
      await putMeta('pageTemplateMode', pageTemplateMode);

      showToast('Scrapbook saved on this device.');

    } catch (reason) {

      setError(reason instanceof Error ? reason.message : 'The photobook could not be saved.');

    } finally {

      setSaving(false);

    }

  };

  const downloadBook = () => {

    if (!photos.length) {

      showToast('Add photos before printing your scrapbook.');

      return;

    }

    window.print();

  };

  const pageLabel = useMemo(() => `${Math.min(shownPageStart, totalPages)}–${Math.min(shownPageStart + 1, totalPages)} of ${totalPages}`, [shownPageStart, totalPages]);

  const editPhotoCaption = async (photo: PhotoView) => {

    const caption = window.prompt('Write a caption for this memory', photo.caption || '');

    if (caption !== null) await updateCaption(photo.id, caption.trim());

  };

  const renderPage = (pageIndex: number, print = false) => {

    const page = resolvedPages[pageIndex] ?? {

      pageIndex,

      template: TEMPLATE_BY_ID[AUTO_TEMPLATE_SEQUENCE[pageIndex % AUTO_TEMPLATE_SEQUENCE.length]],

      photos: [],

    };

    const { template, photos: pagePhotos } = page;

    return (

      <div className={`paper-page paper-page--template ${pageIndex % 2 === 0 ? 'paper-page--left' : 'paper-page--right'} page-template-${template.id} ${print ? 'paper-page--print' : ''}`} key={`page-${pageIndex}`}>

        <div className="template-page-canvas" data-template={template.id}>

          {template.slots.map((slot, slotIndex) => {

            const photo = pagePhotos[slotIndex];

            if (!photo) return null;

            const slotStyle = {

              left: `${slot.left}%`,

              top: `${slot.top}%`,

              width: `${slot.width}%`,

              height: `${slot.height}%`,

              transform: slot.rotation ? `rotate(${slot.rotation}deg)` : undefined,

              transformOrigin: 'center center',

            };

            return (

              <Fragment key={photo.id}>

                <div

                  className={`template-photo-slot ${draggedPhotoId === photo.id ? 'is-dragging' : ''}`}

                  style={slotStyle}

                  draggable={!print}

                  onDragStart={event => {

                    if (print) return;

                    setDraggedPhotoId(photo.id);

                    event.dataTransfer.setData('text/plain', photo.id);

                    event.dataTransfer.effectAllowed = 'move';

                  }}

                  onDragEnd={() => setDraggedPhotoId(null)}

                  onDragOver={event => { if (!print) event.preventDefault(); }}

                  onDrop={event => {

                    if (print) return;

                    event.preventDefault();

                    const fromId = event.dataTransfer.getData('text/plain') || draggedPhotoId;

                    if (fromId) void reorderPhotos(fromId, photo.id);

                    setDraggedPhotoId(null);

                  }}

                  title={photo.caption || 'Drag to rearrange'}

                >

                  <img src={photo.url} alt={photo.caption || 'Saved memory'} style={{ filter: filterStyle(photo.filter) }} draggable={false} />

                </div>

                {!print && (

                  <div className="template-photo-actions no-print" style={slotStyle}>

                    <button type="button" title="Edit caption" aria-label={`Edit caption for ${photo.caption || 'photo'}`} onClick={() => void editPhotoCaption(photo)}>✎</button>

                    <button type="button" title="Remove photo" aria-label="Remove photo" onClick={() => void deleteMemory(photo.id)}>×</button>

                  </div>

                )}

              </Fragment>

            );

          })}

          <img className="page-template-overlay" src={template.src} alt="" draggable={false} />

        </div>

        {print && <div className="print-page-header"><span>Curly Tales</span><span>{bookTitle}</span></div>}
        {print && <div className="print-page-footer"><span>PHOTO MEMORIES</span><span>{String(pageIndex + 1).padStart(2, '0')}</span></div>}

      </div>

    );

  };

  const renderSpread = (index: number, print = false, extraClass = '') => (

    <div className={`book-spread ${print ? 'book-spread--print' : index === activeSpread ? 'book-spread--active' : ''} ${extraClass}`.trim()} key={`${print ? 'print' : 'screen'}-spread-${index}`}>

      {renderPage(index * 2, print)}

      <div className="book-gutter" aria-hidden="true"><div className="gutter-line" /></div>

      {renderPage(index * 2 + 1, print)}

    </div>

  );

  return (

    <div className="app-shell">

      {!introDismissed && (

        <div

          className={`intro-loader ${introMinimumDone ? 'intro-loader--leaving' : ''}`}

          role="status"

          aria-label="Opening Curly Tales"

        >

          <div className="loader-paper-grain" aria-hidden="true" />

          <div className="loader-portrait-stage loader-portrait-stage--art" aria-hidden="true">

            <img

              className="loader-portrait"

              src="/autumn-face.png"

              alt=""

              draggable={false}

            />

          </div>

        </div>

      )}

      <header className="site-header no-print">

        {/* <div className="header-note"><LockKeyhole size={14} strokeWidth={1.6} /> {storageReady ? '' : 'Opening your camera…'}</div> */}

        <button className="brand" onClick={() => setView('booth')} aria-label="Curly Tales camera">

          <span className="brand-wordmark">Curly <em>Tales</em></span>

        </button>

        <nav className="main-nav" aria-label="Main navigation">

          <button className={`nav-link ${view === 'booth' ? 'active' : ''}`} onClick={() => setView('booth')}>Take photos</button>

          <button className={`nav-link ${view === 'book' ? 'active' : ''}`} onClick={() => setView('book')}>Your book <span className="nav-count">{photos.length}</span></button>

        </nav>

      </header>

      {!storageReady && <div className="loading-line no-print"><span /></div>}

      {view === 'booth' && (

        <main className="booth-view no-print">

          <div className="page-heading page-heading--camera">

            <div className="eyebrow"><span className="eyebrow-line" /> A LITTLE PHOTO SESSION</div>

            <h1>To your little <em>moment.</em></h1>

            <div className="camera-hero-quote">

              <p>Has the pig escaped again?</p>
              <p>Oh its LADY Chinki.</p>

              <span></span>

            </div>

          </div>

          <div className="booth-layout">

            <section className="camera-card">

              <div className="camera-card-top"><span><span className="camera-live-dot" /> YOUR CAMERA</span></div>

              <div className={`camera-viewfinder ${cameraReady ? 'camera-viewfinder--live' : ''}`}>

                <video ref={videoRef} className={`camera-video ${cameraReady ? 'camera-video--live' : ''}`} style={{ filter: filterStyle(filter) }} playsInline muted />

                {!cameraReady && <div className="camera-placeholder">

                  <div className="viewfinder-corners"><i /><i /><i /><i /></div>

                  <div className="placeholder-message"><Camera size={25} strokeWidth={1.35} /><strong>COOL COOL COOL...</strong><span>Start it, pose it and click it!.</span></div> 

                </div>}

                {cameraReady && <div className="viewfinder-corners viewfinder-corners--live"><i /><i /><i /><i /></div>}

                

              </div>

              <div className="camera-controls">

                {cameraReady ? <button className="button button-primary shutter-button" onClick={() => void capturePhoto()}><span className="shutter-ring"><span /></span> Capture this moment</button> : <button className="button button-primary shutter-button" disabled={cameraBusy} onClick={() => void startCamera()}><Camera size={17} /> {cameraBusy ? 'Opening camera…' : 'Open the camera'}</button>}

                {cameraReady && <button className="button button-outline" onClick={startCamera}><RefreshCw size={15} /> Try camera again</button>}

                <button className="button button-outline upload-button" onClick={() => fileInputRef.current?.click()}><Upload size={16} /> Choose photos</button>

              </div>

            </section>

            <aside className="booth-side-panel">

              <div className="side-panel-heading"><span className="eyebrow">CHOOSE A FILTER</span><h2>How should it <em>feel?</em></h2><p className="filter-quote">“I wanna run against the world that is turning”</p></div>

              <div className="filter-list">

                {FILTERS.map((item, index) => <button key={item.id} className={`filter-option ${filter === item.id ? 'selected' : ''}`} onClick={() => setFilter(item.id)}>

                  <span className={`filter-swatch filter-swatch--${item.id}`} style={{ backgroundImage: `url(${item.image})` }} aria-hidden="true" /><span className="filter-copy"><strong>{item.name}</strong><small>{item.description}</small></span>{filter === item.id ? <span className="filter-check"><Check size={13} /></span> : <span className="filter-number">0{index + 1}</span>}

                </button>)}

              </div>

              <button className="button button-book-link" onClick={() => setView('book')}>See your book <ArrowRight size={16} /></button>

            </aside>

          </div>

          {photos.length > 0 && <section className="recent-strip"><div className="recent-strip-heading"><div><span className="eyebrow">LITTLE MOMENTS</span><h2>The moments so far</h2></div><button className="text-link" onClick={() => setView('book')}>Look through them <ArrowRight size={14} /></button></div><div className="thumbnail-row">{photos.slice(-6).reverse().map(photo => <button className="thumbnail" key={photo.id} onClick={() => setView('book')}><img src={photo.url} alt={photo.caption || 'Saved photo'} style={{ filter: filterStyle(photo.filter) }} /></button>)}<button className="thumbnail-add" onClick={() => fileInputRef.current?.click()}><Plus size={20} /><span>Add another</span></button></div></section>}

        </main>

      )}

      {view === 'book' && (

        <main className="book-view no-print">

          <div className="book-heading">

            <div className="book-heading-copy"><button className="back-link" onClick={() => setView('booth')}><ArrowLeft size={15} /> Back to photos</button><h1>Your little <em>book.</em></h1></div>

            <div className="book-actions"><button className="button button-outline" onClick={() => fileInputRef.current?.click()}><Plus size={16} /> Add photos</button><button className="button button-primary" onClick={() => void saveBook()} disabled={saving}><Check size={16} /> {saving ? 'Saving…' : 'Save book'}</button><button className="button button-outline download-button" onClick={downloadBook}><Download size={16} /> Print</button></div>

          </div>

          <div className="book-title-row"><div className="book-title-input-wrap"><input className="book-title-input" aria-label="Photobook title" value={bookTitle} onChange={event => setBookTitle(event.target.value)} onBlur={() => void putMeta('bookTitle', bookTitle.trim() || 'Curly Tales')} /><span className="title-rule" /></div><div className="book-meta"><span className="status-dot" /><span>{photos.length} {photos.length === 1 ? 'photo' : 'photos'}</span></div></div>

          

          <section className="page-design-controls no-print" aria-label="Scrapbook page designs">
            <div className="page-design-copy">
              <span className="eyebrow">PAGE DESIGNS</span>
              <strong>Choose a collage</strong>
            </div>
            <div className="page-design-mode" role="group" aria-label="Page design mode">
              <button type="button" className={pageTemplateMode === 'auto' ? 'selected' : ''} onClick={() => setPageTemplateMode('auto')}>Mix automatically</button>
              <button type="button" className={pageTemplateMode === 'manual' ? 'selected' : ''} onClick={() => setPageTemplateMode('manual')}>Choose designs</button>
            </div>
            {pageTemplateMode === 'manual' && <div className="page-template-selectors">
              {[shownPageStart - 1, shownPageStart].map((pageIndex, side) => {
                const automaticId = AUTO_TEMPLATE_SEQUENCE[pageIndex % AUTO_TEMPLATE_SEQUENCE.length];
                const selectedTemplate = pageTemplateOverrides[String(pageIndex)] ?? resolvedPages[pageIndex]?.template.id ?? automaticId;
                return (
                  <label key={pageIndex} className="page-template-select-label">
                    <span>{side === 0 ? 'Left page' : 'Right page'} · {String(pageIndex + 1).padStart(2, '0')}</span>
                    <select value={selectedTemplate} onChange={event => choosePageTemplate(pageIndex, event.target.value as PageTemplateId)}>
                      {PAGE_TEMPLATES.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}
                    </select>
                  </label>
                );
              })}
            </div>}
          </section>

          <div className="book-stage-wrap">

            <div className="book-stage-decoration book-decoration-left">✳</div><div className="book-stage-decoration book-decoration-right">❧</div>

            <div ref={bookStageRef} className={`book-stage ${turnAnimation ? 'book-stage--turning' : ''}`} aria-label={`Scrapbook pages ${pageLabel}`} aria-live="polite">

              {turnAnimation && renderSpread(turnAnimation.to, false, 'book-spread--underlay')}

              {renderSpread(activeSpread, false, turnAnimation ? `book-spread--turning book-spread--turning-${turnAnimation.direction}` : '')}

            </div>

            <div className="book-side-navigation no-print" aria-label="Turn scrapbook pages">

              <button type="button" className="page-turn-button page-turn-button--side page-turn-button--previous" aria-label="Previous spread" title="Previous spread" disabled={activeSpread === 0 || Boolean(turnAnimation)} onClick={() => flipSpread('previous')}><ChevronLeft size={21} /><span className="visually-hidden">Previous</span></button>

              <button type="button" className="page-turn-button page-turn-button--side page-turn-button--next" aria-label="Next spread" title="Next spread" disabled={activeSpread >= spreadCount - 1 || Boolean(turnAnimation)} onClick={() => flipSpread('next')}><ChevronRight size={21} /><span className="visually-hidden">Next</span></button>

            </div>

          </div>

          <div className="page-turn-footer no-print">

            <div className="page-count"><span>SPREAD</span><strong>{String(activeSpread + 1).padStart(2, '0')} <i>/</i> {String(spreadCount).padStart(2, '0')}</strong><small>Pages {pageLabel}</small></div>

            <button type="button" className={`page-sound-toggle ${pageTurnSoundEnabled ? 'is-enabled' : ''}`} aria-pressed={pageTurnSoundEnabled} onClick={() => setPageTurnSoundEnabled(enabled => !enabled)} title={pageTurnSoundEnabled ? 'Turn page sound off' : 'Turn page sound on'}>{pageTurnSoundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}<span>Page sound {pageTurnSoundEnabled ? 'on' : 'off'}</span></button>

          </div>

          {photos.length === 0 && <div className="book-empty-hint"><span>Start with a memory</span><button className="text-link" onClick={() => setView('booth')}><Camera size={14} /> Open camera</button><button className="text-link" onClick={() => fileInputRef.current?.click()}><Upload size={14} /> Upload photos</button></div>}

          <div className="book-bottom-note"><span>Drag a photo to give it a new place.</span></div>

        </main>

      )}

      <div className="print-book" aria-hidden="true">

        <div className="print-cover"><div className="print-cover-kicker">CURLY TALES</div><Leaf size={44} strokeWidth={1} /><h1>{bookTitle}</h1><p>Photo scrapbook</p><span>✳</span></div>

        {Array.from({ length: totalPages }, (_, pageIndex) => (
        <Fragment key={`print-page-${pageIndex}`}>
          {renderPage(pageIndex, true)}
        </Fragment>
      ))}

      </div>

      <input ref={fileInputRef} className="visually-hidden" type="file" accept="image/*" multiple onChange={event => void handleFiles(event)} />

      {error && <div className="toast toast--error no-print" role="alert"><CircleHelp size={17} /><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss error"><X size={15} /></button></div>}

      {toast && <div className="toast no-print" role="status"><Check size={16} /><span>{toast}</span><button onClick={() => setToast('')} aria-label="Dismiss notification"><X size={14} /></button></div>}

      {saving && <div className="saving-indicator no-print"><span className="saving-spinner" /> Saving your memories</div>}

      <footer className="mobile-footer no-print"><span>Curly Tales</span><span>Made of little moments</span></footer>

    </div>

  );

}