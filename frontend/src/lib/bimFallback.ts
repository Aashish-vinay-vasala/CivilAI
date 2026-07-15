import axios from "axios";

export interface FallbackModelMeta {
  id: string;
  name: string;
  description: string;
  category: string;
  total_elements: number;
  storeys: number;
}

export const LARGEST_FALLBACK_ID = "riverside-residential-complex";

const API = process.env.NEXT_PUBLIC_API_URL;

export async function fetchFallbackModelList(): Promise<FallbackModelMeta[]> {
  const res = await axios.get(`${API}/api/v1/bim/fallback-models`);
  return res.data.models || [];
}

export async function fetchFallbackModel(id: string): Promise<{ bim_data: any; meshes: any[] }> {
  const res = await axios.get(`${API}/api/v1/bim/fallback-models/${id}`);
  return { bim_data: res.data.bim_data, meshes: res.data.meshes || [] };
}

export function fallbackDownloadUrl(id: string): string {
  return `${API}/api/v1/bim/fallback-models/${id}/download`;
}

export function projectModelDownloadUrl(projectId: string): string {
  return `${API}/api/v1/bim/project/${projectId}/model/download`;
}

export function modelDownloadUrl(modelId: string): string {
  return `${API}/api/v1/bim/model/${modelId}/download`;
}

export async function downloadBlobFromUrl(url: string, filename: string): Promise<void> {
  const res = await axios.get(url, { responseType: "blob" });
  const blob = res.data as Blob;
  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objUrl;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(objUrl);
}

export function formatFileSize(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function deleteModel(modelId: string): Promise<void> {
  return axios.delete(`${API}/api/v1/bim/model/${modelId}`);
}

export function deleteProjectModelHistory(projectId: string): Promise<void> {
  return axios.delete(`${API}/api/v1/bim/project/${projectId}/models`);
}
