
import React, { useState, useEffect, useRef } from 'react';
import { X, Download, RefreshCw, Palette, Sparkles, Wand2, MessageSquare, Eraser, Scissors, Image as ImageIcon, RotateCcw, RotateCw, Shirt, Zap, ZoomIn, ZoomOut, Move, Hand, Save, MousePointer2, MonitorPlay, Layers, Undo2, Redo2, Paintbrush, Store, Maximize, CheckCircle2, Upload, Square, Loader2, Copy, Trash2 } from 'lucide-react';
import { saveMockupToSheet, getMockupsFromSheet, saveFinalMockupResult, getImageBase64 } from '../services/googleSheetService';

interface RedesignDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
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

const COLOR_PALETTE = [
  { name: 'Classic Red', hex: '#ef4444' },
  { name: 'Forest Green', hex: '#15803d' },
  { name: 'Royal Gold', hex: '#fbbf24' },
  { name: 'Ice Blue', hex: '#3b82f6' },
  { name: 'Midnight', hex: '#1e293b' },
  { name: 'Pure White', hex: '#ffffff' },
  { name: 'Lavender', hex: '#a855f7' },
  { name: 'Rose Gold', hex: '#f43f5e' },
];

/**
 * THUẬT TOÁN MAGIC ALPHA CHẤT LƯỢNG CAO - CHỈ DÙNG CHO THIẾT KẾ GỐC
 */
export const applyAlphaFilter = async (src: string): Promise<string> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) { resolve(src); return; }
            
            ctx.drawImage(img, 0, 0);
            const idata = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = idata.data;
            const w = canvas.width, h = canvas.height;
            
            for (let i = 0; i < data.length; i += 4) {
                const r = data[i], g = data[i+1], b = data[i+2];
                const brightness = (r + g + b) / 3;
                const isGrayish = Math.abs(r - g) < 10 && Math.abs(g - b) < 10;
                if (brightness > 225 && isGrayish) {
                    data[i+3] = 0; 
                }
            }
            
            const visited = new Uint8Array(w * h);
            const stack = [[0, 0], [w-1, 0], [0, h-1], [w-1, h-1]];
            while (stack.length > 0) {
                const [x, y] = stack.pop()!;
                if (x < 0 || x >= w || y < 0 || y >= h) continue;
                const idx = y * w + x;
                if (visited[idx]) continue;
                visited[idx] = 1;
                const off = idx * 4;
                if (data[off+3] === 0 || ((data[off] + data[off+1] + data[off+2])/3 > 195)) {
                    data[off+3] = 0;
                    stack.push([x+1, y], [x-1, y], [x, y+1], [x, y-1]);
                }
            }
            ctx.putImageData(idata, 0, 0);
            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => resolve(src);
        img.src = src;
    });
};

