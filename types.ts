
export interface ProductAnalysis {
  description: string;
  designCritique: string;
  redesignPrompt: string;
  detectedComponents: string[];
}

export enum DesignMode {
  NEW_CONCEPT = 'NEW_CONCEPT',
  ENHANCE_EXISTING = 'ENHANCE_EXISTING',
  CLEAN_ONLY = 'CLEAN_ONLY'
}

export enum AppTab {
  POD = 'POD',
  TSHIRT = 'TSHIRT',
  TOOLS = 'TOOLS'
}

export enum RopeType {
  NONE = 'None',
  JUTE = 'Dây gai (Jute)',
  RED_RIBBON = 'Dây ribbon đỏ',
  RED_WHITE_TWINE = 'Dây dù trắng đỏ',
  GOLD_METALLIC = 'Dây kim tuyến vàng'
}

// Added ROPE_OPTIONS to resolve import error in DesignAnalysisModal.tsx
export const ROPE_OPTIONS = [
  { id: RopeType.NONE, name: 'None', color: 'transparent' },
  { id: RopeType.JUTE, name: 'Dây gai (Jute)', color: '#a89078' },
  { id: RopeType.RED_RIBBON, name: 'Dây ribbon đỏ', color: '#dc2626' },
  { id: RopeType.RED_WHITE_TWINE, name: 'Dây dù trắng đỏ', color: 'repeating-linear-gradient(45deg, #fff, #fff 5px, #dc2626 5px, #dc2626 10px)' },
  { id: RopeType.GOLD_METALLIC, name: 'Dây kim tuyến vàng', color: 'linear-gradient(45deg, #f59e0b, #fef3c7, #f59e0b)' },
];

export type RetentionLevel = '20%' | '40%' | '60%' | '80%';

export interface AppState {
  originalImage: string | null;
  processedImage: string | null;
  extractedElements: string[] | null;
  analysis: ProductAnalysis | null;
  generatedRedesigns: string[] | null;
  isProcessing: boolean;
  isAnalyzing: boolean;
  error: string | null;
  productType: string;
  designMode: DesignMode;
  ropeType: RopeType;
  userNotes: string;
  selectedComponents: string[];
  isReviewModalOpen: boolean;
}

export interface HistoryItem {
  id: string;
  timestamp: number;
  originalImage: string;
  processedImage: string | null;
  analysis: ProductAnalysis | null;
  generatedRedesigns: string[] | null;
  productType: string;
  designMode: DesignMode;
  ropeType?: RopeType;
  tab?: AppTab;
  username?: string;
  retention?: string;
}

export enum ProcessStage {
  IDLE = 'IDLE',
  UPLOADING = 'UPLOADING',
  CLEANING = 'CLEANING',
  ANALYZING = 'ANALYZING',
  REVIEW = 'REVIEW',
  GENERATING = 'GENERATING',
  COMPLETE = 'COMPLETE'
}

export const PRODUCT_TYPES = [
  "Auto-Detect / Random",
  "1 Layer Suncatcher Ornament",
  "Stained Glass Suncatcher",
  "Glass Ornament",
  "Ceramic Ornament",
  "Transparent Acrylic Ornament",
  "Custom Shape Wooden Ornament",
  "2 Layered Piece Wooden Ornament",
  "Suncatcher Ornament"
];
