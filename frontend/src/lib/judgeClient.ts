// Shared network layer for the LLM Judge backend (backend/app/api/v1/routes/judge.py).
// Auth is attached automatically by the axios interceptor installed in auth.tsx
// (axiosAuthInterceptor.ts) — plain axios.get/post calls need no manual headers.

import axios from "axios";

const API = process.env.NEXT_PUBLIC_API_URL ?? "";

export interface RubricSummary {
  name: string;
  description: string;
  criteria_count: number;
}

export interface CriterionScore {
  name: string;
  score: number;
  reasoning: string;
}

export interface JudgeVerdict {
  overall_score: number;
  passed: boolean;
  criteria: CriterionScore[];
  summary: string;
  degraded: boolean;
}

export interface ComparisonVerdict {
  winner: "a" | "b" | "tie";
  score_a: number;
  score_b: number;
  reasoning: string;
  degraded: boolean;
}

export interface JudgeHealth {
  status: string;
  judge_model: string;
  hf_token_configured: boolean;
  rubric_count: number;
}

export interface BatchItemInput {
  id: string;
  output: string;
  context?: string;
}

export interface BatchResultItem {
  id: string;
  verdict: JudgeVerdict;
}

export interface BatchSummary {
  count: number;
  avg_score: number;
  pass_rate: number;
  degraded_count: number;
  worst: BatchResultItem[];
}

export interface BatchResponse {
  rubric: string;
  results: BatchResultItem[];
  summary: BatchSummary;
}

export async function listRubrics(): Promise<RubricSummary[]> {
  const res = await axios.get(`${API}/api/v1/judge/rubrics`);
  return res.data.rubrics ?? [];
}

export async function getJudgeHealth(): Promise<JudgeHealth> {
  const res = await axios.get(`${API}/api/v1/judge/health`);
  return res.data;
}

export async function scoreOutput(rubric: string, output: string, context?: string): Promise<JudgeVerdict> {
  const res = await axios.post(`${API}/api/v1/judge/score`, { rubric, output, context: context || undefined });
  return res.data;
}

export async function compareOutputs(
  rubric: string, outputA: string, outputB: string, context?: string,
): Promise<ComparisonVerdict> {
  const res = await axios.post(`${API}/api/v1/judge/compare`, {
    rubric, output_a: outputA, output_b: outputB, context: context || undefined,
  });
  return res.data;
}

export async function batchScore(rubric: string, items: BatchItemInput[]): Promise<BatchResponse> {
  const res = await axios.post(`${API}/api/v1/judge/batch`, { rubric, items });
  return res.data;
}
