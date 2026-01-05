
import React, { useState, useEffect, useRef } from 'react';
import { X, Download, RefreshCw, Palette, Sparkles, Wand2, MessageSquare, Eraser, Scissors, Image as ImageIcon, RotateCcw, RotateCw, Shirt, Zap, ZoomIn, ZoomOut, Move, Hand, Save, MousePointer2, MonitorPlay, Layers, Undo2, Redo2, Paintbrush, Store, Maximize, CheckCircle2, Upload, Square, Loader2, Copy, Trash2 } from 'lucide-react';
import { saveMockupToSheet, getMockupsFromSheet, saveFinalMockupResult, getImageBase64 } from '../services/googleSheetService';

interface RedesignDetailModalProps {
  imageUrl: string;
  isOpen: boolean;
  onClose: () => void;
  onRemix: (instruction: string) => Promise<void>;
  onRemoveBackground: () => Promise<void>;
  onSplit: () => Promise<string[]>;
  onGenerateMockup: (img: string) => Promise<string>;
  onUpdateImage?: (newImage: string) => void;
  isRemixing: boolean;
  onUndo?: () => void;
  canUndo?: boolean;
  onRedo?: () => void;
  canRedo?: boolean;
  isTShirtMode?: boolean; 
}

interface MockupItem {
  id?: string;
  name: string;
  url: string;
  base64?: string;
  storeName: string;
  type?: string;
}

interface StoreGroup {
  storeName: string;
  mockups: MockupItem[];
}

interface DesignLayer {
  id: string;
  x: number;
  y: number;
  scale: number;
}

/**
 * THUẬT TOÁN ALPHA NÂNG CAO: LOẠI BỎ KHUNG VUÔNG AI VÀ BẢO VỆ MÀU TRẮNG TRONG THIẾT KẾ
 */
export const applyAlphaFilter = async (src: string): Promise<string> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width; canvas.height = img.height;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) { resolve(src); return; }
            ctx.drawImage(img, 0, 0);
            const idata = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = idata.data;
            
            for (let i = 0; i < data.length; i += 4) {
                const r = data[i], g = data[i+1], b = data[i+2];
                // Thuật toán kiểm tra độ "Trắng nền":
                // 1. Độ sáng cao (Brightness > 240)
                // 2. Độ bão hòa cực thấp (Độ chênh lệch giữa các kênh màu < 12)
                const max = Math.max(r, g, b);
                const min = Math.min(r, g, b);
                const diff = max - min;
                const brightness = (r + g + b) / 3;

                if (brightness > 240 && diff < 12) {
                    data[i+3] = 0; // Chuyển về hoàn toàn trong suốt
                }
            }
            ctx.putImageData(idata, 0, 0);
            resolve(canvas.toDataURL('image/png', 1.0));
        };
        img.onerror = () => resolve(src);
        img.src = src;
    });
};

