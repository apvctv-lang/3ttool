import React, { useState } from 'react';
import { X, Check, Image as ImageIcon, MessageSquare, Sparkles } from 'lucide-react';
import { ProductAnalysis, RopeType, ROPE_OPTIONS } from '../types';

interface DesignAnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  analysis: ProductAnalysis;
  extractedElements: string[] | null;
  onGenerate: (selectedComponents: string[], userNotes: string, ropeType: RopeType) => void;
}

export const DesignAnalysisModal: React.FC<DesignAnalysisModalProps> = ({
  isOpen,
  onClose,
  analysis,
  extractedElements,
  onGenerate
}) => {
  // State for form inputs
  const [selectedComponents, setSelectedComponents] = useState<string[]>(
    analysis.detectedComponents || []
  );
  const [userNotes, setUserNotes] = useState('');
  const [selectedRope, setSelectedRope] = useState<RopeType>(RopeType.NONE);

  if (!isOpen) return null;

  const toggleComponent = (component: string) => {
    if (selectedComponents.includes(component)) {
      setSelectedComponents(selectedComponents.filter(c => c !== component));
    } else {
      setSelectedComponents([...selectedComponents, component]);
    }
  };

  const handleConfirm = () => {
    onGenerate(selectedComponents, userNotes, selectedRope);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity" onClick={onClose} />
      
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative transform overflow-hidden rounded-2xl bg-slate-900 shadow-2xl transition-all w-full max-w-5xl border border-slate-800">
          
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4 bg-slate-900">
            <h3 className="text-xl font-bold text-slate-200 flex items-center">
              <Sparkles className="w-5 h-5 mr-2 text-indigo-500" />
              Customize Design Generation
            </h3>
            <button onClick={onClose} className="text-slate-500 hover:text-white p-1 rounded-full hover:bg-slate-800">
              <X size={24} />
            </button>
          </div>

          <div className="px-6 py-6 space-y-8">
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              
              {/* Left Column: Detected Frames & Components */}
              <div className="space-y-6">
                
                 {/* Separated Elements Frames */}
                <div>
                  <label className="block text-sm font-bold text-slate-300 mb-3 uppercase tracking-wide">
                    Detected Elements (Character, Pattern, Text)
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    {extractedElements && extractedElements.length > 0 ? (
                      extractedElements.slice(0, 3).map((img, idx) => (
                        <div key={idx} className="aspect-square bg-[linear-gradient(45deg,#1e293b_25%,transparent_25%,transparent_75%,#1e293b_75%,#1e293b),linear-gradient(45deg,#1e293b_25%,transparent_25%,transparent_75%,#1e293b_75%,#1e293b)] bg-[length:20px_20px] bg-[position:0_0,10px_10px] bg-slate-950 border border-slate-700 rounded-xl overflow-hidden relative group">
                          <img src={img} alt={`Extracted ${idx}`} className="w-full h-full object-contain p-2" />
                          <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] p-1 text-center backdrop-blur-sm truncate border-t border-white/10">
                            {idx === 0 ? 'Character' : idx === 1 ? 'Pattern/Decor' : 'Text/Logo'}
                          </div>
                        </div>
                      ))
                    ) : (
                      Array(3).fill(0).map((_, i) => (
                        <div key={i} className="aspect-square bg-slate-800 rounded-xl flex flex-col items-center justify-center text-slate-600 border border-dashed border-slate-700">
                          <ImageIcon size={20} className="mb-2" />
                          <span className="text-[10px] uppercase">Frame {i+1}</span>
                        </div>
                      ))
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-2">These elements have been identified. Select what to keep below.</p>
                </div>

                {/* Components Selection List */}
                <div>
                  <label className="block text-sm font-bold text-slate-300 mb-3 uppercase tracking-wide">
                    Select Options to Keep
                  </label>
                  <div className="bg-slate-950/50 rounded-xl p-4 border border-slate-800 max-h-48 overflow-y-auto">
                    <div className="space-y-2">
                      {analysis.detectedComponents && analysis.detectedComponents.length > 0 ? (
                        analysis.detectedComponents.map((comp, idx) => (
                          <label key={idx} className="flex items-center p-2 hover:bg-slate-800 rounded-lg cursor-pointer transition-colors group">
                            <div className={`w-5 h-5 rounded border flex items-center justify-center mr-3 transition-colors ${selectedComponents.includes(comp) ? 'bg-indigo-600 border-indigo-600' : 'border-slate-600 bg-slate-800'}`}>
                              {selectedComponents.includes(comp) && <Check size={12} className="text-white" />}
                            </div>
                            <input 
                              type="checkbox" 
                              checked={selectedComponents.includes(comp)} 
                              onChange={() => toggleComponent(comp)}
                              className="hidden" 
                            />
                            <span className={`text-sm ${selectedComponents.includes(comp) ? 'text-slate-200 font-medium' : 'text-slate-500'}`}>{comp}</span>
                          </label>
                        ))
                      ) : (
                        <p className="text-sm text-slate-500 italic">No specific components detected.</p>
                      )}
                    </div>
                  </div>
                </div>

              </div>

              {/* Right Column: Rope & Notes */}
              <div className="space-y-6">

                {/* Rope Selection */}
                <div>
                  <label className="block text-sm font-bold text-slate-300 mb-3 uppercase tracking-wide">
                    Select Hanging Rope
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {ROPE_OPTIONS.map((rope) => (
                      <button
                        key={rope.id}
                        onClick={() => setSelectedRope(rope.id)}
                        className={`flex items-center p-3 rounded-lg border transition-all ${
                          selectedRope === rope.id 
                            ? 'border-indigo-500 bg-indigo-900/30 ring-1 ring-indigo-500' 
                            : 'border-slate-700 hover:border-indigo-500/50 bg-slate-800'
                        }`}
                      >
                        <div 
                          className="w-8 h-8 rounded-full border border-slate-600 flex-shrink-0 mr-3 shadow-sm"
                          style={{ background: rope.color }}
                        />
                        <span className={`text-xs font-medium text-left ${selectedRope === rope.id ? 'text-indigo-300' : 'text-slate-400'}`}>
                          {rope.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
                
                {/* User Notes */}
                <div>
                  <label className="block text-sm font-bold text-slate-300 mb-3 uppercase tracking-wide flex justify-between">
                    Customize / Change Request
                    <span className="text-xs text-slate-500 font-normal normal-case">If you don't like options above, describe here</span>
                  </label>
                  <div className="relative">
                    <textarea
                      value={userNotes}
                      onChange={(e) => setUserNotes(e.target.value)}
                      placeholder="E.g., Change the character to a snowman, change quantity to 3, make the background red..."
                      className="w-full min-h-[140px] p-4 bg-slate-950 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-slate-200 text-sm resize-none placeholder:text-slate-600"
                    />
                    <MessageSquare className="absolute top-4 right-4 text-slate-500 w-4 h-4" />
                  </div>
                </div>

              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="border-t border-slate-800 px-6 py-4 bg-slate-900 flex justify-between items-center">
             <span className="text-xs text-slate-500">Generated images will be downloadable at 2500x2500 pixels.</span>
             <div className="flex space-x-3">
                <button 
                  onClick={onClose}
                  className="px-5 py-2.5 rounded-xl text-slate-400 font-medium hover:bg-slate-800 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleConfirm}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold shadow-lg shadow-indigo-500/20 hover:scale-[1.02] transition-all flex items-center"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generate 6 Options
                </button>
             </div>
          </div>

        </div>
      </div>
    </div>
  );
};