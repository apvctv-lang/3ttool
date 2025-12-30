
// @google/genai SDK implementation for product analysis and image generation.
import { GoogleGenAI, Type } from "@google/genai";
import { ProductAnalysis, DesignMode, RopeType, AppTab } from "../types";

/**
 * Hàm làm sạch chuỗi API Key, hỗ trợ trường hợp dán nhiều key cách nhau bởi dấu phẩy hoặc xuống dòng.
 */
const getCleanKey = (input: string | null | undefined): string => {
  if (!input) return "";
  const keys = input.split(/[\n\r,;]+/).map(k => k.trim()).filter(k => k.length > 20);
  if (keys.length === 0) return "";
  return keys[Math.floor(Math.random() * keys.length)];
};

// Implement and export validateToken to verify the provided API key(s) validity.
export const validateToken = async (apiKey: string): Promise<boolean> => {
  const cleanKey = getCleanKey(apiKey);
  if (!cleanKey) throw new Error("No valid key format detected.");
  const ai = new GoogleGenAI({ apiKey: cleanKey });
  try {
    await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: 'hi',
    });
    return true;
  } catch (err: any) {
    throw new Error(err.message || "Invalid API Key");
  }
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

/**
 * PHÂN TÍCH MẪU: Tự động nhận diện Text, Nhân vật (Character), và Cảnh (Scene)
 */
export const detectEditableElements = async (imageBase64: string): Promise<any[]> => {
    const ai = getClient();
    const prompt = `Phân tích hình ảnh sản phẩm và thực hiện các nhiệm vụ sau:
    1. Nhận diện tất cả các vùng chứa văn bản (text).
    2. Nhận diện tất cả các nhân vật, thực thể sống hoặc đồ vật chính mang tính biểu tượng (character).
    3. Nhận diện các vùng bối cảnh, môi trường hoặc nền trang trí (scene).
    
    Với mỗi phần tử tìm được, trả về:
    - type: 'text', 'character', hoặc 'scene'.
    - value: nội dung text hoặc mô tả ngắn gọn về nhân vật/cảnh.
    - box_2d: tọa độ khung bao [ymin, xmin, ymax, xmax] (0-1000).
    
    Trả về DUY NHẤT định dạng JSON.`;

    const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: {
            parts: [
                { inlineData: { mimeType: "image/png", data: stripBase64Prefix(imageBase64) } },
                { text: prompt }
            ]
        },
        config: { 
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    elements: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                type: { type: Type.STRING },
                                value: { type: Type.STRING },
                                box_2d: { 
                                    type: Type.ARRAY,
                                    items: { type: Type.NUMBER }
                                }
                            }
                        }
                    }
                }
            }
        }
    });

    try {
        const textOutput = response.text || "{\"elements\":[]}";
        const result = JSON.parse(textOutput.replace(/```json|```/g, "").trim());
        return result.elements || [];
    } catch (e) {
        return [];
    }
};

/**
 * CHẾ ĐỘ CHỈNH SỬA CẤU TRÚC (VIRTUAL TOOL MODE)
 * TUYỆT ĐỐI KHÔNG THAY ĐỔI VÙNG NGOÀI MASK. KHÔNG THÊM MOCKUP.
 */
export const selectiveAiEdit = async (baseImage: string, maskImage: string, prompt: string): Promise<string> => {
    const ai = getClient();
    
    const systemInstruction = `YOU ARE OPERATING IN A PRECISION IMAGE EDITING MODE.
YOUR TASK IS TO MODIFY ONLY THE PIXELS INDICATED BY THE WHITE AREAS IN THE PROVIDED MASK IMAGE.

RULES:
1. STRICT PIXEL PRESERVATION: All pixels outside the white mask region (where the mask is black) MUST remain 100% identical to the original base image.
2. NO NEW ELEMENTS: DO NOT add any mockups, backgrounds, shadows, or frames that were not in the original image.
3. STYLE MATCHING: Match the font, color, texture, and lighting of the surrounding pixels perfectly.
4. TARGET ONLY: Only change the content (text/number/character) specified in the command within the masked area.
5. PERSPECTIVE: Maintain the original perspective and warp of the element.
6. OUTPUT: Return exactly one PNG image. No conversation.`;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
            parts: [
                { inlineData: { mimeType: "image/png", data: stripBase64Prefix(baseImage) } },
                { inlineData: { mimeType: "image/png", data: stripBase64Prefix(maskImage) } },
                { text: `COMMAND: ${prompt}` }
            ]
        },
        config: { systemInstruction }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData && part.inlineData.data) {
            return `data:image/png;base64,${part.inlineData.data}`;
        }
    }
    throw new Error("AI Edit failed.");
};

/**
 * BOT TỰ ĐỘNG TÁCH NỀN VÀ DÂY TREO (QUY TRÌNH 6 BƯỚC)
 */
export const cleanupProductImage = async (imageBase64: string): Promise<string> => {
  const ai = getClient();
  const prompt = `HÃY THỰC HIỆN CÁC BƯỚC SAU:
  1. Nhận diện sản phẩm chính trong ảnh.
  2. XÓA BỎ HOÀN TOÀN nền và tất cả bối cảnh xung quanh.
  3. QUAN TRỌNG NHẤT: XÓA BỎ TOÀN BỘ dây treo, móc treo, sợi dây hoặc giá đỡ đang giữ sản phẩm.
  4. Chuyển nền sang TRẮNG TINH KHÔI (#FFFFFF).
  5. Đảm bảo sản phẩm sắc nét, không bị mất chi tiết ở viền (Anti-aliasing tốt).
  6. Trả về duy nhất 1 ảnh PNG chất lượng cao.`;

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

export const analyzeProductDesign = async (imageBase64: string, productType: string, designMode: DesignMode, activeTab: AppTab = AppTab.POD): Promise<ProductAnalysis> => {
    const ai = getClient();
    const prompt = activeTab === AppTab.TSHIRT 
        ? `Extract abstract design DNA from this T-Shirt. Return ONLY JSON.` 
        : `Analyze this POD design for reimaging. Return ONLY JSON.`;
    
    const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: {
          parts: [
              { inlineData: { mimeType: "image/png", data: stripBase64Prefix(imageBase64) } },
              { text: prompt }
          ]
        },
        config: { responseMimeType: "application/json" }
    });

    return JSON.parse(response.text?.replace(/```json\s*|\s*```/g, "").trim() || "{}");
};

export const generateProductRedesigns = async (basePrompt: string, ropeType: RopeType, selectedComponents: string[], userNotes: string, productType: string, useUltraFlag: boolean, activeTab: AppTab = AppTab.POD, originalImage?: string): Promise<string[]> => {
    const ai = getClient();
    const targetModel = activeTab === AppTab.TSHIRT ? 'gemini-2.5-flash-image' : 'gemini-3-pro-image-preview';
    const results: string[] = [];
    const count = activeTab === AppTab.TSHIRT ? 3 : 6;

    for(let i=0; i<count; i++) {
        await sleep(300);
        const response = await ai.models.generateContent({
            model: targetModel,
            contents: { 
                parts: [
                    ...(originalImage ? [{ inlineData: { mimeType: "image/png", data: stripBase64Prefix(originalImage) } }] : []),
                    { text: `${basePrompt}. Additional context: ${userNotes}` }
                ]
            }
        });
        for (const part of response.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData && part.inlineData.data) {
                results.push(`data:image/png;base64,${part.inlineData.data}`);
                break;
            }
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
                { text: instruction }
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
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
