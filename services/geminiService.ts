
// @google/genai SDK implementation for product analysis and image generation.
import { GoogleGenAI, Type } from "@google/genai";
import { ProductAnalysis, DesignMode, RopeType, AppTab } from "../types";

const getCleanKey = (input: string | null | undefined): string => {
  if (!input) return "";
  const keys = input.split(/[\n\r,;]+/).map(k => k.trim()).filter(k => k.length > 20);
  if (keys.length === 0) return "";
  return keys[Math.floor(Math.random() * keys.length)];
};

const getClient = () => {
  const systemKey = localStorage.getItem('app_system_key');
  const envKey = process.env.API_KEY;
  const finalKey = getCleanKey(systemKey || envKey);
  return new GoogleGenAI({ apiKey: finalKey });
};

const stripBase64Prefix = (base64: string) => {
  return base64.replace(/^data:image\/[a-z]+;base64,/, "");
};

export const validateToken = async (tokenInput?: string): Promise<boolean> => {
  try {
    const keyToValidate = tokenInput ? getCleanKey(tokenInput) : "";
    const ai = keyToValidate ? new GoogleGenAI({ apiKey: keyToValidate }) : getClient();
    await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: "Connectivity test.",
    });
    return true;
  } catch (err: any) {
    throw err;
  }
};

/**
 * Xử lý tách nền trắng và xóa dây treo theo yêu cầu
 */
export const cleanupProductImage = async (imageBase64: string): Promise<string> => {
  const ai = getClient();
  const prompt = `HÃY THỰC HIỆN CÁC BƯỚC SAU VỚI ĐỘ CHÍNH XÁC TỐI ĐA:
  1. Nhận diện sản phẩm chính trong ảnh.
  2. XÓA BỎ HOÀN TOÀN nền và tất cả bối cảnh xung quanh.
  3. QUAN TRỌNG: XÓA BỎ TOÀN BỘ dây treo, móc treo, hoặc giá đỡ có trong ảnh.
  4. LƯU Ý CỰC KỲ QUAN TRỌNG: KHÔNG ĐƯỢC XÓA các chi tiết màu trắng (ngôi sao, tuyết, chữ trắng...) nằm BÊN TRONG ranh giới thiết kế. Hãy giữ nguyên chúng. Chỉ xóa vùng nền phía ngoài ranh giới sản phẩm.
  5. Chuyển nền ngoài sang TRẮNG TUYỆT ĐỐI (#FFFFFF).
  6. Tuyệt đối không để lại khung vuông hay họa tiết ô vuông (checkerboard) của AI.
  7. Trả về duy nhất 1 ảnh PNG chất lượng cao.`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [
        { inlineData: { mimeType: "image/png", data: stripBase64Prefix(imageBase64) } },
        { text: prompt }
      ]
    }
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData && part.inlineData.data) {
          return `data:image/png;base64,${part.inlineData.data}`;
      }
  }
  return imageBase64;
};

export const analyzeProductDesign = async (
    imageBase64: string, 
    productType: string,
    designMode: DesignMode,
    activeTab: AppTab = AppTab.POD
  ): Promise<ProductAnalysis> => {
    
    const ai = getClient();
    let systemInstruction = "";
    
    if (activeTab === AppTab.TSHIRT) {
        systemInstruction = `You are a world-class senior fashion designer and creative director for high-end streetwear and premium apparel brands.
Your mission: Redesign the input T-Shirt into a significantly MORE BEAUTIFUL, superior, and aesthetically perfect masterpiece.

CORE TASK:
1. Extract the "Design DNA" (the soul, emotion, and aesthetic core) of the original shirt.
2. Elevate this DNA into a high-fashion principle system.
3. Propose a NEW design that is visually stunning, balanced, and premium.

AESTHETIC GUIDELINES:
- Focus on masterpiece-level composition and visual harmony.
- Use advanced typography and sophisticated graphic placements.
- Ensure the result feels "Expensive", "Trendy", and "Iconic".
- Preserve the brand essence but discard any amateur or cluttered elements from the original.

MANDATORY PROCESS:
1. DESIGN DNA EXTRACTION: Analyze emotional tone, attitude, and brand energy.
2. MASTERPIECE PRINCIPLES: Define 5-7 abstract rules for visual excellence based on the DNA.
3. THE REDESIGN: Conceptualize a superior garment that outshines the original in beauty and market appeal.

OUTPUT REQUIREMENTS:
You MUST return a JSON object with the exact keys: description, designCritique, detectedComponents, and redesignPrompt.
In 'designCritique', provide a clear, non-JSON string description of the aesthetic evolution.`;
    }

    const promptText = activeTab === AppTab.TSHIRT 
        ? "Analyze the T-Shirt's core soul and redesign it into a beautiful high-fashion masterpiece. Provide the full redesign concept and prompt."
        : `Analyze this design for conceptual enhancement. Provide detected components and a redesign prompt.`;
    
    const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: {
          parts: [
              { inlineData: { mimeType: "image/png", data: stripBase64Prefix(imageBase64) } },
              { text: promptText }
          ]
        },
        config: { 
            systemInstruction: activeTab === AppTab.TSHIRT ? systemInstruction : undefined,
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    description: { type: Type.STRING, description: "Short title for the new concept" },
                    designCritique: { type: Type.STRING, description: "A detailed paragraph explaining the design DNA and aesthetic strategy" },
                    detectedComponents: { 
                        type: Type.ARRAY, 
                        items: { type: Type.STRING },
                        description: "List of key design principles extracted"
                    },
                    redesignPrompt: { type: Type.STRING, description: "Detailed prompt for generating the new masterpiece design" }
                },
                required: ["description", "designCritique", "detectedComponents", "redesignPrompt"]
            }
        }
    });

    const text = response.text || "{}";
    const rawResult = JSON.parse(text.replace(/```json\s*|\s*```/g, "").trim());

    return { 
        description: rawResult.description || "Masterpiece Redesign", 
        designCritique: typeof rawResult.designCritique === 'string' ? rawResult.designCritique : JSON.stringify(rawResult.designCritique), 
        detectedComponents: Array.isArray(rawResult.detectedComponents) ? rawResult.detectedComponents : [],
        redesignPrompt: rawResult.redesignPrompt || ""
    };
};

