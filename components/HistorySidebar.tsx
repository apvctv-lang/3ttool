import React from 'react';
import { X, Clock, Trash2, ChevronRight, Image as ImageIcon, Loader2 } from 'lucide-react';
import { HistoryItem, DesignMode } from '../types';

interface HistorySidebarProps {
  isOpen: boolean;
  onClose: () => void;
  history: HistoryItem[];
  onSelect: (item: HistoryItem) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
  isLoading?: boolean;
}

export const HistorySidebar: React.FC<HistorySidebarProps> = ({
  isOpen,
  onClose,
  history,
  onSelect,
  onDelete,
  isLoading
}) => {
  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity animate-fade-in"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div className={`fixed inset-y-0 right-0 w-full sm:w-96 bg-slate-900 shadow-2xl z-50 transform transition-transform duration-300 ease-in-out border-l border-slate-800 ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="h-full flex flex-col">
          <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-900">
            <h2 className="text-lg font-bold text-slate-200 flex items-center">
              <Clock className="w-5 h-5 mr-2 text-indigo-500" />
              Design Cloud History
            </h2>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-white"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-slate-700">
            {isLoading ? (
               <div className="text-center py-20 text-slate-500">
                 <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin text-indigo-500" />
                 <p className="text-sm font-medium">Synchronizing designs from cloud...</p>
               </div>
            ) : history.length === 0 ? (
              <div className="text-center py-10 text-slate-600">
                <Clock className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p>No history yet.</p>
                <p className="text-xs mt-1">Cloud designs will appear here.</p>
              </div>
            ) : (
              history.map((item) => (
                <div 
                  key={item.id}
                  onClick={() => onSelect(item)}
                  className="group relative bg-slate-900 border border-slate-800 rounded-xl overflow-hidden hover:shadow-md hover:border-indigo-500/50 transition-all cursor-pointer flex flex-col"
                >
                  <div className="h-32 bg-slate-800 relative overflow-hidden">
                    {item.processedImage || item.originalImage ? (
                      <img 
                        src={item.processedImage || item.originalImage} 
                        alt="Thumbnail" 
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-600">
                        <ImageIcon size={24} />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
                      <span className="text-white text-xs font-medium flex items-center">
                        Open Project <ChevronRight size={12} className="ml-1" />
                      </span>
                    </div>
                  </div>
                  
                  <div className="p-3">
                    <div className="flex flex-wrap gap-2 mb-2">
                      <span className="text-xs font-semibold text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full truncate max-w-[140px] border border-slate-700" title={item.productType}>
                        {item.productType}
                      </span>
                      <span className="text-[10px] font-bold text-slate-500 bg-slate-950 px-2 py-0.5 rounded-full border border-slate-800">
                         By {item.username || 'Unknown'}
                      </span>
                    </div>
                    
                    <div className="flex justify-end mt-2">
                      <button 
                        onClick={(e) => onDelete(item.id, e)}
                        className="text-slate-500 hover:text-red-400 transition-colors p-1"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="text-xs text-slate-500 mt-1 pt-2 border-t border-slate-800 flex items-center justify-between">
                      <span>{new Date(item.timestamp).toLocaleDateString()}</span>
                      <span>{new Date(item.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
};