/**
 * TRÌNH CHỈNH SỬA THỦ CÔNG: Manual Cleanup
 */
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
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [brushSize, setBrushSize] = useState(30);
    const [tool, setTool] = useState<'eraser' | 'pan' | 'magic'>('pan'); 
    const [tolerance, setTolerance] = useState(30); 
    const [isPolishing, setIsPolishing] = useState(false);
    const [canvasBg, setCanvasBg] = useState<string>('checkerboard');
    const [history, setHistory] = useState<string[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);

    useEffect(() => {
        if (!src) return;
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = src; 
        img.onload = () => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) return;
            ctx.drawImage(img, 0, 0);
            const initialData = canvas.toDataURL('image/png');
            setHistory([initialData]);
            setHistoryIndex(0);
            if (containerRef.current) {
                const cw = containerRef.current.clientWidth;
                const ch = containerRef.current.clientHeight;
                const initialScale = Math.min(cw / img.width, ch / img.height) * 0.9;
                setScale(initialScale);
            }
        };
        img.onerror = () => onCancel();
    }, [src]);

    const saveToHistory = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const newData = canvas.toDataURL('image/png');
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(newData);
        if (newHistory.length > 20) newHistory.shift();
        setHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
    };

    const handleUndo = () => {
        if (historyIndex > 0) {
            const newIndex = historyIndex - 1;
            setHistoryIndex(newIndex);
            restoreCanvas(history[newIndex]);
        }
    };

    const handleRedo = () => {
        if (historyIndex < history.length - 1) {
            const newIndex = historyIndex + 1;
            setHistoryIndex(newIndex);
            restoreCanvas(history[newIndex]);
        }
    };

    const restoreCanvas = (dataUrl: string) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const img = new Image();
        img.src = dataUrl;
        img.onload = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
        };
    };

    const getMousePos = (e: any) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);
        const x = Math.floor((clientX - rect.left) / (rect.width / canvas.width));
        const y = Math.floor((clientY - rect.top) / (rect.height / canvas.height));
        return { x, y, clientX, clientY };
    };

    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        setScale(s => Math.max(0.1, Math.min(5, s * delta)));
    };

    const handleAutoPolish = async () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        setIsPolishing(true);
        try {
            const currentData = canvas.toDataURL('image/png');
            const polishedData = await applyAlphaFilter(currentData);
            restoreCanvas(polishedData);
            setTimeout(() => {
                saveToHistory();
                setIsPolishing(false);
            }, 200);
        } catch (e) {
            setIsPolishing(false);
        }
    };

    const performFloodFill = (startX: number, startY: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;
        const w = canvas.width, h = canvas.height;
        const imageData = ctx.getImageData(0, 0, w, h);
        const data = imageData.data;
        const startIdx = (startY * w + startX) * 4;
        const sr = data[startIdx], sg = data[startIdx+1], sb = data[startIdx+2];
        const visited = new Uint8Array(w * h);
        const stack = [[startX, startY]];
        while (stack.length > 0) {
            const [x, y] = stack.pop()!;
            const idx = y * w + x;
            if (visited[idx]) continue;
            visited[idx] = 1;
            const offset = idx * 4;
            const diff = Math.abs(data[offset]-sr) + Math.abs(data[offset+1]-sg) + Math.abs(data[offset+2]-sb);
            if (diff <= tolerance * 2) {
                data[offset+3] = 0;
                if (x > 0) stack.push([x - 1, y]);
                if (x < w - 1) stack.push([x + 1, y]);
                if (y > 0) stack.push([x, y - 1]);
                if (y < h - 1) stack.push([x, y + 1]);
            }
        }
        ctx.putImageData(imageData, 0, 0);
        saveToHistory();
    };

    const handleMouseDown = (e: any) => {
        if (tool === 'pan') {
            setIsDragging(true);
            const { clientX, clientY } = getMousePos(e);
            setDragStart({ x: clientX - offset.x, y: clientY - offset.y });
        } else if (tool === 'magic') {
            const { x, y } = getMousePos(e);
            performFloodFill(x, y);
        } else {
            setIsDragging(true);
            erase(e);
        }
    };

    const handleMouseMove = (e: any) => {
        if (!isDragging) return;
        const { clientX, clientY } = getMousePos(e);
        if (tool === 'pan') setOffset({ x: clientX - dragStart.x, y: clientY - dragStart.y });
        else if (tool === 'eraser') erase(e);
    };

    const erase = (e: any) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const { x, y } = getMousePos(e);
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
    };

    const bgStyles: Record<string, any> = {
        'checkerboard': { backgroundImage: "url('https://t3.ftcdn.net/jpg/03/35/35/60/360_F_335356066_6yZ1p5F3V1s0v3t5q1s1.jpg')", backgroundSize: '20px' },
        'white': { backgroundColor: '#ffffff' },
        'black': { backgroundColor: '#000000' },
        'green': { backgroundColor: '#00ff00' }
    };

    return (
        <div className="absolute inset-0 z-50 bg-slate-900 flex flex-col animate-fade-in">
            <div className="h-14 bg-slate-800 border-b border-slate-700 flex items-center justify-between px-4 z-10">
                <div className="flex items-center space-x-3 overflow-x-auto no-scrollbar py-1">
                    <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-700">
                        <button onClick={() => setTool('pan')} className={`p-2 rounded ${tool === 'pan' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`} title="Bàn tay kéo thả"><Hand size={16} /></button>
                        <button onClick={() => setTool('magic')} className={`p-2 rounded ${tool === 'magic' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`} title="Magic Wand (Xóa vùng màu)"><Wand2 size={16} /></button>
                        <button onClick={() => setTool('eraser')} className={`p-2 rounded ${tool === 'eraser' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`} title="Cục tẩy"><Eraser size={16} /></button>
                    </div>

                    <div className="w-[1px] h-6 bg-slate-700" />
                    
                    <button onClick={handleAutoPolish} disabled={isPolishing} className="flex items-center space-x-1 px-3 py-1.5 bg-amber-600 text-white rounded-lg text-[10px] font-bold shadow-lg hover:bg-amber-500 disabled:opacity-50 transition-colors">
                        {isPolishing ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
                        <span>POLISH (Tự động sạch)</span>
                    </button>

                    <div className="w-[1px] h-6 bg-slate-700" />

                    <div className="flex items-center space-x-1 bg-slate-900 rounded-lg p-1 border border-slate-700">
                        <button onClick={handleUndo} disabled={historyIndex <= 0} className="p-2 text-slate-400 disabled:opacity-30"><Undo2 size={16} /></button>
                        <button onClick={handleRedo} disabled={historyIndex >= history.length - 1} className="p-2 text-slate-400 disabled:opacity-30"><RotateCw size={16} /></button>
                    </div>

                    <div className="w-[1px] h-6 bg-slate-700" />

                    <div className="flex items-center space-x-2 bg-slate-900 rounded-lg p-1 border border-slate-700">
                        <span className="text-[10px] font-bold text-slate-500 px-1">NỀN:</span>
                        <button onClick={() => setCanvasBg('checkerboard')} className={`w-6 h-6 rounded border ${canvasBg === 'checkerboard' ? 'border-indigo-500' : 'border-slate-700'}`} style={{backgroundImage: bgStyles.checkerboard.backgroundImage, backgroundSize: 'cover'}} />
                        <button onClick={() => setCanvasBg('white')} className={`w-6 h-6 rounded border bg-white ${canvasBg === 'white' ? 'border-indigo-500' : 'border-slate-700'}`} />
                        <button onClick={() => setCanvasBg('black')} className={`w-6 h-6 rounded border bg-black ${canvasBg === 'black' ? 'border-indigo-500' : 'border-slate-700'}`} />
                        <button onClick={() => setCanvasBg('green')} className={`w-6 h-6 rounded border bg-green-500 ${canvasBg === 'green' ? 'border-indigo-500' : 'border-slate-700'}`} />
                    </div>
                </div>
                <div className="flex items-center space-x-2">
                    <button onClick={onCancel} className="px-4 py-1.5 text-xs font-bold text-slate-400 hover:text-white">Huỷ</button>
                    <button onClick={() => onSave(canvasRef.current!.toDataURL('image/png'))} className="px-5 py-1.5 bg-green-600 text-white rounded-lg text-xs font-bold flex items-center shadow-lg"><Save size={14} className="mr-2" /> Cập nhật</button>
                </div>
            </div>
            <div ref={containerRef} className="flex-1 overflow-hidden" style={bgStyles[canvasBg] || bgStyles.checkerboard} onWheel={handleWheel}>
                <div className="w-full h-full flex items-center justify-center" style={{ cursor: tool === 'pan' ? (isDragging ? 'grabbing' : 'grab') : 'crosshair' }}>
                     <canvas ref={canvasRef} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={() => setIsDragging(false)} onTouchStart={handleMouseDown} onTouchMove={handleMouseMove} onTouchEnd={() => setIsDragging(false)} style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`, transformOrigin: 'center center' }} />
                </div>
            </div>
        </div>
    );
};

/**
 * TRÌNH GHÉP MOCKUP CAO CẤP - HỖ TRỢ NHÂN BẢN THIẾT KẾ & XUẤT 2500x2500
 */
const ManualPlacementEditor: React.FC<{ 
    designSrc: string; 
    mockupSrc: string;
    onSave: (finalImage: string) => void; 
    onCancel: () => void;
    isSaving?: boolean;
}> = ({ designSrc, mockupSrc, onSave, onCancel, isSaving }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [layers, setLayers] = useState<DesignLayer[]>([
        { id: '1', x: 0, y: 0, scale: 0.4 }
    ]);
    const [selectedLayerId, setSelectedLayerId] = useState<string>('1');
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [ready, setReady] = useState(false);
    
    const mImg = useRef<HTMLImageElement | null>(null);
    const transparentDesignCanvas = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
        if (!designSrc || !mockupSrc) return;
        const imgMock = new Image(); 
        const imgDesign = new Image();
        imgMock.crossOrigin = "anonymous"; 
        imgDesign.crossOrigin = "anonymous";
        
        let loaded = 0;
        const handleLoad = async () => { 
            if (++loaded === 2) { 
                mImg.current = imgMock;
                const filteredDataUrl = await applyAlphaFilter(designSrc);
                const filteredImg = new Image();
                filteredImg.onload = () => {
                    const tempCanvas = document.createElement('canvas');
                    tempCanvas.width = filteredImg.width;
                    tempCanvas.height = filteredImg.height;
                    const tCtx = tempCanvas.getContext('2d');
                    if (tCtx) {
                        tCtx.drawImage(filteredImg, 0, 0);
                        transparentDesignCanvas.current = tempCanvas;
                        setLayers([{ id: Date.now().toString(), x: imgMock.width/2, y: imgMock.height/2.2, scale: 0.4 }]);
                        setReady(true);
                    }
                };
                filteredImg.src = filteredDataUrl;
            } 
        };

        imgMock.onload = handleLoad; 
        imgDesign.onload = handleLoad;
        imgMock.src = mockupSrc; 
        imgDesign.src = designSrc;
    }, [designSrc, mockupSrc]);

    useEffect(() => {
        if (!ready || !canvasRef.current || !mImg.current || !transparentDesignCanvas.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        canvas.width = mImg.current.naturalWidth || mImg.current.width;
        canvas.height = mImg.current.naturalHeight || mImg.current.height;
        
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(mImg.current, 0, 0);
        
        // Vẽ tất cả các lớp thiết kế
        layers.forEach(layer => {
            const dw = transparentDesignCanvas.current!.width * layer.scale;
            const dh = transparentDesignCanvas.current!.height * layer.scale;
            ctx.save();
            ctx.translate(layer.x, layer.y);
            // Vẽ viền nếu đang chọn layer này
            if (layer.id === selectedLayerId) {
                ctx.strokeStyle = '#4f46e5';
                ctx.lineWidth = 5;
                ctx.strokeRect(-dw/2 - 2, -dh/2 - 2, dw + 4, dh + 4);
            }
            ctx.drawImage(transparentDesignCanvas.current!, -dw/2, -dh/2, dw, dh);
            ctx.restore();
        });
    }, [layers, selectedLayerId, ready]);

    const handleGenerateHighResSave = () => {
        if (!mImg.current || !transparentDesignCanvas.current) return;
        
        const finalCanvas = document.createElement('canvas');
        finalCanvas.width = 2500;
        finalCanvas.height = 2500;
        
        const fCtx = finalCanvas.getContext('2d');
        if (!fCtx) return;

        fCtx.imageSmoothingEnabled = true;
        fCtx.imageSmoothingQuality = 'high';
        fCtx.clearRect(0, 0, 2500, 2500);

        const origW = mImg.current.naturalWidth || mImg.current.width;
        const origH = mImg.current.naturalHeight || mImg.current.height;
        const ratioX = 2500 / origW;
        const ratioY = 2500 / origH;

        fCtx.drawImage(mImg.current, 0, 0, 2500, 2500);

        layers.forEach(layer => {
            const dw = (transparentDesignCanvas.current!.width * layer.scale) * ratioX;
            const dh = (transparentDesignCanvas.current!.height * layer.scale) * ratioY;
            const dx = layer.x * ratioX;
            const dy = layer.y * ratioY;

            fCtx.save();
            fCtx.translate(dx, dy);
            fCtx.drawImage(transparentDesignCanvas.current!, -dw/2, -dh/2, dw, dh);
            fCtx.restore();
        });

        onSave(finalCanvas.toDataURL('image/png', 1.0));
    };

    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.95 : 1.05;
        setLayers(prev => prev.map(l => 
            l.id === selectedLayerId ? { ...l, scale: Math.max(0.01, Math.min(5, l.scale * delta)) } : l
        ));
    };

    const handleDown = (e: any) => { 
        if (!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect(); 
        const cx = e.clientX || e.touches?.[0]?.clientX;
        const cy = e.clientY || e.touches?.[0]?.clientY;
        const sx = canvasRef.current.width / rect.width;
        const sy = canvasRef.current.height / rect.height;
        
        const mouseX = (cx - rect.left) * sx;
        const mouseY = (cy - rect.top) * sy;

        // Tìm layer được click (ưu tiên layer trên cùng)
        const clickedLayer = [...layers].reverse().find(l => {
            const dw = transparentDesignCanvas.current!.width * l.scale;
            const dh = transparentDesignCanvas.current!.height * l.scale;
            return mouseX >= l.x - dw/2 && mouseX <= l.x + dw/2 &&
                   mouseY >= l.y - dh/2 && mouseY <= l.y + dh/2;
        });

        if (clickedLayer) {
            setSelectedLayerId(clickedLayer.id);
            setIsDragging(true);
            setDragStart({ x: mouseX - clickedLayer.x, y: mouseY - clickedLayer.y }); 
        } else {
            setSelectedLayerId('');
        }
    };

    const handleMove = (e: any) => { 
        if (!isDragging || !selectedLayerId || !canvasRef.current) return; 
        const rect = canvasRef.current.getBoundingClientRect(); 
        const cx = e.clientX || e.touches?.[0]?.clientX;
        const cy = e.clientY || e.touches?.[0]?.clientY;
        const sx = canvasRef.current.width / rect.width;
        const sy = canvasRef.current.height / rect.height;
        
        const mouseX = (cx - rect.left) * sx;
        const mouseY = (cy - rect.top) * sy;

        setLayers(prev => prev.map(l => 
            l.id === selectedLayerId ? { ...l, x: mouseX - dragStart.x, y: mouseY - dragStart.y } : l
        ));
    };

    const handleDuplicate = () => {
        const source = layers.find(l => l.id === selectedLayerId);
        if (!source) return;
        const newLayer = {
            ...source,
            id: Date.now().toString(),
            x: source.x + 50,
            y: source.y + 50
        };
        setLayers([...layers, newLayer]);
        setSelectedLayerId(newLayer.id);
    };

    const handleRemove = () => {
        if (layers.length <= 1) return;
        const newLayers = layers.filter(l => l.id !== selectedLayerId);
        setLayers(newLayers);
        setSelectedLayerId(newLayers[newLayers.length - 1]?.id || '');
    };

    const PRESET_SCALES = [0.1, 0.25, 0.5, 0.75, 1.0];

    return (
        <div className="absolute inset-0 z-50 bg-slate-900 flex flex-col animate-fade-in">
            <div className="h-16 bg-slate-800 border-b border-slate-700 flex items-center justify-between px-4">
                <div className="flex items-center space-x-4">
                    <span className="text-sm font-bold text-white flex items-center mr-2">
                        <Move size={16} className="mr-2 text-indigo-400" /> Vị trí & Alpha Transparency (HQ 2500px Mode)
                    </span>
                    
                    <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-700">
                        <button onClick={handleDuplicate} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors" title="Nhân bản thiết kế">
                            <Copy size={16} />
                        </button>
                        <button onClick={handleRemove} className="p-2 text-red-500 hover:bg-red-900/20 rounded transition-colors" title="Xoá thiết kế">
                            <Trash2 size={16} />
                        </button>
                    </div>

                    <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-700">
                        {PRESET_SCALES.map(ps => (
                            <button 
                                key={ps} 
                                onClick={() => setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, scale: ps } : l))}
                                className={`px-2 py-1 text-[10px] font-bold rounded transition-all ${layers.find(l => l.id === selectedLayerId)?.scale === ps ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                                {Math.round(ps * 100)}%
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex items-center space-x-4">
                    <div className="flex flex-col items-center">
                        <span className="text-[10px] text-slate-500 font-bold mb-1">Cỡ: {Math.round((layers.find(l => l.id === selectedLayerId)?.scale || 0) * 100)}%</span>
                        <input 
                            type="range" 
                            min="0.01" 
                            max="2" 
                            step="0.01" 
                            value={layers.find(l => l.id === selectedLayerId)?.scale || 0} 
                            onChange={e => setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, scale: parseFloat(e.target.value) } : l))}
                            className="w-32 accent-indigo-500" 
                        />
                    </div>
                    <button onClick={onCancel} className="text-slate-400 px-3 text-xs font-bold">Huỷ</button>
                    <button onClick={handleGenerateHighResSave} disabled={isSaving} className="bg-indigo-600 px-5 py-1.5 rounded-lg text-xs font-bold text-white flex items-center shadow-lg">
                        {isSaving ? <RefreshCw className="mr-2 animate-spin" size={14} /> : <Save size={14} className="mr-2" />}
                        Lưu 2500px
                    </button>
                </div>
            </div>
            <div className="flex-1 bg-slate-950 flex items-center justify-center overflow-hidden cursor-crosshair" onWheel={handleWheel} onMouseDown={handleDown} onMouseMove={handleMove} onMouseUp={() => setIsDragging(false)} onTouchStart={handleDown} onTouchMove={handleMove} onTouchEnd={() => setIsDragging(false)}>
                {!ready ? <RefreshCw className="animate-spin text-indigo-500" size={32} /> : <canvas ref={canvasRef} className="max-w-full max-h-full object-contain shadow-2xl" />}
            </div>
        </div>
    );
};