export const generateProductRedesigns = async (
    basePrompt: string,
    ropeType: RopeType,
    selectedComponents: string[],
    userNotes: string,
    productType: string,
    useUltraFlag: boolean,
    activeTab: AppTab = AppTab.POD,
    originalImage?: string 
  ): Promise<string[]> => {
    
    const ai = getClient();
    let targetModel = 'gemini-3-pro-image-preview';
    let targetConfig: any = { imageConfig: { imageSize: '2K', aspectRatio: '1:1' } };
    let finalPrompt = "";

    if (activeTab === AppTab.TSHIRT) {
        targetModel = 'gemini-2.5-flash-image';
        targetConfig = { imageConfig: { aspectRatio: '1:1' } };
        finalPrompt = `ACT AS A WORLD-CLASS FASHION DESIGNER. CREATE A SUPREMELY BEAUTIFUL, HIGH-END T-SHIRT GRAPHIC BASED ON THIS MASTERPIECE PROMPT: ${basePrompt}. 
        STRICT RULES: 
        1. THE RESULT MUST BE STUNNINGLY BEAUTIFUL AND AESTHETICALLY SUPERIOR.
        2. Isolated design on PURE WHITE BACKGROUND (#FFFFFF). 
        3. Professional composition, balanced hierarchy, and sharp details.
        4. Strategy: ${userNotes}. 
        5. MUST feel like an elite version of the same brand system.
        6. NO HANGERS, NO WIRES, NO MOCKUP ELEMENTS. JUST THE ARTWORK.`;
    } else {
        finalPrompt = `Isolated design graphic on PURE WHITE background. Subject: ${basePrompt}. ${userNotes}`;
    }
    
    const count = activeTab === AppTab.TSHIRT ? 3 : 6;
    const results: string[] = [];

    for(let i=0; i<count; i++) {
        await new Promise(resolve => setTimeout(resolve, 400));
        try {
            const response = await ai.models.generateContent({
                model: targetModel,
                contents: { 
                    parts: [
                        ...(originalImage && activeTab !== AppTab.TSHIRT ? [{ inlineData: { mimeType: "image/png", data: stripBase64Prefix(originalImage) } }] : []),
                        { text: finalPrompt }
                    ]
                },
                config: targetConfig
            });
            for (const part of response.candidates?.[0]?.content?.parts || []) {
                if (part.inlineData && part.inlineData.data) {
                    results.push(`data:image/png;base64,${part.inlineData.data}`);
                    break;
                }
            }
        } catch (err: any) {
             if (targetModel === 'gemini-3-pro-image-preview') throw err;
        }
    }
    return results;
};

export const remixProductImage = async (imageBase64: string, instruction: string): Promise<string> => {
    const ai = getClient();
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
            parts: [
                { inlineData: { mimeType: "image/png", data: stripBase64Prefix(imageBase64) } },
                { text: `Remix design: ${instruction}. Output isolated PNG on PURE WHITE BACKGROUND. Ensure high aesthetic beauty.` }
            ]
        }
    });
    for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData && part.inlineData.data) return `data:image/png;base64,${part.inlineData.data}`;
    }
    throw new Error("Remix failed.");
};

export const detectAndSplitCharacters = async (imageBase64: string): Promise<string[]> => [];
export const generateRandomMockup = async (imageBase64: string): Promise<string> => imageBase64;
