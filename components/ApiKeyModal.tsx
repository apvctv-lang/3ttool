
import React, { useState, useMemo } from 'react';
import { X, Save, Key, CheckCircle2 } from 'lucide-react';
import { validateToken } from '../services/geminiService';
import { saveSystemConfig } from '../services/googleSheetService';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ isOpen, onClose }) => {
  const [apiKey, setApiKey] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  // Calculate detected keys
  const detectedKeysCount = useMemo(() => {
     if(!apiKey) return 0;
     return apiKey.split(/[\n\r,;]+/).map(s => s.trim()).filter(s => s.length > 20).length;
  }, [apiKey]);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!apiKey.trim()) return;
    setStatus('saving');
    setErrorMsg('');

    try {
        // 1. Validate Gemini Key (Strict Check)
        await validateToken(apiKey.trim());
        
        // 2. Save to Local Storage
        localStorage.setItem('app_system_key', apiKey.trim());

        // 3. Try Save to Google Sheet (Backend)
        try {
            const sheetRes = await saveSystemConfig(apiKey.trim());
            if (sheetRes.status === 'error') {
                console.warn("Backend Sync Warning:", sheetRes.message);
            }
        } catch (backendErr) {
            console.warn("Backend appears offline or URL is invalid. Key saved locally only.", backendErr);
        }
        
        setStatus('success');
        setTimeout(() => {
            onClose();
            window.location.reload();
        }, 1000);

    } catch (e: any) {
        console.error(e);
        setStatus('error');
        setErrorMsg(e.message || "Key không hợp lệ hoặc lỗi kết nối");
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity" onClick={onClose} />
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md border border-slate-800">
          
          <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
            <h3 className="text-lg font-bold text-slate-200 flex items-center">
              <Key className="w-5 h-5 mr-2 text-indigo-500" />
              System API Key (Admin)
            </h3>
            <button onClick={onClose} className="text-slate-500 hover:text-white">
              <X size={20} />
            </button>
          </div>
          
          <div className="p-6 space-y-4">
            <div className="flex justify-between items-center">
                <p className="text-xs text-slate-400">
                    Nhập danh sách Key (mỗi dòng 1 Key):
                </p>
                {detectedKeysCount > 0 && (
                    <span className="text-xs px-2 py-0.5 bg-green-900/30 text-green-400 rounded-full border border-green-800 flex items-center">
                        <CheckCircle2 size={10} className="mr-1" />
                        Đã tìm thấy {detectedKeysCount} keys
                    </span>
                )}
            </div>
            
            <textarea 
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="AIzaSy...&#10;AIzaSy..."
                className="w-full h-32 p-3 text-xs font-mono bg-slate-950 border border-slate-700 text-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
            />
            
            {status === 'error' && (
                <div className="p-2 bg-red-900/20 border border-red-900/50 rounded text-xs text-red-300">
                    {errorMsg || "Key Lỗi!"}
                </div>
            )}
            
            <button
                onClick={handleSave}
                disabled={status === 'saving'}
                className={`w-full py-3 rounded-lg font-bold flex items-center justify-center transition-colors ${
                    status === 'success' ? 'bg-green-600 text-white' : 
                    status === 'error' ? 'bg-red-600 text-white' :
                    'bg-indigo-600 hover:bg-indigo-700 text-white'
                }`}
            >
                {status === 'saving' ? 'Đang kiểm tra...' : status === 'success' ? 'Đã lưu thành công!' : status === 'error' ? 'Thử lại' : 'Lưu & Kích Hoạt'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
