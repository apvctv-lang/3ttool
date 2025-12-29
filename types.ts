
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

export interface AppState {
  originalImage: string | null; // Base64
  processedImage: string | null; // Base64
  extractedElements: string[] | null; // [Character, Pattern] Base64
  analysis: ProductAnalysis | null;
  generatedRedesigns: string[] | null; // Array of Base64 images
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

// Fix: Added missing username property to HistoryItem interface to satisfy HistorySidebar component requirements
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
  tab?: AppTab; // New field
  username?: string;
}

export enum ProcessStage {
  IDLE = 'IDLE',
  UPLOADING = 'UPLOADING',
  CLEANING = 'CLEANING', // Removing bg and wires
  ANALYZING = 'ANALYZING', // Generating prompts & extracting elements
  REVIEW = 'REVIEW', // User reviewing analysis & selecting options
  GENERATING = 'GENERATING', // Generating new design concepts
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

export const PRODUCT_MATERIALS: Record<string, string> = {
  "1 Layer Suncatcher Ornament": "Material: Ultra-thin 3mm Acrylic Plexiglass. Laser cut very tight to the design edge (Kiss-cut). Crystal clear transparency where not printed.",
  "Stained Glass Suncatcher": "Material: Flexible glass with one side printed. Front is smooth surface, back is rough surface. Translucent properties with light passing through colored areas.",
  "Glass Ornament": "Material: Real Glass, thickness 4mm. Printed on ONE SIDE. Very clear, sharp edges. High gloss reflection.",
  "Ceramic Ornament": "Material: Ceramic. Printed in one side or two sides. Opaque, glossy or matte ceramic texture. Solid white edge.",
  "Transparent Acrylic Ornament": "Material: Ultra-thin 3mm Crystal Clear Acrylic. The cutline follows the design contour exactly (tight border/kiss-cut). Optically clear background (glass-like transparency). NOT thick.",
  "Custom Shape Wooden Ornament": "Material: Environmental-friendly fiber wood (MDF), 3mm thick. Laser cut with dark burnt edges. Wood texture visible on unprinted areas.",
  "2 Layered Piece Wooden Ornament": "Material: 2 layered wooden ornament made of fiber wood. Total thickness 6mm (3mm per layer). 3D depth effect between layers.",
  "Suncatcher Ornament": "Material: Mixed Media. Thin wood frame (3mm) holding a thin Acrylic center (3mm). The acrylic part is crystal clear."
};

export const ROPE_OPTIONS = [
  { id: RopeType.JUTE, name: 'Dây gai', color: '#d4c4a8', texture: 'dashed' },
  { id: RopeType.RED_RIBBON, name: 'Dây ribbon đỏ', color: '#ef4444', texture: 'solid' },
  { id: RopeType.RED_WHITE_TWINE, name: 'Dây dù trắng đỏ', color: 'repeating-linear-gradient(45deg, #fff, #fff 4px, #ef4444 4px, #ef4444 8px)', texture: 'striped' },
  { id: RopeType.GOLD_METALLIC, name: 'Dây kim tuyến vàng', color: '#fbbf24', texture: 'solid' }
];
