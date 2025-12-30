
// @google/genai SDK implementation for product analysis and image generation.
import { GoogleGenAI } from "@google/genai";
import { ProductAnalysis, DesignMode, RopeType, AppTab } from "../types";

/**
 * Hàm làm sạch chuỗi API Key, hỗ trợ trường hợp dán nhiều key cách nhau bởi dấu phẩy hoặc xuống dòng.
 * Việc này ngăn chặn lỗi "Invalid value" trong Headers khi gửi request lên Google API.
 */
const getCleanKey = (input: string | null | undefined): string => {
  if (!input) return "";
  // Tách chuỗi theo xuống dòng, dấu phẩy, dấu chấm phẩy
  const keys = input.split(/[\n\r,;]+/).map(k => k.trim()).filter(k => k.length > 20);
  if (keys.length === 0) return "";
  // Chọn ngẫu nhiên một key trong danh sách để tận dụng quota (load balancing)
  return keys[Math.floor(Math.random() * keys.length)];
};

/**
 * Ưu tiên sử dụng API Key từ cấu hình Admin nếu có.
 */
const getClient = () => {
  const systemKey = localStorage.getItem('app_system_key');
  const envKey = process.env.API_KEY;
  
  // Xử lý làm sạch key (loại bỏ xuống dòng gây lỗi Headers)
  const finalKey = getCleanKey(systemKey || envKey);
  
  return new GoogleGenAI({ apiKey: finalKey });
};

const stripBase64Prefix = (base64: string) => {
  return base64.replace(/^data:image\/[a-z]+;base64,/, "");
};

/**
 * Helper to convert a remote URL to Base64 avoiding CORS issues where possible using Image objects.
 * CẬP NHẬT: Luôn sử dụng image/png để bảo toàn Alpha channel.
 */
const urlToBase64 = async (url: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject("Could not create canvas context");
        return;
      }
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/png")); // Luôn dùng PNG
    };
    img.onerror = () => {
      if (url.includes("drive.google.com")) {
          const newUrl = url.includes("&sz=") ? url.replace(/sz=w\d+/, "sz=w1001") : url; 
          if(newUrl !== url) {
              img.src = newUrl;
              return;
          }
      }
      reject(`Failed to load image at ${url}`);
    };
  });
};

export const cleanJsonString = (text: string) => {
    return text.replace(/```json\s*|\s*```/g, "").trim();
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const setKeyPools = (keys: string[]) => {
  console.debug("External key management is disabled. Key is handled via Admin System Settings.");
};

export const validateToken = async (tokenInput?: string): Promise<boolean> => {
  try {
    // Làm sạch tokenInput nếu có nhiều key được dán vào ô test
    const keyToValidate = tokenInput ? getCleanKey(tokenInput) : "";
    const ai = keyToValidate ? new GoogleGenAI({ apiKey: keyToValidate }) : getClient();
    
    await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: "Connectivity test.",
    });
    return true;
  } catch (err: any) {
    console.error("Gemini API connection failed:", err);
    throw err;
  }
};

/**
 * Chức năng xóa nền: Đảm bảo trả về PNG trong suốt (Alpha channel).
 */
export const cleanupProductImage = async (imageBase64: string): Promise<string> => {
  const ai = getClient();
  const prompt = `Task: Professional Background Removal.
  1. Detect the main subject/artwork.
  2. Remove ALL surrounding background, supporting elements, wires, and shadows.
  3. IMPORTANT: The output MUST be a TRANSPARENT PNG with an ALPHA CHANNEL (void pixels).
  4. DO NOT fill with white, gray, or any solid color.
  5. Remove any simulated checkerboard patterns.
  6. Output the isolated graphic only.`;

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
    const activeModel = 'gemini-3-pro-preview';

    let prompt = "";
    if (activeTab === AppTab.TSHIRT) {
        prompt = `You are a senior fashion designer specializing in T-Shirt brand systems.
        Your task is to extract abstract design DNA from this T-Shirt.
        
        MANDATORY PROCESS:
        1. Analyze the original T-Shirt ONLY to extract abstract design DNA.
           Do NOT remember or reuse any concrete visuals, layouts, graphics, typography, or symbols.
        2. Translate the DNA into 5–7 reusable design principles (abstract and brand-level).
        
        Return ONLY JSON: 
        { 
          "description": "Abstract Brand Character & DNA Summary", 
          "designCritique": "List the 5-7 reusable design principles extracted", 
          "detectedComponents": ["Abstract DNA tags"], 
          "redesignPrompt": "Strategic brief for a completely NEW, original T-Shirt using ONLY the principles above. Must feel like the same brand but look clearly different at first glance." 
        }`;
    } else {
        prompt = `Analyze this POD design. Return ONLY JSON: 
        { "description": "short description", "designCritique": "critique", "detectedComponents": ["list"], "redesignPrompt": "isolated design on white background, high quality" }`;
    }
    
    const response = await ai.models.generateContent({
        model: activeModel,
        contents: {
          parts: [
              { inlineData: { mimeType: "image/png", data: stripBase64Prefix(imageBase64) } },
              { text: prompt }
          ]
        },
        config: { responseMimeType: "application/json" }
    });

    const text = response.text || "{}";
    const rawResult = JSON.parse(cleanJsonString(text));

    return { 
        description: rawResult.description || "No description.", 
        designCritique: typeof rawResult.designCritique === 'string' ? rawResult.designCritique : JSON.stringify(rawResult.designCritique), 
        detectedComponents: Array.isArray(rawResult.detectedComponents) ? rawResult.detectedComponents : [],
        redesignPrompt: rawResult.redesignPrompt || ""
    };
};

