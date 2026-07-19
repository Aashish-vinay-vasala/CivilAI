"""
Human-calibration workflow for the LLM-as-judge system (app/ai/hf_judge_client.py).

An LLM judge left unchecked can drift from what humans actually value. This
script pulls a random sample of already-judged items into a CSV for a human
to blind-score, then compares human vs. judge scores to catch that drift.

Usage:
  1. Score a batch via POST /api/v1/judge/batch, save the JSON response.
  2. python scripts/judge_calibration.py sample judged.json --out calibration.csv --n 20
  3. Open calibration.csv, fill in the blank `human_score` (0-10) column
     WITHOUT looking at the judge_overall_score column first (blind scoring —
     open the CSV in a tool that lets you hide that column, or have someone
     else fill it in from a version with that column stripped).
  4. python scripts/judge_calibration.py agreement calibration.csv

Run periodically (e.g. monthly, or after changing a rubric/judge model) —
see shared/model-migration.md-style guidance: recalibrate whenever the
judge or the thing it's judging changes, not just once.
"""
import argparse
import csv
import json
import random
import sys
from pathlib import Path

_TRUNCATE_CHARS = 500


def _truncate(text: str | None, n: int = _TRUNCATE_CHARS) -> str:
    if not text:
        return ""
    return text if len(text) <= n else text[:n] + "…"


def sample_for_calibration(judged_batch: dict, n: int, out_csv: Path) -> int:
    """
    judged_batch is the JSON body returned by POST /api/v1/judge/batch:
    {"rubric": str, "results": [{"id": str, "verdict": {...}}], "summary": {...}}

    Returns the number of rows written.
    """
    results = judged_batch.get("results", [])
    if not results:
        raise ValueError("No results found in the judged batch JSON")

    sample = random.sample(results, k=min(n, len(results)))

    fieldnames = [
        "id", "rubric", "judge_overall_score", "judge_passed", "judge_summary",
        "human_score", "human_notes",
    ]
    with out_csv.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for item in sample:
            verdict = item.get("verdict", {})
            writer.writerow({
                "id": item.get("id", ""),
                "rubric": judged_batch.get("rubric", ""),
                "judge_overall_score": verdict.get("overall_score", ""),
                "judge_passed": verdict.get("passed", ""),
                "judge_summary": _truncate(verdict.get("summary")),
                "human_score": "",   # blank — fill in by hand, 0-10
                "human_notes": "",   # blank — optional free text
            })
    return len(sample)


def _pearson(xs: list[float], ys: list[float]) -> float | None:
    n = len(xs)
    if n < 2:
        return None
    mean_x, mean_y = sum(xs) / n, sum(ys) / n
    cov = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys))
    var_x = sum((x - mean_x) ** 2 for x in xs)
    var_y = sum((y - mean_y) ** 2 for y in ys)
    denom = (var_x * var_y) ** 0.5
    return cov / denom if denom else None


def compute_agreement(csv_path: Path) -> dict:
    judge_scores: list[float] = []
    human_scores: list[float] = []
    skipped = 0

    with csv_path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            human_raw = (row.get("human_score") or "").strip()
            judge_raw = (row.get("judge_overall_score") or "").strip()
            if not human_raw or not judge_raw:
                skipped += 1
                continue
            try:
                human_scores.append(float(human_raw))
                judge_scores.append(float(judge_raw))
            except ValueError:
                skipped += 1

    if not judge_scores:
        return {"error": "No rows with both judge and human scores filled in.", "skipped": skipped}

    diffs = [abs(j - h) for j, h in zip(judge_scores, human_scores)]
    mean_abs_diff = sum(diffs) / len(diffs)
    correlation = _pearson(judge_scores, human_scores)

    return {
        "scored_pairs": len(judge_scores),
        "skipped_rows": skipped,
        "mean_absolute_diff": round(mean_abs_diff, 3),
        "pearson_correlation": round(correlation, 3) if correlation is not None else None,
        "max_diff": round(max(diffs), 3),
        "verdict": _agreement_verdict(mean_abs_diff, correlation),
    }


def _agreement_verdict(mean_abs_diff: float, correlation: float | None) -> str:
    if mean_abs_diff <= 1.0 and (correlation is None or correlation >= 0.7):
        return "Good agreement — judge tracks human scoring closely."
    if mean_abs_diff <= 2.0:
        return "Moderate agreement — spot-check the rubric wording and the worst-diverging rows."
    return "Poor agreement — the judge is drifting from human judgment. Revise the rubric or switch judge model before trusting batch results."


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    p_sample = sub.add_parser("sample", help="Sample judged items into a CSV for human scoring")
    p_sample.add_argument("judged_json", type=Path, help="Path to a saved POST /judge/batch response")
    p_sample.add_argument("--out", type=Path, default=Path("calibration.csv"))
    p_sample.add_argument("--n", type=int, default=20)

    p_agree = sub.add_parser("agreement", help="Compute judge-vs-human agreement from a filled CSV")
    p_agree.add_argument("csv_path", type=Path)

    args = parser.parse_args()

    if args.command == "sample":
        if not args.judged_json.exists():
            print(f"File not found: {args.judged_json}", file=sys.stderr)
            sys.exit(1)
        batch = json.loads(args.judged_json.read_text(encoding="utf-8"))
        count = sample_for_calibration(batch, args.n, args.out)
        print(f"Wrote {count} rows to {args.out}. Fill in human_score (0-10) for each, then run:")
        print(f"  python {Path(__file__).name} agreement {args.out}")

    elif args.command == "agreement":
        if not args.csv_path.exists():
            print(f"File not found: {args.csv_path}", file=sys.stderr)
            sys.exit(1)
        result = compute_agreement(args.csv_path)
        print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