export const RedesignDetailModal: React.FC<RedesignDetailModalProps> = ({
  isOpen, onClose, imageUrl, onRemix, onRemoveBackground, onUpdateImage, isRemixing, onUndo, canUndo, onRedo, canRedo, isTShirtMode
}) => {
  const [activeTab, setActiveTab] = useState<'colors' | 'mockup'>('colors');
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
                try { 
                  base = await getImageBase64(imageUrl); 
                } catch { 
                  base = imageUrl; 
                }
            } else {
                base = imageUrl;
            }
            const filtered = await applyAlphaFilter(base);
            setDesignBase64(filtered);
            setIsProcessingTransparency(false);
        };
        initImage();
        if (activeTab === 'mockup') fetchMockups();
    }
  }, [isOpen, imageUrl, activeTab]);

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
      } catch (e) { console.error(e); } finally { setLoadingMockups(false); }
  };

  const handleSelectMockup = async (mockup: MockupItem) => {
      setIsFetchingMockup(true); 
      try {
          if (mockup.base64?.startsWith('data:')) {
              setPlacementMockup(mockup.base64);
              return;
          }
          const b64 = await getImageBase64(mockup.url);
          setPlacementMockup(b64);
      } catch (e) { 
          alert("Lỗi tải áo mẫu."); 
      } finally {
          setIsFetchingMockup(false); 
      }
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
          const username = localStorage.getItem('app_username') || 'Anonymous';
          await saveFinalMockupResult(username, 'Cleaned_Design', finalBase64);
          setIsCleaning(false);
          const filtered = await applyAlphaFilter(finalBase64);
          if (onUpdateImage) onUpdateImage(filtered);
          setDesignBase64(filtered);
      } finally { setIsSavingToBE(false); }
  };

  const downloadImageAs2500px = (dataUrl: string, filename: string) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = dataUrl;
    img.onload = async () => {
        const canvas = document.createElement('canvas');
        canvas.width = 2500;
        canvas.height = 2500;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.clearRect(0, 0, 2500, 2500);
        
        ctx.drawImage(img, 0, 0, 2500, 2500);

        const link = document.createElement('a');
        link.href = canvas.toDataURL('image/png', 1.0);
        link.download = filename;
        link.click();
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
                  <p className="text-white font-bold text-lg animate-pulse uppercase tracking-widest">Đang tải áo mẫu...</p>
              </div>
          </div>
      )}

      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-slate-900 rounded-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden border border-slate-800 shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
            <h3 className="text-lg font-bold text-slate-200 flex items-center">
                <Wand2 className="w-5 h-5 mr-2 text-indigo-500" /> 
                Thiết kế & Alpha Transparency (HQ 2500px Preview)
            </h3>
            <div className="flex items-center space-x-2">
              <button onClick={() => setIsCleaning(true)} className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold shadow-lg"><Paintbrush size={14} /> <span>Manual Cleanup</span></button>
              <div className="w-[1px] h-6 bg-slate-700 mx-2" />
              <button onClick={onUndo} disabled={!canUndo} className="p-2 bg-slate-800 rounded-lg text-slate-300 disabled:opacity-50"><RotateCcw size={16} /></button>
              <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-full"><X size={24} /></button>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row h-full overflow-hidden">
            <div className="w-full lg:w-2/3 bg-slate-950 relative flex items-center justify-center p-4">
                <div className="relative w-full h-full flex flex-col items-center justify-center">
                    <div className="absolute inset-0 z-0 bg-[linear-gradient(45deg,#1e293b_25%,transparent_25%,transparent_75%,#1e293b_75%,#1e293b),linear-gradient(45deg,#1e293b_25%,transparent_25%,transparent_75%,#1e293b_75%,#1e293b)] bg-[length:20px_20px] bg-[position:0_0,10px_10px] opacity-20" />
                    
                    {isProcessingTransparency ? (
                        <div className="flex flex-col items-center">
                            <RefreshCw className="animate-spin text-indigo-500 mb-4" size={32} />
                            <p className="text-xs text-indigo-300 font-bold">LỌC NỀN ALPHA...</p>
                        </div>
                    ) : (
                        <img key={currentMainImage} src={currentMainImage} alt="Main" className="max-w-full max-h-full object-contain shadow-2xl rounded-lg z-10" />
                    )}

                    <div className="mt-4 flex gap-2 z-30">
                        <button 
                            onClick={() => downloadImageAs2500px(currentMainImage, "design-2500x2500.png")} 
                            className="bg-indigo-600 text-white px-6 py-2 rounded-full font-bold flex items-center shadow-lg hover:bg-indigo-500 transition-all"
                        >
                            <Download size={16} className="mr-2" /> Tải về PNG (2500x2500 HQ)
                        </button>
                        {selectedMockupView && <button onClick={() => setSelectedMockupView(null)} className="bg-slate-800 text-white px-4 py-2 rounded-full hover:bg-slate-700 transition-colors">Thiết kế gốc</button>}
                    </div>
                </div>
            </div>

            <div className="w-full lg:w-1/3 bg-slate-900 border-l border-slate-800 flex flex-col">
              <div className="flex border-b border-slate-800">
                <button onClick={() => setActiveTab('colors')} className={`flex-1 py-3 text-sm font-semibold transition-all ${activeTab === 'colors' ? 'text-indigo-400 border-b-2 border-indigo-500 bg-indigo-950/20' : 'text-slate-500 hover:bg-slate-800'}`}>Màu sắc</button>
                <button onClick={() => setActiveTab('mockup')} className={`flex-1 py-3 text-sm font-semibold transition-all ${activeTab === 'mockup' ? 'text-purple-400 border-b-2 border-purple-500 bg-purple-950/20' : 'text-slate-500 hover:bg-slate-800'}`}>Mockup Store</button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-700">
                {activeTab === 'colors' && <div className="grid grid-cols-2 gap-3 animate-fade-in">{COLOR_PALETTE.map(c => <button key={c.hex} onClick={() => onRemix(`Change color to ${c.name}`)} className="flex items-center p-2 rounded-lg bg-slate-800 border border-slate-700 hover:border-indigo-500 transition-all"><div className="w-6 h-6 rounded-full mr-3 shadow-inner" style={{ backgroundColor: c.hex }} /><span className="text-sm text-slate-400">{c.name}</span></button>)}</div>}
                {activeTab === 'mockup' && (
                  <div className="space-y-6 animate-fade-in">
                    {loadingMockups ? <RefreshCw className="animate-spin text-slate-600 mx-auto" /> : (
                        <>
                            <div className="flex flex-wrap gap-2 mb-4">
                                {storeGroups.map(s => <button key={s.storeName} onClick={() => setSelectedStore(s.storeName)} className={`px-3 py-1.5 rounded-full text-[10px] font-bold ${selectedStore === s.storeName ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400'}`}>{s.storeName}</button>)}
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                {storeGroups.find(s => s.storeName === selectedStore)?.mockups.map((m, i) => (
                                    <button 
                                      key={i} 
                                      onClick={() => handleSelectMockup(m)} 
                                      className="relative aspect-[3/4] bg-slate-800 rounded-xl border border-slate-700 overflow-hidden group hover:border-purple-500 transition-all"
                                    >
                                        <img src={m.url} alt={m.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                            <span className="text-[10px] font-bold text-white uppercase bg-purple-600 px-2 py-1 rounded">Áp dụng</span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
