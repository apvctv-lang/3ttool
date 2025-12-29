
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzqZAbafJK3QLPhk8DTDuaVyvkY4u_eiTN6xTQtLm8GyaPuezF4ATAErsKubkQHNCyY/exec";

interface ApiResponse {
  status: 'success' | 'error';
  message: string;
  user?: { 
    username: string;
    permissions?: string;
    systemKey?: string; 
  };
  users?: any[];
  data?: any;
  url?: string;
  base64?: string;
}

export const getPublicIP = async (): Promise<string> => {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    return data.ip;
  } catch (error) {
    console.warn("Could not fetch public IP", error);
    return "Unknown/Hidden";
  }
};

const callScript = async (payload: any, useKeepAlive = false): Promise<ApiResponse> => {
  if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL.includes("example-replace-this")) {
    return { status: 'error', message: 'Chưa cấu hình Backend URL.' };
  }

  try {
    const body = JSON.stringify(payload);
    const fetchOptions: RequestInit = {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8", 
      },
      body: body,
      mode: 'cors',
      cache: 'no-cache',
      redirect: 'follow',
    };

    if (useKeepAlive && body.length < 60000) {
      fetchOptions.keepalive = true;
    }

    const response = await fetch(GOOGLE_SCRIPT_URL, fetchOptions);

    if (!response.ok) {
        return { status: 'error', message: `HTTP Error: ${response.status}` };
    }

    const result = await response.json();
    return result;

  } catch (error: any) {
    console.error("API Call Failed", error);
    const msg = error.name === 'TypeError' && error.message === 'Failed to fetch' 
      ? 'Lỗi kết nối Server (CORS/Network). Vui lòng kiểm tra lại URL Apps Script hoặc kết nối mạng.'
      : error.message || 'Lỗi kết nối Server.';
    return { status: 'error', message: msg };
  }
};

export const getImageBase64 = async (url: string): Promise<string> => {
  const res = await callScript({ action: 'get_image_base64', url });
  if (res.status === 'success' && res.base64) return res.base64;
  throw new Error(res.message || "Failed to fetch image base64 via proxy");
};

export const registerUser = async (username: string, password: string): Promise<ApiResponse> => {
  const ip = await getPublicIP(); 
  return callScript({
    action: 'register',
    username,
    password,
    ip 
  });
};

export const loginUser = async (username: string, password: string): Promise<ApiResponse> => {
  const ip = await getPublicIP();
  try {
    localStorage.setItem('app_client_ip', ip);
  } catch (e) {
    console.warn("Could not cache IP");
  }

  return callScript({
    action: 'login',
    username,
    password,
    ip: ip 
  });
};

export const logoutUser = (username: string): void => {
    let ip = "Unknown";
    try {
        ip = localStorage.getItem('app_client_ip') || "Unknown";
    } catch (e) {}

    callScript({
        action: 'logout',
        username: username,
        ip: ip
    }, true).catch(err => console.warn("Logout beacon failed", err));
};

export const sendHeartbeat = async (username: string): Promise<void> => {
    const res = await callScript({
        action: 'heartbeat',
        username: username,
    });
    if (res.status === 'error') {
        throw new Error(res.message);
    }
};

export const saveSystemConfig = async (apiKey: string): Promise<ApiResponse> => {
  return callScript({
    action: 'save_config',
    apiKey
  });
};

export const getUsers = async (): Promise<ApiResponse> => {
  return callScript({
    action: 'get_users'
  });
};

export const updateUserPermission = async (targetUser: string, newPermission: string): Promise<ApiResponse> => {
  return callScript({
    action: 'update_permission',
    targetUser,
    newPermission
  });
};

export const sendDataToSheet = async (
  images: string[], 
  prompt: string,
  description: string,
  username: string,
  productType: string,
  similarity: string 
): Promise<void> => {
  const result = await callScript({
    action: 'log_design',
    username: username,
    images: images, 
    prompt: prompt,
    description: description,
    productType: productType,
    similarity: similarity 
  });
  
  if (result.status === 'error') {
      console.warn("Logging failed:", result.message);
  }
};

export const saveMockupToSheet = async (storeName: string, mockupName: string, imageBase64: string, username: string): Promise<ApiResponse> => {
  return callScript({
    action: 'save_mockup',
    storeName,
    mockupName,
    image: imageBase64,
    username
  });
};

export const getMockupsFromSheet = async (): Promise<ApiResponse> => {
  return callScript({
    action: 'get_mockups'
  });
};

export const saveFinalMockupResult = async (username: string, designName: string, imageBase64: string): Promise<ApiResponse> => {
  return callScript({
    action: 'log_final_mockup',
    username,
    designName,
    image: imageBase64
  });
};

export const getDesignsFromSheet = async (username: string, isAdmin: boolean): Promise<ApiResponse> => {
  return callScript({
    action: 'get_designs',
    username,
    isAdmin
  });
};