const ManualCleanupEditor: React.FC<{ 
    src: string; 
    onSave: (newImage: string) => void; 
    onCancel: () => void; 
    isSaving?: boolean;
}> = ({ src, onSave, onCancel, isSaving }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(1);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [tool, setTool] = useState<'eraser' | 'pan'>('pan'); 
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [brushSize, setBrushSize] = useState(30);
    const [history, setHistory] = useState<string[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);

    useEffect(() => {
        if (!src) return;
        const init = async () => {
            const filteredSrc = await applyAlphaFilter(src);
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.src = filteredSrc;
            img.onload = () => {
                const canvas = canvasRef.current;
                if (!canvas) return;
                canvas.width = img.width; canvas.height = img.height;
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                if (!ctx) return;
                ctx.drawImage(img, 0, 0);
                const initialData = canvas.toDataURL('image/png');
                setHistory([initialData]);
                setHistoryIndex(0);
                if (containerRef.current) {
                    const cw = containerRef.current.clientWidth;
                    const ch = containerRef.current.clientHeight;
                    setScale(Math.min(cw / img.width, ch / img.height) * 0.9);
                }
            };
        };
        init();
    }, [src]);

    const saveToHistory = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const newData = canvas.toDataURL('image/png');
        setHistory(prev => [...prev.slice(0, historyIndex + 1), newData]);
        setHistoryIndex(prev => prev + 1);
    };

    const handleUndo = () => {
        if (historyIndex > 0) {
            const newIdx = historyIndex - 1;
            setHistoryIndex(newIdx);
            restoreCanvas(history[newIdx]);
        }
    };

    const restoreCanvas = (dataUrl: string) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const img = new Image();
        img.src = dataUrl;
        img.onload = () => {
            ctx?.clearRect(0, 0, canvas.width, canvas.height);
            ctx?.drawImage(img, 0, 0);
        };
    };

    const handleMouseDown = (e: any) => {
        setIsDragging(true);
        const rect = canvasRef.current!.getBoundingClientRect();
        const clientX = e.clientX || e.touches?.[0]?.clientX;
        const clientY = e.clientY || e.touches?.[0]?.clientY;
        const sx = canvasRef.current!.width / rect.width;
        const sy = canvasRef.current!.height / rect.height;
        const x = (clientX - rect.left) * sx;
        const y = (clientY - rect.top) * sy;
        
        if (tool === 'pan') {
            setDragStart({ x: clientX - offset.x, y: clientY - offset.y });
        } else {
            erase(x, y);
        }
    };

    const handleMouseMove = (e: any) => {
        if (!isDragging) return;
        const rect = canvasRef.current!.getBoundingClientRect();
        const clientX = e.clientX || e.touches?.[0]?.clientX;
        const clientY = e.clientY || e.touches?.[0]?.clientY;
        
        if (tool === 'pan') {
            setOffset({ x: clientX - dragStart.x, y: clientY - dragStart.y });
        } else {
            const sx = canvasRef.current!.width / rect.width;
            const sy = canvasRef.current!.height / rect.height;
            erase((clientX - rect.left) * sx, (clientY - rect.top) * sy);
        }
    };

    const erase = (x: number, y: number) => {
        const ctx = canvasRef.current!.getContext('2d');
        if (!ctx) return;
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
    };

    return (
        <div className="absolute inset-0 z-50 bg-slate-900 flex flex-col animate-fade-in">
            <div className="h-14 bg-slate-800 border-b border-slate-700 flex items-center justify-between px-4 z-10 shadow-lg">
                <div className="flex items-center space-x-2">
                    <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-700">
                        <button onClick={() => setTool('pan')} className={`p-2 rounded ${tool === 'pan' ? 'bg-indigo-600' : 'text-slate-400'}`}><Hand size={16} /></button>
                        <button onClick={() => setTool('eraser')} className={`p-2 rounded ${tool === 'eraser' ? 'bg-indigo-600' : 'text-slate-400'}`}><Eraser size={16} /></button>
                    </div>
                    <button onClick={handleUndo} className="p-2 text-slate-400 hover:text-white"><RotateCcw size={16} /></button>
                </div>
                <div className="flex items-center space-x-2">
                    <button onClick={onCancel} className="px-4 py-1 text-xs text-slate-400 font-bold hover:text-white">Huỷ</button>
                    <button onClick={() => onSave(canvasRef.current!.toDataURL('image/png'))} disabled={isSaving} className="px-5 py-1.5 bg-green-600 text-white rounded-lg text-xs font-bold flex items-center shadow-lg"><Save size={14} className="mr-2" /> Lưu thay đổi</button>
                </div>
            </div>
            <div className="flex-1 relative overflow-hidden bg-[url('https://t3.ftcdn.net/jpg/03/35/35/60/360_F_335356066_6yZ1p5F3V1s0v3t5q1s1.jpg')] bg-[length:20px_20px]">
                <div className="w-full h-full flex items-center justify-center" style={{ cursor: tool === 'pan' ? 'grab' : 'crosshair' }}>
                    <div className="relative" style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`, transformOrigin: 'center center' }}>
                        <canvas ref={canvasRef} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={() => {setIsDragging(false); saveToHistory();}} onTouchStart={handleMouseDown} onTouchMove={handleMouseMove} onTouchEnd={() => {setIsDragging(false); saveToHistory();}} className="block shadow-2xl bg-transparent" />
                    </div>
                </div>
            </div>
        </div>
    );
};

const ManualPlacementEditor: React.FC<{ 
    designSrc: string; 
    mockupSrc: string;
    onSave: (finalImage: string) => void; 
    onCancel: () => void; 
    isSaving?: boolean;
}> = ({ designSrc, mockupSrc, onSave, onCancel, isSaving }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [layers, setLayers] = useState<DesignLayer[]>([{ id: '1', x: 0, y: 0, scale: 0.4 }]);
    const [selectedLayerId, setSelectedLayerId] = useState<string>('1');
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [ready, setReady] = useState(false);
    const mImg = useRef<HTMLImageElement | null>(null);
    const transparentDesignCanvas = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
        if (!designSrc || !mockupSrc) return;
        const imgMock = new Image(); const imgDesign = new Image();
        imgMock.crossOrigin = "anonymous"; imgDesign.crossOrigin = "anonymous";
        let loaded = 0;
        const handleLoad = async () => { 
            if (++loaded === 2) { 
                mImg.current = imgMock;
                const filteredDataUrl = await applyAlphaFilter(designSrc);
                const filteredImg = new Image();
                filteredImg.onload = () => {
                    const tempCanvas = document.createElement('canvas'); tempCanvas.width = filteredImg.width; tempCanvas.height = filteredImg.height;
                    const tCtx = tempCanvas.getContext('2d');
                    if (tCtx) { tCtx.drawImage(filteredImg, 0, 0); transparentDesignCanvas.current = tempCanvas; setLayers([{ id: Date.now().toString(), x: imgMock.width/2, y: imgMock.height/2.2, scale: 0.4 }]); setReady(true); }
                };
                filteredImg.src = filteredDataUrl;
            } 
        };
        imgMock.onload = handleLoad; imgDesign.onload = handleLoad;
        imgMock.src = mockupSrc; imgDesign.src = designSrc;
    }, [designSrc, mockupSrc]);

    useEffect(() => {
        if (!ready || !canvasRef.current || !mImg.current || !transparentDesignCanvas.current) return;
        const canvas = canvasRef.current; const ctx = canvas.getContext('2d'); if (!ctx) return;
        canvas.width = mImg.current.naturalWidth || mImg.current.width;
        canvas.height = mImg.current.naturalHeight || mImg.current.height;
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(mImg.current, 0, 0);
        layers.forEach(layer => {
            const dw = transparentDesignCanvas.current!.width * layer.scale;
            const dh = transparentDesignCanvas.current!.height * layer.scale;
            ctx.save(); ctx.translate(layer.x, layer.y);
            if (layer.id === selectedLayerId) { ctx.strokeStyle = '#4f46e5'; ctx.lineWidth = 5; ctx.strokeRect(-dw/2 - 2, -dh/2 - 2, dw + 4, dh + 4); }
            ctx.drawImage(transparentDesignCanvas.current!, -dw/2, -dh/2, dw, dh);
            ctx.restore();
        });
    }, [layers, selectedLayerId, ready]);

    const handleWheel = (e: React.WheelEvent) => {
        if (!selectedLayerId) return;
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.95 : 1.05;
        setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, scale: Math.max(0.01, Math.min(3.0, l.scale * delta)) } : l));
    };

    const handleDown = (e: any) => { 
        if (!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect(); 
        const clientX = e.clientX || e.touches?.[0]?.clientX;
        const clientY = e.clientY || e.touches?.[0]?.clientY;
        const sx = canvasRef.current.width / rect.width;
        const sy = canvasRef.current.height / rect.height;
        const mx = (clientX - rect.left) * sx;
        const my = (clientY - rect.top) * sy;

        const clickedLayer = [...layers].reverse().find(l => {
            const dw = transparentDesignCanvas.current!.width * l.scale; const dh = transparentDesignCanvas.current!.height * l.scale;
            return mx >= l.x - dw/2 && mx <= l.x + dw/2 && my >= l.y - dh/2 && my <= l.y + dh/2;
        });
        if (clickedLayer) { setSelectedLayerId(clickedLayer.id); setIsDragging(true); setDragStart({ x: mx - clickedLayer.x, y: my - clickedLayer.y }); } 
        else { setSelectedLayerId(''); }
    };

    const handleMove = (e: any) => { 
        if (!isDragging || !selectedLayerId || !canvasRef.current) return; 
        const rect = canvasRef.current.getBoundingClientRect(); 
        const clientX = e.clientX || e.touches?.[0]?.clientX;
        const clientY = e.clientY || e.touches?.[0]?.clientY;
        const sx = canvasRef.current.width / rect.width;
        const sy = canvasRef.current.height / rect.height;
        const mx = (clientX - rect.left) * sx;
        const my = (clientY - rect.top) * sy;
        setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, x: mx - dragStart.x, y: my - dragStart.y } : l));
    };

    const handleGenerateHighResSave = () => {
        if (!mImg.current || !transparentDesignCanvas.current) return;
        const finalCanvas = document.createElement('canvas'); finalCanvas.width = 2500; finalCanvas.height = 2500;
        const fCtx = finalCanvas.getContext('2d'); if (!fCtx) return;
        fCtx.imageSmoothingEnabled = true; fCtx.imageSmoothingQuality = 'high';
        fCtx.drawImage(mImg.current, 0, 0, 2500, 2500);
        const ratioX = 2500 / (mImg.current.naturalWidth || mImg.current.width);
        const ratioY = 2500 / (mImg.current.naturalHeight || mImg.current.height);
        layers.forEach(layer => {
            const dw = (transparentDesignCanvas.current!.width * layer.scale) * ratioX;
            const dh = (transparentDesignCanvas.current!.height * layer.scale) * ratioY;
            fCtx.save(); fCtx.translate(layer.x * ratioX, layer.y * ratioY);
            fCtx.drawImage(transparentDesignCanvas.current!, -dw/2, -dh/2, dw, dh); fCtx.restore();
        });
        onSave(finalCanvas.toDataURL('image/png', 1.0));
    };

    return (
        <div className="absolute inset-0 z-50 bg-slate-900 flex flex-col animate-fade-in">
            <div className="h-16 bg-slate-800 border-b border-slate-700 flex items-center justify-between px-4">
                <div className="flex items-center space-x-4">
                    <span className="text-sm font-bold text-white uppercase flex items-center"><Move size={16} className="mr-2 text-indigo-400" /> Vị trí & Alpha Transparency (HQ 2500px Mode)</span>
                    <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-700 space-x-1">
                        {[25, 50, 75, 100].map(p => (
                            <button key={p} onClick={() => setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, scale: p/100 } : l))} className="px-2 py-1 text-[10px] font-bold text-slate-500 hover:text-white rounded">{p}%</button>
                        ))}
                    </div>
                </div>
                <div className="flex items-center space-x-4">
                    <button onClick={onCancel} className="text-slate-400 text-xs font-bold hover:text-white">Huỷ</button>
                    <button onClick={handleGenerateHighResSave} disabled={isSaving} className="bg-indigo-600 px-5 py-2 rounded-lg text-xs font-bold text-white flex items-center shadow-lg hover:bg-indigo-500 transition-all"><Save size={14} className="mr-2" /> Lưu 2500px HQ</button>
                </div>
            </div>
            <div className="flex-1 bg-slate-950 flex items-center justify-center overflow-hidden relative cursor-crosshair" onWheel={handleWheel} onMouseDown={handleDown} onMouseMove={handleMove} onMouseUp={() => setIsDragging(false)} onTouchStart={handleDown} onTouchMove={handleMove} onTouchEnd={() => setIsDragging(false)}>
                {!ready ? <Loader2 className="animate-spin text-indigo-500" size={48} /> : <canvas ref={canvasRef} className="max-w-full max-h-full object-contain shadow-2xl" />}
            </div>
        </div>
    );
};

export const RedesignDetailModal: React.FC<RedesignDetailModalProps> = ({
  isOpen, onClose, imageUrl, onRemix, onRemoveBackground, onUpdateImage, isRemixing, onUndo, canUndo, onRedo, canRedo, isTShirtMode
}) => {
  const [storeGroups, setStoreGroups] = useState<StoreGroup[]>([]);
  const [selectedStore, setSelectedStore] = useState<string | null>(null);
  const [selectedMockupView, setSelectedMockupView] = useState<string | null>(null);
  const [loadingMockups, setLoadingMockups] = useState(false);
  const [designBase64, setDesignBase64] = useState<string>('');
  const [placementMockup, setPlacementMockup] = useState<string | null>(null);
  const [isCleaning, setIsCleaning] = useState(false);
  const [isSavingToBE, setIsSavingToBE] = useState(false);
  const [isProcessingTransparency, setIsProcessingTransparency] = useState(false);
  const [isFetchingMockup, setIsFetchingMockup] = useState(false); 

  useEffect(() => {
    if (isOpen && imageUrl) {
        setIsProcessingTransparency(true);
        const initImage = async () => {
            let base;
            if (imageUrl.startsWith('http')) {
                try { base = await getImageBase64(imageUrl); } catch { base = imageUrl; }
            } else { base = imageUrl; }
            const filtered = await applyAlphaFilter(base);
            setDesignBase64(filtered);
            setIsProcessingTransparency(false);
        };
        initImage(); fetchMockups();
    }
  }, [isOpen, imageUrl]);

  const fetchMockups = async () => {
      setLoadingMockups(true);
      try {
          const res = await getMockupsFromSheet();
          if (res.status === 'success' && res.data) {
              const groups: Record<string, MockupItem[]> = {};
              res.data.forEach((m: any) => {
                  if (!groups[m.storeName]) groups[m.storeName] = [];
                  groups[m.storeName].push(m);
              });
              const storeList = Object.entries(groups).map(([name, items]) => ({ storeName: name, mockups: items }));
              setStoreGroups(storeList);
              if (storeList.length > 0 && !selectedStore) setSelectedStore(storeList[0].storeName);
          }
      } finally { setLoadingMockups(false); }
  };

  const handleSelectMockup = async (mockup: MockupItem) => {
      setIsFetchingMockup(true); 
      try {
          if (mockup.base64?.startsWith('data:')) { setPlacementMockup(mockup.base64); return; }
          const b64 = await getImageBase64(mockup.url);
          setPlacementMockup(b64);
      } catch (e) { alert("Lỗi tải áo mẫu."); } finally { setIsFetchingMockup(false); }
  };

  const handleSavePlacementResult = async (finalBase64: string) => {
      setIsSavingToBE(true);
      try {
          const username = localStorage.getItem('app_username') || 'Anonymous';
          await saveFinalMockupResult(username, 'Final_Mockup', finalBase64);
          setSelectedMockupView(finalBase64);
          setPlacementMockup(null);
      } finally { setIsSavingToBE(false); }
  };

  const handleSaveCleanupResult = async (finalBase64: string) => {
      setIsSavingToBE(true);
      try {
          const trulyFiltered = await applyAlphaFilter(finalBase64);
          if (onUpdateImage) onUpdateImage(trulyFiltered);
          setDesignBase64(trulyFiltered);
          setIsCleaning(false);
      } finally { setIsSavingToBE(false); }
  };

  const downloadImageAs2500px = async (dataUrl: string, filename: string) => {
    const filteredData = await applyAlphaFilter(dataUrl);
    const img = new Image(); img.crossOrigin = "anonymous"; img.src = filteredData;
    img.onload = () => {
        const canvas = document.createElement('canvas'); canvas.width = 2500; canvas.height = 2500;
        const ctx = canvas.getContext('2d'); if (!ctx) return;
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
        ctx.clearRect(0, 0, 2500, 2500);
        const scale = Math.min(2500 / img.width, 2500 / img.height);
        const w = img.width * scale; const h = img.height * scale;
        ctx.drawImage(img, (2500 - w) / 2, (2500 - h) / 2, w, h);
        const link = document.createElement('a'); link.href = canvas.toDataURL('image/png', 1.0); link.download = filename; link.click();
    };
  };

  if (!isOpen) return null;
  const currentMainImage = selectedMockupView || designBase64 || imageUrl;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/90 backdrop-blur-md" onClick={onClose} />
      
      {isCleaning && <ManualCleanupEditor src={designBase64 || imageUrl} onSave={handleSaveCleanupResult} onCancel={() => setIsCleaning(false)} isSaving={isSavingToBE} />}
      {placementMockup && <ManualPlacementEditor designSrc={designBase64 || imageUrl} mockupSrc={placementMockup} onSave={handleSavePlacementResult} onCancel={() => setPlacementMockup(null)} isSaving={isSavingToBE} />}

      {isFetchingMockup && (
          <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center animate-fade-in">
              <div className="bg-slate-900 p-8 rounded-2xl border border-slate-800 shadow-2xl flex flex-col items-center">
                  <Loader2 className="animate-spin text-indigo-500 mb-4" size={48} />
                  <p className="text-white font-bold uppercase tracking-widest text-sm animate-pulse">Đang tải áo mẫu...</p>
              </div>
          </div>
      )}

      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-slate-900 rounded-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden border border-slate-800 shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
            <h3 className="text-lg font-bold text-slate-200 flex items-center">
                <Wand2 className="w-5 h-5 mr-2 text-indigo-500" /> 
                Thiết kế & Alpha Transparency (High Resolution Mode)
            </h3>
            <div className="flex items-center space-x-2">
              <button onClick={() => setIsCleaning(true)} className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold shadow-lg hover:bg-indigo-500 transition-all"><Paintbrush size={14} /> <span>Cleanup Tool</span></button>
              <div className="w-[1px] h-6 bg-slate-700 mx-2" />
              <button onClick={onUndo} disabled={!canUndo} className="p-2 bg-slate-800 rounded-lg text-slate-300 disabled:opacity-50 hover:text-white transition-colors"><RotateCcw size={16} /></button>
              <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-full"><X size={24} /></button>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row h-full overflow-hidden">
            <div className="w-full lg:w-2/3 bg-slate-950 relative flex items-center justify-center p-4">
                <div className="relative w-full h-full flex flex-col items-center justify-center">
                    <div className="absolute inset-0 z-0 bg-[linear-gradient(45deg,#1e293b_25%,transparent_25%,transparent_75%,#1e293b_75%,#1e293b),linear-gradient(45deg,#1e293b_25%,transparent_25%,transparent_75%,#1e293b_75%,#1e293b)] bg-[length:20px_20px] bg-[position:0_0,10px_10px] opacity-20" />
                    {isProcessingTransparency ? <Loader2 className="animate-spin text-indigo-500" size={32} /> : <img src={currentMainImage} alt="Main" className="max-w-full max-h-full object-contain shadow-2xl rounded-lg z-10" />}
                    <div className="mt-4 flex gap-2 z-30">
                        <button onClick={() => downloadImageAs2500px(currentMainImage, "design-2500x2500.png")} className="bg-indigo-600 text-white px-6 py-2 rounded-full font-bold flex items-center shadow-lg hover:bg-indigo-500 transition-all"><Download size={16} className="mr-2" /> Tải về PNG (2500px HQ)</button>
                        {selectedMockupView && <button onClick={() => setSelectedMockupView(null)} className="bg-slate-800 text-white px-4 py-2 rounded-full hover:bg-slate-700 transition-colors">Thiết kế gốc</button>}
                    </div>
                </div>
            </div>
            <div className="w-full lg:w-1/3 bg-slate-900 border-l border-slate-800 flex flex-col">
              <div className="flex border-b border-slate-800">
                <div className="flex-1 py-3 text-sm font-bold text-center text-purple-400 bg-purple-950/20 border-b-2 border-purple-500 uppercase tracking-widest">Mockup Library</div>
              </div>
              <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
                <div className="space-y-6">
                  {loadingMockups ? <RefreshCw className="animate-spin text-slate-600 mx-auto" /> : (
                      <>
                          <div className="flex flex-wrap gap-2 mb-4">
                              {storeGroups.map(s => <button key={s.storeName} onClick={() => setSelectedStore(s.storeName)} className={`px-3 py-1.5 rounded-full text-[10px] font-bold ${selectedStore === s.storeName ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400'}`}>{s.storeName}</button>)}
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                              {storeGroups.find(s => s.storeName === selectedStore)?.mockups.map((m, i) => (
                                  <button key={i} onClick={() => handleSelectMockup(m)} className="relative aspect-[3/4] bg-slate-800 rounded-xl border border-slate-700 overflow-hidden group hover:border-purple-500 transition-all shadow-md">
                                      <img src={m.url} alt={m.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                          <span className="text-[10px] font-bold text-white uppercase bg-purple-600 px-3 py-1.5 rounded-lg shadow-lg">Áp dụng</span>
                                      </div>
                                  </button>
                              ))}
                          </div>
                      </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