export const extractDesignElements = async (imageBase64: string): Promise<string[]> => [];

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
    
    let finalPrompt = "";
    let targetModel = 'gemini-3-pro-image-preview';
    let targetConfig: any = { imageConfig: { imageSize: '2K', aspectRatio: '1:1' } };

    if (activeTab === AppTab.TSHIRT) {
        targetModel = 'gemini-2.5-flash-image';
        targetConfig = { imageConfig: { aspectRatio: '1:1' } };
        finalPrompt = `You are a senior fashion designer. 
        Your task is NOT to redesign the same shirt.
        Your task is to design a completely NEW T-Shirt using ONLY these abstract principles: ${basePrompt}.
        
        MANDATORY REQUIREMENTS:
        - Design a NEW, original T-Shirt belonging to the same brand philosophy.
        - Must look clearly DIFFERENT at first glance from the original.
        - NOT a variation, remix, or evolution.
        - Focus on message and emotion first, graphics second.
        - If any element feels visually close to the original, discard it.
        - Strictly isolated graphic, NULL TRANSPARENT void background, no mockup, no hangers.
        - Note: ${userNotes}`;
    } else {
        finalPrompt = `Isolated design graphic on PURE WHITE background. Subject: ${basePrompt}. ${userNotes}`;
    }
    
    const count = activeTab === AppTab.TSHIRT ? 3 : 6;
    const results: string[] = [];

    for(let i=0; i<count; i++) {
        await sleep(500); 
        try {
            const ai = getClient();
            const response = await ai.models.generateContent({
                model: targetModel,
                contents: { 
                    parts: [
                        ...(originalImage ? [{ inlineData: { mimeType: "image/png", data: stripBase64Prefix(originalImage) } }] : []),
                        { text: finalPrompt }
                    ]
                },
                config: targetConfig
            });
            for (const part of response.candidates?.[0]?.content?.parts || []) {
                if (part.inlineData && part.inlineData.data) {
                    let base64 = `data:image/png;base64,${part.inlineData.data}`;
                    if (activeTab === AppTab.TSHIRT) {
                        try { base64 = await cleanupProductImage(base64); } catch (e) {}
                    }
                    results.push(base64);
                    break;
                }
            }
        } catch (err: any) {
             console.warn("Generation error:", err);
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
                { text: `Remix design: ${instruction}. STRICTLY transparent background PNG.` }
            ]
        }
    });
    for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData && part.inlineData.data) {
            return await cleanupProductImage(`data:image/png;base64,${part.inlineData.data}`);
        }
    }
    throw new Error("Remix failed.");
};

export const applyDesignToMockupTemplate = async (designBase64: string, mockupTemplateUrl: string): Promise<string> => {
    const ai = getClient();
    const templateBase64 = await urlToBase64(mockupTemplateUrl);
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
            parts: [
                { inlineData: { mimeType: "image/png", data: stripBase64Prefix(designBase64) } },
                { inlineData: { mimeType: "image/png", data: stripBase64Prefix(templateBase64) } },
                { text: "Map graphic to product center naturally." }
            ]
        }
    });
    for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData && part.inlineData.data) return `data:image/png;base64,${part.inlineData.data}`;
    }
    throw new Error("Failed to apply design.");
};

export const detectAndSplitCharacters = async (imageBase64: string): Promise<string[]> => [];
export const generateRandomMockup = async (imageBase64: string): Promise<string> => imageBase64; 
export const generateSmartMockup = async (imageBase64: string): Promise<string> => imageBase64;
export const generateSmartMockupBatch = async (imageBase64: string): Promise<string[]> => [];
