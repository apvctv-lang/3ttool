
import React from 'react';
import { Download, Wand2, Loader2, CheckCircle2, Sparkles, Image as ImageIcon, Settings2, ZoomIn, Shirt, Scissors } from 'lucide-react';
import { ProductAnalysis, ProcessStage, AppTab } from '../types';

interface ResultsPanelProps {
  originalImage: string;
  processedImage: string | null;
  analysis: ProductAnalysis | null;
  generatedRedesigns: string[] | null;
  stage: ProcessStage;
  activeTab: AppTab;
  onImageClick?: (index: number) => void;
}

export const ResultsPanel: React.FC<ResultsPanelProps> = ({
  originalImage,
  processedImage,
  analysis,
  generatedRedesigns,
  stage,
  activeTab,
  onImageClick
}) => {

  /**
   * NÂNG CẤP TẢI ẢNH 2500PX HQ - CHỐNG NHÒE TUYỆT ĐỐI
   */
  const downloadImageAs2500px = (e: React.MouseEvent, dataUrl: string, filename: string, removeWhite: boolean = false) => {
    e.stopPropagation(); 
    
    const img = new Image();
    img.crossOrigin = "anonymous"; 
    img.src = dataUrl;
    
    img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 2500;
        canvas.height = 2500;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;

        // Cấu hình vẽ siêu sắc nét với chất lượng cao nhất
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.clearRect(0, 0, 2500, 2500); 

        // Tính toán tỷ lệ vẽ để không bị nhòe và căn giữa
        const scale = Math.min(2500 / img.width, 2500 / img.height);
        const nw = img.width * scale;
        const nh = img.height * scale;
        const nx = (2500 - nw) / 2;
        const ny = (2500 - nh) / 2;

        ctx.drawImage(img, nx, ny, nw, nh);

        if (removeWhite) {
            const imageData = ctx.getImageData(0, 0, 2500, 2500);
            const data = imageData.data;
            
            // Magic Alpha HQ
            for (let i = 0; i < data.length; i += 4) {
                const r = data[i], g = data[i+1], b = data[i+2];
                const br = (r + g + b) / 3;
                if (br > 230 && Math.abs(r-g) < 10 && Math.abs(g-b) < 10) {
                    data[i+3] = 0; 
                }
            }
            
            ctx.putImageData(imageData, 0, 0);
        }
        
        const link = document.createElement('a');
        link.href = canvas.toDataURL('image/png', 1.0); 
        link.download = filename.replace(/\.(jpg|jpeg)$/i, '.png'); 
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };
  };

  const isLoading = stage !== ProcessStage.COMPLETE && stage !== ProcessStage.IDLE && stage !== ProcessStage.REVIEW;

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className={`grid ${activeTab === AppTab.TSHIRT ? 'grid-cols-1' : 'grid-cols-2'} gap-4`}>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-slate-400 text-sm uppercase tracking-wider">Original</h3>
              </div>
              <div className="relative aspect-square bg-slate-800 rounded-xl overflow-hidden border border-slate-700">
                <img src={originalImage} alt="Original" className="w-full h-full object-contain" />
              </div>
            </div>

            {activeTab !== AppTab.TSHIRT && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-indigo-400 text-sm uppercase tracking-wider flex items-center">
                    {stage === ProcessStage.CLEANING && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                    Cleaned (No Rope)
                  </h3>
                  {processedImage && (
                    <div className="flex space-x-1">
                        <button
                            onClick={(e) => downloadImageAs2500px(e, processedImage, 'cleaned-product-transparent.png', true)}
                            className="p-1.5 bg-indigo-900/30 text-indigo-300 hover:bg-indigo-900/50 hover:text-white rounded-md transition-colors border border-indigo-500/30 flex items-center space-x-1"
                        >
                            <Download size={14} />
                            <span className="text-[10px] font-bold">2500px HQ</span>
                        </button>
                    </div>
                  )}
                </div>
                <div className="relative aspect-square bg-[linear-gradient(45deg,#1e293b_25%,transparent_25%,transparent_75%,#1e293b_75%,#1e293b),linear-gradient(45deg,#1e293b_25%,transparent_25%,transparent_75%,#1e293b_75%,#1e293b)] bg-[length:20px_20px] bg-[position:0_0,10px_10px] bg-slate-900 rounded-xl overflow-hidden border border-slate-700 shadow-sm group">
                  {processedImage ? (
                    <img src={processedImage} alt="Processed" className="w-full h-full object-contain p-4" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 p-4 text-center">
                      {stage === ProcessStage.CLEANING ? (
                        <>
                          <Loader2 className="w-8 h-8 animate-spin mb-2 text-indigo-500" />
                          <span className="text-xs">Processing High Resolution...</span>
                        </>
                      ) : (
                        <span className="text-xs">Waiting for processing...</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="bg-slate-900 rounded-xl p-4 border border-slate-800 shadow-sm">
            <div className="space-y-4">
              <div className={`flex items-center ${stage !== ProcessStage.UPLOADING ? 'text-green-400' : 'text-slate-500'}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center border-2 mr-3 ${stage === ProcessStage.CLEANING ? 'border-indigo-500 text-indigo-500' : (stage !== ProcessStage.UPLOADING ? 'border-green-500 bg-green-500/10' : 'border-slate-700')}`}>
                  {stage !== ProcessStage.UPLOADING && stage !== ProcessStage.CLEANING ? <CheckCircle2 size={14} /> : '1'}
                </div>
                <span className="text-sm font-medium">Clean & Analyze HQ</span>
              </div>
              
              <div className={`flex items-center ${[ProcessStage.REVIEW, ProcessStage.GENERATING, ProcessStage.COMPLETE].includes(stage) ? 'text-green-400' : 'text-slate-500'}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center border-2 mr-3 ${stage === ProcessStage.ANALYZING ? 'border-indigo-500 text-indigo-500' : ([ProcessStage.REVIEW, ProcessStage.GENERATING, ProcessStage.COMPLETE].includes(stage) ? 'border-green-500 bg-green-500/10' : 'border-slate-700')}`}>
                  {[ProcessStage.REVIEW, ProcessStage.GENERATING, ProcessStage.COMPLETE].includes(stage) ? <CheckCircle2 size={14} /> : '2'}
                </div>
                <span className="text-sm font-medium">Extract Elements</span>
              </div>

               <div className={`flex items-center ${[ProcessStage.GENERATING, ProcessStage.COMPLETE].includes(stage) ? 'text-green-400' : 'text-slate-500'}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center border-2 mr-3 ${stage === ProcessStage.REVIEW ? 'border-amber-500 text-amber-500' : ([ProcessStage.GENERATING, ProcessStage.COMPLETE].includes(stage) ? 'border-green-500 bg-green-500/10' : 'border-slate-700')}`}>
                  {[ProcessStage.GENERATING, ProcessStage.COMPLETE].includes(stage) ? <CheckCircle2 size={14} /> : (stage === ProcessStage.REVIEW ? <Settings2 size={14} /> : '3')}
                </div>
                <span className="text-sm font-medium">Configuration</span>
              </div>

              <div className={`flex items-center ${stage === ProcessStage.COMPLETE ? 'text-green-400' : 'text-slate-500'}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center border-2 mr-3 ${stage === ProcessStage.GENERATING ? 'border-indigo-500 text-indigo-500' : (stage === ProcessStage.COMPLETE ? 'border-green-500 bg-green-500/10' : 'border-slate-700')}`}>
                  {stage === ProcessStage.COMPLETE ? <CheckCircle2 size={14} /> : '4'}
                </div>
                <span className="text-sm font-medium">Generate Designs</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col h-full">
          <div className="bg-slate-900 rounded-xl border border-slate-800 shadow-lg flex-grow overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-800 bg-slate-800/50 flex justify-between items-center">
              <h3 className="font-semibold text-slate-200 flex items-center">
                <Wand2 className="w-4 h-4 mr-2 text-purple-400" />
                AI Analysis & Strategy
              </h3>
            </div>
            
            <div className="p-6 overflow-y-auto flex-grow space-y-6 max-h-[500px] scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
              {!analysis && isLoading ? (
                <div className="space-y-4 animate-pulse">
                  <div className="h-4 bg-slate-800 rounded w-3/4"></div>
                  <div className="h-4 bg-slate-800 rounded w-1/2"></div>
                  <div className="h-24 bg-slate-800 rounded w-full"></div>
                </div>
              ) : analysis ? (
                <>
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Product Description</h4>
                    <p className="text-sm text-slate-300 leading-relaxed">{analysis.description}</p>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Design Critique</h4>
                    <div className="p-3 bg-amber-950/30 border border-amber-900/50 rounded-lg text-sm text-amber-200 leading-relaxed whitespace-pre-wrap">
                      {typeof analysis.designCritique === 'string' ? analysis.designCritique : JSON.stringify(analysis.designCritique)}
                    </div>
                  </div>
                </>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-600 text-sm">
                  Analysis will appear here...
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {(generatedRedesigns || stage === ProcessStage.GENERATING) && (
         <div className="space-y-4 border-t border-slate-800 pt-8">
            <h3 className="text-xl font-bold text-slate-200 flex items-center">
              {activeTab === AppTab.TSHIRT ? <Shirt className="w-5 h-5 mr-2 text-indigo-500" /> : <Sparkles className="w-5 h-5 mr-2 text-amber-500" />}
              {activeTab === AppTab.TSHIRT ? 'T-Shirt Graphics (High Quality)' : 'AI Generated Redesigns'}
            </h3>
            
            <div className={`grid grid-cols-1 md:grid-cols-3 gap-6`}>
              {stage === ProcessStage.GENERATING ? (
                 Array(activeTab === AppTab.TSHIRT ? 3 : 6).fill(0).map((_, i) => (
                    <div key={i} className="aspect-square bg-slate-900 rounded-xl animate-pulse flex items-center justify-center border border-slate-800">
                        <ImageIcon className="text-slate-700 w-8 h-8" />
                    </div>
                 ))
              ) : (
                 generatedRedesigns?.map((img, index) => {
                    return (
                        <div 
                        key={index} 
                        onClick={() => onImageClick && onImageClick(index)}
                        className="group relative aspect-square bg-slate-800 rounded-xl overflow-hidden border border-slate-700 shadow-sm hover:shadow-xl hover:border-indigo-500 transition-all cursor-pointer"
                        >
                            <img src={img} alt={`Redesign ${index + 1}`} className="w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-500" />

                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/60 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                                <div className="flex flex-col items-center space-y-3 transform translate-y-2 group-hover:translate-y-0 transition-all">
                                    <span className="bg-slate-900/90 backdrop-blur text-white px-4 py-2 rounded-full font-bold text-sm flex items-center shadow-lg border border-slate-700">
                                    <ZoomIn className="w-4 h-4 mr-2 text-indigo-400" />
                                    {activeTab === AppTab.TSHIRT ? 'Create Mockup' : 'View & Remix'}
                                    </span>
                                    <button 
                                    onClick={(e) => downloadImageAs2500px(e, img, `design-option-2500px-${index + 1}.png`, true)}
                                    className="bg-indigo-600 backdrop-blur text-white px-4 py-2 rounded-full font-medium text-xs flex items-center hover:bg-indigo-700 transition-colors border border-indigo-500 shadow-lg"
                                    >
                                    <Scissors className="w-3 h-3 mr-2" />
                                    Tải Thiết Kế (2500px HQ)
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                 })
              )}
            </div>
         </div>
      )}
    </div>
  );
};
