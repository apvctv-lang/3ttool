
import React, { useState, useEffect, useRef } from 'react';
import { X, Download, RefreshCw, Palette, Sparkles, Wand2, MessageSquare, Eraser, Scissors, Image as ImageIcon, RotateCcw, RotateCw, Shirt, Zap, ZoomIn, ZoomOut, Move, Hand, Save, MousePointer2, MonitorPlay, Layers, Undo2, Redo2, Paintbrush, Store, Maximize, CheckCircle2, Upload, Square, Loader2, Copy, Trash2, Send, Sliders, Type as TypeIcon, Hash, User, Map, Check } from 'lucide-react';
import { saveMockupToSheet, getMockupsFromSheet, saveFinalMockupResult, getImageBase64, updateDesignInSheet } from '../services/googleSheetService';
import { selectiveAiEdit, detectEditableElements, cleanupProductImage } from '../services/geminiService';

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

interface EditableElement {
    type: 'text' | 'character' | 'scene';
    value: string;
    box_2d: number[]; // [ymin, xmin, ymax, xmax]
    newValue?: string;
}

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
                const isGrayish = Math.abs(r - g) < 15 && Math.abs(g - b) < 15;
                if (brightness > 210 && isGrayish) {
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
                if (data[off+3] === 0 || ((data[off] + data[off+1] + data[off+2])/3 > 185)) {
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
 * TRÌNH CHỈNH SỬA THỦ CÔNG: Manual Cleanup & AI Magic Edit
 */
const ManualCleanupEditor: React.FC<{ 
    src: string; 
    onSave: (newImage: string) => void; 
    onCancel: () => void; 
    isSaving?: boolean;
}> = ({ src, onSave, onCancel, isSaving }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const maskCanvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(1);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [brushSize, setBrushSize] = useState(40);
    const [tool, setTool] = useState<'eraser' | 'pan' | 'ai' | 'smart'>('pan'); 
    const [isAiProcessing, setIsAiProcessing] = useState(false);
    const [canvasBg, setCanvasBg] = useState<string>('checkerboard');
    const [history, setHistory] = useState<string[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const [lastPos, setLastPos] = useState<{x: number, y: number} | null>(null);

    // Smart Detect State
    const [isDetecting, setIsDetecting] = useState(false);
    const [detectedElements, setDetectedElements] = useState<EditableElement[]>([]);
    const [activeEditElement, setActiveEditElement] = useState<number | null>(null);
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [tempValue, setTempValue] = useState("");

    useEffect(() => {
        if (!src) return;
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = src; 
        img.onload = () => {
            const canvas = canvasRef.current;
            const maskCanvas = maskCanvasRef.current;
            if (!canvas || !maskCanvas) return;
            
            canvas.width = img.width;
            canvas.height = img.height;
            maskCanvas.width = img.width;
            maskCanvas.height = img.height;
            
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

    const restoreCanvas = (dataUrl: string): Promise<void> => {
        return new Promise((resolve) => {
            const canvas = canvasRef.current;
            if (!canvas) { resolve(); return; }
            const ctx = canvas.getContext('2d');
            if (!ctx) { resolve(); return; }
            const img = new Image();
            img.src = dataUrl;
            img.onload = () => {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0);
                resolve();
            };
        });
    };

    const handleSmartDetect = async () => {
        if (!canvasRef.current || isDetecting) return;
        setIsDetecting(true);
        setTool('smart');
        try {
            const baseData = canvasRef.current.toDataURL('image/png');
            const elements = await detectEditableElements(baseData);
            setDetectedElements(elements.map(el => ({ ...el, newValue: el.value })));
        } catch (err) {
            console.error("Detect failed", err);
        } finally {
            setIsDetecting(false);
        }
    };

    const handleAutoRemoveBg = async () => {
        if (!canvasRef.current || isAiProcessing) return;
        setIsAiProcessing(true);
        try {
            const baseData = canvasRef.current.toDataURL('image/png');
            const result = await cleanupProductImage(baseData);
            await restoreCanvas(result);
            saveToHistory();
        } catch (err: any) {
            alert("Lỗi xóa nền: " + err.message);
        } finally {
            setIsAiProcessing(false);
        }
    };

    const handleBoxClick = (index: number) => {
        setActiveEditElement(index);
        setTempValue(detectedElements[index].newValue || detectedElements[index].value);
        setEditModalOpen(true);
    };

    const handleApplySmartEdit = async () => {
        if (activeEditElement === null || !canvasRef.current) return;
        const el = detectedElements[activeEditElement];
        setIsAiProcessing(true);
        setEditModalOpen(false);
        try {
            const baseData = canvasRef.current.toDataURL('image/png');
            const cw = canvasRef.current.width;
            const ch = canvasRef.current.height;

            // Tạo mask cực kỳ chính xác và giới hạn vùng thay đổi
            const finalMaskCanvas = document.createElement('canvas');
            finalMaskCanvas.width = cw;
            finalMaskCanvas.height = ch;
            const fCtx = finalMaskCanvas.getContext('2d');
            if (fCtx) {
                fCtx.fillStyle = "black";
                fCtx.fillRect(0, 0, cw, ch);
                fCtx.fillStyle = "white";
                
                const [ymin, xmin, ymax, xmax] = el.box_2d;
                const x = (xmin / 1000) * cw;
                const y = (ymin / 1000) * ch;
                const w = ((xmax - xmin) / 1000) * cw;
                const h = ((ymax - ymin) / 1000) * ch;
                
                // Thêm một chút padding để AI xử lý viền chữ mượt mà
                const padding = 15; 
                fCtx.fillRect(x - padding, y - padding, w + padding * 2, h + padding * 2);
            }

            const command = el.type === 'text' 
                ? `REPLACE TEXT CONTENT "${el.value}" WITH NEW CONTENT "${tempValue}". DO NOT ALTER SURROUNDING PIXELS OUTSIDE THE ELEMENT. PRESERVE FONT AND LIGHTING.`
                : `MODIFY ${el.type.toUpperCase()} AREA: "${tempValue}". KEEP STYLE IDENTICAL TO SURROUNDING.`;
            
            const editedData = await selectiveAiEdit(baseData, finalMaskCanvas.toDataURL('image/png'), command);
            await restoreCanvas(editedData);
            
            const newElements = [...detectedElements];
            newElements[activeEditElement].value = tempValue;
            newElements[activeEditElement].newValue = tempValue;
            setDetectedElements(newElements);
            saveToHistory();
        } catch (err: any) {
            alert("Lỗi chỉnh sửa: " + err.message);
        } finally {
            setIsAiProcessing(false);
            setActiveEditElement(null);
        }
    };

    const getMousePos = (e: any) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0, clientX: 0, clientY: 0 };
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
        setScale(s => Math.max(0.1, Math.min(10, s * delta)));
    };

    const handleMouseDown = (e: any) => {
        const pos = getMousePos(e);
        if (tool === 'pan' || tool === 'smart') {
            setIsDragging(true);
            setDragStart({ x: pos.clientX - offset.x, y: pos.clientY - offset.y });
        } else if (tool === 'eraser') {
            setIsDragging(true);
            setLastPos({ x: pos.x, y: pos.y });
            erase(pos.x, pos.y);
        } else if (tool === 'ai') {
            setIsDragging(true);
            setLastPos({ x: pos.x, y: pos.y });
            drawMask(pos.x, pos.y);
        }
    };

    const handleMouseMove = (e: any) => {
        if (!isDragging) return;
        const pos = getMousePos(e);
        if (tool === 'pan' || tool === 'smart') {
            setOffset({ x: pos.clientX - dragStart.x, y: pos.clientY - dragStart.y });
        } else if (tool === 'eraser') {
            erase(pos.x, pos.y);
        } else if (tool === 'ai') {
            drawMask(pos.x, pos.y);
        }
    };

    const handleMouseUp = () => {
        setIsDragging(false);
        setLastPos(null);
        if (tool === 'eraser') saveToHistory();
    };

    const erase = (x: number, y: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.globalCompositeOperation = 'destination-out';
        ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = brushSize;
        ctx.beginPath();
        if (lastPos) ctx.moveTo(lastPos.x, lastPos.y);
        else ctx.moveTo(x, y);
        ctx.lineTo(x, y); ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
        setLastPos({ x, y });
    };

    const drawMask = (x: number, y: number) => {
        const mCanvas = maskCanvasRef.current;
        if (!mCanvas) return;
        const ctx = mCanvas.getContext('2d');
        if (!ctx) return;
        ctx.fillStyle = "rgba(239, 68, 68, 0.5)"; 
        ctx.strokeStyle = "rgba(239, 68, 68, 0.5)";
        ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = brushSize;
        ctx.beginPath();
        if (lastPos) ctx.moveTo(lastPos.x, lastPos.y);
        else ctx.moveTo(x, y);
        ctx.lineTo(x, y); ctx.stroke();
        setLastPos({ x, y });
    };

    const bgStyles: Record<string, any> = {
        'checkerboard': { backgroundImage: "url('https://t3.ftcdn.net/jpg/03/35/35/60/360_F_335356066_6yZ1p5F3V1s0v3t5q1s1.jpg')", backgroundSize: '20px' },
        'white': { backgroundColor: '#ffffff' },
        'black': { backgroundColor: '#000000' },
        'gray': { backgroundColor: '#64748b' },
        'blue': { backgroundColor: '#1e3a8a' },
        'green': { backgroundColor: '#064e3b' }
    };

    return (
        <div className="absolute inset-0 z-50 bg-slate-900 flex flex-col animate-fade-in">
            <div className="h-14 bg-slate-800 border-b border-slate-700 flex items-center justify-between px-4 z-10">
                <div className="flex items-center space-x-3 overflow-x-auto no-scrollbar py-1">
                    <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-700">
                        <button onClick={() => setTool('pan')} className={`p-2 rounded ${tool === 'pan' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`} title="Di chuyển"><Hand size={16} /></button>
                        <button onClick={handleSmartDetect} className={`p-2 rounded ${tool === 'smart' ? 'bg-purple-600 text-white' : 'text-slate-400'}`} title="Tự động nhận diện"><Sparkles size={16} /></button>
                        <button onClick={handleAutoRemoveBg} className="p-2 rounded text-teal-400 hover:bg-teal-900/20" title="Xóa nền tự động"><Scissors size={16} /></button>
                        <button onClick={() => setTool('ai')} className={`p-2 rounded ${tool === 'ai' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`} title="Vẽ vùng sửa AI"><Paintbrush size={16} /></button>
                        <button onClick={() => setTool('eraser')} className={`p-2 rounded ${tool === 'eraser' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`} title="Tẩy thủ công"><Eraser size={16} /></button>
                    </div>

                    <div className="flex items-center bg-slate-900 rounded-lg px-3 py-1 border border-slate-700 space-x-2">
                        <input type="range" min="5" max="150" value={brushSize} onChange={(e) => setBrushSize(parseInt(e.target.value))} className="w-24 accent-indigo-500" />
                    </div>

                    <div className="flex items-center space-x-1 bg-slate-900 rounded-lg p-1 border border-slate-700">
                        <button onClick={handleUndo} disabled={historyIndex <= 0} className="p-2 text-slate-400 disabled:opacity-30"><Undo2 size={16} /></button>
                        <button onClick={handleRedo} disabled={historyIndex >= history.length - 1} className="p-2 text-slate-400 disabled:opacity-30"><RotateCw size={16} /></button>
                    </div>

                    <div className="flex items-center space-x-2 bg-slate-900 rounded-lg p-1 border border-slate-700">
                        <button onClick={() => setCanvasBg('white')} className={`w-5 h-5 rounded-full border bg-white ${canvasBg === 'white' ? 'ring-2 ring-indigo-500' : 'border-slate-700'}`} />
                        <button onClick={() => setCanvasBg('black')} className={`w-5 h-5 rounded-full border bg-black ${canvasBg === 'black' ? 'ring-2 ring-indigo-500' : 'border-slate-700'}`} />
                        <button onClick={() => setCanvasBg('gray')} className={`w-5 h-5 rounded-full border bg-slate-500 ${canvasBg === 'gray' ? 'ring-2 ring-indigo-500' : 'border-slate-700'}`} />
                        <button onClick={() => setCanvasBg('blue')} className={`w-5 h-5 rounded-full border bg-blue-900 ${canvasBg === 'blue' ? 'ring-2 ring-indigo-500' : 'border-slate-700'}`} />
                        <button onClick={() => setCanvasBg('green')} className={`w-5 h-5 rounded-full border bg-emerald-900 ${canvasBg === 'green' ? 'ring-2 ring-indigo-500' : 'border-slate-700'}`} />
                    </div>
                </div>
                <div className="flex items-center space-x-2">
                    {isAiProcessing && <div className="flex items-center text-[10px] text-purple-400 font-bold uppercase mr-4"><Loader2 size={12} className="animate-spin mr-2" /> Đang xử lý AI...</div>}
                    <button onClick={onCancel} className="px-4 py-1.5 text-xs font-bold text-slate-400 hover:text-white">Huỷ</button>
                    <button onClick={() => onSave(canvasRef.current!.toDataURL('image/png'))} className="px-5 py-1.5 bg-green-600 text-white rounded-lg text-xs font-bold flex items-center shadow-lg hover:bg-green-500 transition-all"><Save size={14} className="mr-2" /> Lưu kết quả</button>
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                <div ref={containerRef} className="flex-1 relative overflow-hidden" style={bgStyles[canvasBg] || bgStyles.checkerboard} onWheel={handleWheel}>
                    <div className="w-full h-full flex items-center justify-center" style={{ cursor: tool === 'pan' || tool === 'smart' ? (isDragging ? 'grabbing' : 'grab') : 'crosshair' }}>
                        <div className="relative" style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`, transformOrigin: 'center center' }}>
                            <canvas ref={canvasRef} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onTouchStart={handleMouseDown} onTouchMove={handleMouseMove} onTouchEnd={handleMouseUp} className="block shadow-2xl" />
                            <canvas ref={maskCanvasRef} className="absolute inset-0 pointer-events-none block" style={{ opacity: tool === 'ai' ? 1 : 0 }} />
                            
                            {tool === 'smart' && detectedElements.map((el, i) => {
                                const [ymin, xmin, ymax, xmax] = el.box_2d;
                                return (
                                    <div 
                                        key={i}
                                        onClick={() => handleBoxClick(i)}
                                        className={`absolute border-2 transition-all cursor-pointer flex items-center justify-center ${
                                            el.type === 'text' ? 'border-indigo-400 bg-indigo-400/10 hover:bg-indigo-400/30' : 
                                            el.type === 'character' ? 'border-purple-400 bg-purple-400/10 hover:bg-purple-400/30' : 
                                            'border-teal-400 bg-teal-400/10 hover:bg-teal-400/30'
                                        }`}
                                        style={{
                                            top: `${(ymin / 1000) * 100}%`,
                                            left: `${(xmin / 1000) * 100}%`,
                                            width: `${((xmax - xmin) / 1000) * 100}%`,
                                            height: `${((ymax - ymin) / 1000) * 100}%`
                                        }}
                                    >
                                        <div className="absolute -top-6 left-0 bg-slate-900 text-white text-[10px] px-1.5 py-0.5 rounded border border-slate-700 whitespace-nowrap flex items-center shadow-lg uppercase font-bold">
                                            {el.type === 'text' ? <TypeIcon size={10} className="mr-1 text-indigo-400" /> : 
                                             el.type === 'character' ? <User size={10} className="mr-1 text-purple-400" /> : 
                                             <Map size={10} className="mr-1 text-teal-400" />}
                                            {el.type}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {isDetecting && (
                    <div className="absolute inset-0 z-20 bg-black/40 backdrop-blur-sm flex flex-col items-center justify-center">
                        <div className="bg-slate-900 p-8 rounded-2xl border border-slate-800 shadow-2xl flex flex-col items-center">
                             <Sparkles size={48} className="text-purple-500 mb-4 animate-pulse" />
                             <p className="text-white font-bold uppercase tracking-widest text-sm text-center">Đang phân tích thiết kế...</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Smart Edit Modal */}
            {editModalOpen && activeEditElement !== null && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setEditModalOpen(false)} />
                    <div className="relative bg-slate-900 rounded-2xl border border-slate-800 shadow-2xl w-full max-w-sm overflow-hidden animate-zoom-in">
                        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
                            <h4 className="text-sm font-bold text-white flex items-center uppercase tracking-tighter">
                                {detectedElements[activeEditElement].type === 'text' ? <TypeIcon size={16} className="mr-2 text-indigo-400" /> : 
                                 detectedElements[activeEditElement].type === 'character' ? <User size={16} className="mr-2 text-purple-400" /> :
                                 <Map size={16} className="mr-2 text-teal-400" />}
                                Chỉnh sửa {detectedElements[activeEditElement].type}
                            </h4>
                            <button onClick={() => setEditModalOpen(false)} className="text-slate-500 hover:text-white p-1 rounded-full hover:bg-slate-800"><X size={20} /></button>
                        </div>
                        <div className="p-6 space-y-4">
                             <div>
                                 <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Nội dung gốc</label>
                                 <div className="text-xs text-slate-400 italic mb-4 font-mono truncate bg-slate-950 p-2 rounded border border-slate-800">"{detectedElements[activeEditElement].value}"</div>
                                 
                                 <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                                    {detectedElements[activeEditElement].type === 'text' ? 'Nhập chữ mới' : 'Yêu cầu thay đổi (Prompt)'}
                                 </label>
                                 <textarea 
                                    autoFocus
                                    value={tempValue}
                                    onChange={(e) => setTempValue(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all min-h-[100px] resize-none"
                                    onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleApplySmartEdit()}
                                 />
                             </div>
                             <button 
                                onClick={handleApplySmartEdit}
                                disabled={isAiProcessing}
                                className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-bold flex items-center justify-center shadow-lg hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
                             >
                                {isAiProcessing ? <RefreshCw size={18} className="animate-spin mr-2" /> : <Check size={18} className="mr-2" />}
                                Xác nhận cập nhật
                             </button>
                             <p className="text-[9px] text-slate-500 text-center uppercase tracking-wider">Mọi thay đổi sẽ được lưu vào lịch sử</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export const RedesignDetailModal: React.FC<RedesignDetailModalProps> = ({
  isOpen, onClose, imageUrl, onRemix, onRemoveBackground, onUpdateImage, isRemixing, onUndo, canUndo, onRedo, canRedo, isTShirtMode
}) => {
  const [activeTab, setActiveTab] = useState<'mockup'>('mockup');
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
      } catch (e) { console.error(e); } finally { setLoadingMockups(false); }
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
          if (onUpdateImage) onUpdateImage(finalBase64);
          setIsCleaning(false);
          const filtered = await applyAlphaFilter(finalBase64);
          setDesignBase64(filtered);
      } finally { setIsSavingToBE(false); }
  };

  const downloadImageAs2500px = (dataUrl: string, filename: string) => {
    const img = new Image(); img.crossOrigin = "anonymous"; img.src = dataUrl;
    img.onload = () => {
        const canvas = document.createElement('canvas'); canvas.width = 2500; canvas.height = 2500;
        const ctx = canvas.getContext('2d'); if (!ctx) return;
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, 2500, 2500);
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
                  <p className="text-white font-bold text-lg animate-pulse uppercase tracking-widest text-center">Đang tải áo mẫu...</p>
              </div>
          </div>
      )}

      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-slate-900 rounded-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden border border-slate-800 shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4 bg-slate-950">
            <h3 className="text-lg font-bold text-slate-200 flex items-center">
                <Wand2 className="w-5 h-5 mr-2 text-indigo-500" /> 
                HQ Designer & Alpha (2500px Preview)
            </h3>
            <div className="flex items-center space-x-2">
              <button onClick={() => setIsCleaning(true)} className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold shadow-lg hover:bg-indigo-500 hover:scale-[1.02] transition-all"><Paintbrush size={14} /> <span>Manual Cleanup</span></button>
              <button onClick={onRemoveBackground} className="flex items-center space-x-2 px-4 py-2 bg-teal-600 text-white rounded-lg text-xs font-bold shadow-lg hover:bg-teal-500 transition-all"><Scissors size={14} /> <span>Xóa nền (Auto)</span></button>
              <div className="w-[1px] h-6 bg-slate-700 mx-2" />
              <button onClick={onUndo} disabled={!canUndo} className="p-2 bg-slate-800 rounded-lg text-slate-300 disabled:opacity-50 hover:text-white transition-colors"><RotateCcw size={16} /></button>
              <button onClick={onRedo} disabled={!canRedo} className="p-2 bg-slate-800 rounded-lg text-slate-300 disabled:opacity-50 hover:text-white transition-colors"><RotateCw size={16} /></button>
              <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-full transition-colors ml-2"><X size={24} /></button>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row h-full overflow-hidden">
            <div className="w-full lg:w-2/3 bg-slate-950 relative flex items-center justify-center p-4">
                <div className="relative w-full h-full flex flex-col items-center justify-center">
                    <div className="absolute inset-0 z-0 bg-[linear-gradient(45deg,#1e293b_25%,transparent_25%,transparent_75%,#1e293b_75%,#1e293b),linear-gradient(45deg,#1e293b_25%,transparent_25%,transparent_75%,#1e293b_75%,#1e293b)] bg-[length:20px_20px] bg-[position:0_0,10px_10px] opacity-20" />
                    {isProcessingTransparency ? <div className="flex flex-col items-center"><RefreshCw className="animate-spin text-indigo-500 mb-4" size={32} /><p className="text-xs text-indigo-300 font-bold uppercase tracking-widest">Đang xử lý thiết kế...</p></div> : <img key={currentMainImage} src={currentMainImage} alt="Main" className="max-w-full max-h-full object-contain shadow-2xl rounded-lg z-10" />}
                    <div className="mt-4 flex gap-2 z-30">
                        <button onClick={() => downloadImageAs2500px(currentMainImage, "design-2500x2500.png")} className="bg-indigo-600 text-white px-6 py-2 rounded-full font-bold flex items-center shadow-lg hover:bg-indigo-500 transition-all"><Download size={16} className="mr-2" /> Tải về PNG (2500px HQ)</button>
                        {selectedMockupView && <button onClick={() => setSelectedMockupView(null)} className="bg-slate-800 text-white px-4 py-2 rounded-full hover:bg-slate-700 transition-colors border border-slate-700 font-bold">Quay lại gốc</button>}
                    </div>
                </div>
            </div>
            <div className="w-full lg:w-1/3 bg-slate-900 border-l border-slate-800 flex flex-col">
              <div className="flex border-b border-slate-800"><div className="flex-1 py-3 text-sm font-bold text-center text-purple-400 bg-purple-950/20 border-b-2 border-purple-500 uppercase tracking-widest">Mockup Store Manager</div></div>
              <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-700">
                <div className="space-y-6 animate-fade-in">
                  {loadingMockups ? <RefreshCw className="animate-spin text-slate-600 mx-auto" /> : (
                      <>
                          <div className="flex flex-wrap gap-2 mb-4">
                              {storeGroups.map(s => <button key={s.storeName} onClick={() => setSelectedStore(s.storeName)} className={`px-3 py-1.5 rounded-full text-[10px] font-bold mb-1 mr-1 transition-all ${selectedStore === s.storeName ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/30' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}>{s.storeName}</button>)}
                          </div>
                          <div className="grid grid-cols-2 gap-3 mt-4">
                            {storeGroups.find(s => s.storeName === selectedStore)?.mockups.map((m, i) => (
                                <button key={i} onClick={() => handleSelectMockup(m)} className="relative aspect-[3/4] bg-slate-800 rounded-xl border border-slate-700 overflow-hidden group hover:border-purple-500 transition-all shadow-md">
                                    <img src={m.url} alt={m.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                        <span className="text-[10px] font-bold text-white uppercase bg-purple-600 px-3 py-1.5 rounded-lg shadow-lg">Áp dụng Mockup</span>
                                    </div>
                                </button>
                            ))}
                          </div>
                      </>
                  )}
                </div>
              </div>
              <div className="p-4 bg-slate-950 border-t border-slate-800">
                  <p className="text-[10px] text-slate-500 text-center uppercase font-bold tracking-widest">Cloud Assets Port v1.0</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const ManualPlacementEditor: React.FC<{ designSrc: string; mockupSrc: string; onSave: (finalImage: string) => void; onCancel: () => void; isSaving?: boolean; }> = ({ designSrc, mockupSrc, onSave, onCancel, isSaving }) => {
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

    const handleGenerateHighResSave = () => {
        if (!mImg.current || !transparentDesignCanvas.current) return;
        const finalCanvas = document.createElement('canvas'); finalCanvas.width = 2500; finalCanvas.height = 2500;
        const fCtx = finalCanvas.getContext('2d'); if (!fCtx) return;
        fCtx.imageSmoothingEnabled = true; fCtx.imageSmoothingQuality = 'high';
        fCtx.clearRect(0, 0, 2500, 2500);
        const origW = mImg.current.naturalWidth || mImg.current.width;
        const origH = mImg.current.naturalHeight || mImg.current.height;
        const ratioX = 2500 / origW; const ratioY = 2500 / origH;
        fCtx.drawImage(mImg.current, 0, 0, 2500, 2500);
        layers.forEach(layer => {
            const dw = (transparentDesignCanvas.current!.width * layer.scale) * ratioX;
            const dh = (transparentDesignCanvas.current!.height * layer.scale) * ratioY;
            const dx = layer.x * ratioX; const dy = layer.y * ratioY;
            fCtx.save(); fCtx.translate(dx, dy); fCtx.drawImage(transparentDesignCanvas.current!, -dw/2, -dh/2, dw, dh); fCtx.restore();
        });
        onSave(finalCanvas.toDataURL('image/png', 1.0));
    };

    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault(); const delta = e.deltaY > 0 ? 0.95 : 1.05;
        setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, scale: Math.max(0.01, Math.min(5, l.scale * delta)) } : l));
    };

    const handleDown = (e: any) => { 
        if (!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect(); const cx = e.clientX || e.touches?.[0]?.clientX; const cy = e.clientY || e.touches?.[0]?.clientY;
        const sx = canvasRef.current.width / rect.width; const sy = canvasRef.current.height / rect.height;
        const mouseX = (cx - rect.left) * sx; const mouseY = (cy - rect.top) * sy;
        const clickedLayer = [...layers].reverse().find(l => {
            const dw = transparentDesignCanvas.current!.width * l.scale; const dh = transparentDesignCanvas.current!.height * l.scale;
            return mouseX >= l.x - dw/2 && mouseX <= l.x + dw/2 && mouseY >= l.y - dh/2 && mouseY <= l.y + dh/2;
        });
        if (clickedLayer) { setSelectedLayerId(clickedLayer.id); setIsDragging(true); setDragStart({ x: mouseX - clickedLayer.x, y: mouseY - clickedLayer.y }); } 
        else { setSelectedLayerId(''); }
    };

    const handleMove = (e: any) => { 
        if (!isDragging || !selectedLayerId || !canvasRef.current) return; 
        const rect = canvasRef.current.getBoundingClientRect(); const cx = e.clientX || e.touches?.[0]?.clientX; const cy = e.clientY || e.touches?.[0]?.clientY;
        const sx = canvasRef.current.width / rect.width; const sy = canvasRef.current.height / rect.height;
        const mouseX = (cx - rect.left) * sx; const mouseY = (cy - rect.top) * sy;
        setLayers(prev => prev.map(l => l.id === selectedLayerId ? { ...l, x: mouseX - dragStart.x, y: mouseY - dragStart.y } : l));
    };

    const handleDuplicate = () => {
        const source = layers.find(l => l.id === selectedLayerId); if (!source) return;
        const newLayer = { ...source, id: Date.now().toString(), x: source.x + 50, y: source.y + 50 };
        setLayers([...layers, newLayer]); setSelectedLayerId(newLayer.id);
    };

    const handleRemove = () => {
        if (layers.length <= 1) return;
        const newLayers = layers.filter(l => l.id !== selectedLayerId); setLayers(newLayers); setSelectedLayerId(newLayers[newLayers.length - 1]?.id || '');
    };

    return (
        <div className="absolute inset-0 z-50 bg-slate-900 flex flex-col animate-fade-in">
            <div className="h-16 bg-slate-800 border-b border-slate-700 flex items-center justify-between px-4">
                <div className="flex items-center space-x-4"><span className="text-sm font-bold text-white flex items-center mr-2 uppercase tracking-widest"><Move size={16} className="mr-2 text-indigo-400" /> Placement HQ</span>
                    <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-700">
                        <button onClick={handleDuplicate} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"><Copy size={16} /></button>
                        <button onClick={handleRemove} className="p-2 text-red-500 hover:bg-red-900/20 rounded transition-colors"><Trash2 size={16} /></button>
                    </div>
                </div>
                <div className="flex items-center space-x-4">
                    <button onClick={onCancel} className="text-slate-400 px-3 text-xs font-bold hover:text-white transition-colors">Huỷ bỏ</button>
                    <button onClick={handleGenerateHighResSave} disabled={isSaving} className="bg-indigo-600 px-5 py-1.5 rounded-lg text-xs font-bold text-white flex items-center shadow-lg hover:bg-indigo-500 hover:scale-[1.02] transition-all">{isSaving ? <RefreshCw className="mr-2 animate-spin" size={14} /> : <Save size={14} className="mr-2" />} Lưu 2500px</button>
                </div>
            </div>
            <div className="flex-1 bg-slate-950 flex items-center justify-center overflow-hidden cursor-crosshair" onWheel={handleWheel} onMouseDown={handleDown} onMouseMove={handleMove} onMouseUp={() => setIsDragging(false)} onTouchStart={handleDown} onTouchMove={handleMove} onTouchEnd={() => setIsDragging(false)}>
                {!ready ? <RefreshCw className="animate-spin text-indigo-500" size={32} /> : <canvas ref={canvasRef} className="max-w-full max-h-full object-contain shadow-2xl" />}
            </div>
        </div>
    );
};
