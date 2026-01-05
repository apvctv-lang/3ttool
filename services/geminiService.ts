
import { GoogleGenAI, Type } from "@google/genai";
import { ProductAnalysis, DesignMode, RopeType, AppTab, RetentionLevel } from "../types";

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
    activeTab: AppTab = AppTab.POD,
    retention: RetentionLevel = '40%'
  ): Promise<ProductAnalysis> => {
    
    const ai = getClient();
    let systemInstruction = "";
    
    if (activeTab === AppTab.TSHIRT) {
        systemInstruction = `You are a world-class senior fashion designer.
MISSION: Redesign the input into a FLAT GRAPHIC MASTERPIECE.
RETENTION STRATEGY: You must keep exactly ${retention} of the original aesthetic/layout vibe.

- If 20%: Be revolutionary. Change 80% of the composition. Only keep the soul.
- If 40%: Creative remix. Keep main structure but reinvent motifs.
- If 60%+: Evolutionary polish. Keep layout identical, upgrade quality/details only.

CORE TASK:
1. Extract Design DNA.
2. Define Masterpiece Principles.
3. Propose NEW FLAT GRAPHIC ARTWORK.

RULES:
- NO mockups, NO t-shirts, NO bodies. ONLY 2D Artwork.
- Outcome must be "Expensive", "Iconic", and "Aesthetically Perfect".`;
    }

    const promptText = activeTab === AppTab.TSHIRT 
        ? `Analyze the design's soul and redesign it into a beautiful flat graphic artwork with ${retention} similarity to the original structure.`
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
    originalImage?: string,
    retention: RetentionLevel = '40%'
  ): Promise<string[]> => {
    
    const ai = getClient();
    let targetModel = 'gemini-3-pro-image-preview';
    let targetConfig: any = { imageConfig: { imageSize: '2K', aspectRatio: '1:1' } };
    let finalPrompt = "";

    if (activeTab === AppTab.TSHIRT) {
        targetModel = 'gemini-2.5-flash-image';
        targetConfig = { imageConfig: { aspectRatio: '1:1' } };
        finalPrompt = `CREATE A FLAT 2D GRAPHIC ARTWORK. PROMPT: ${basePrompt}. 
        STRICT RULES: 
        1. RETENTION LEVEL: ${retention}. Adhere strictly to this similarity level to original image.
        2. FLAT ARTWORK ONLY. No t-shirts, no mockups.
        3. PURE WHITE BACKGROUND (#FFFFFF). 
        4. Aesthetics: Elite, Expensive, Iconic.
        5. Strategy: ${userNotes}.`;
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
                { text: `Remix design: ${instruction}. Output isolated FLAT 2D GRAPHIC ARTWORK on PURE WHITE BACKGROUND.` }
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
